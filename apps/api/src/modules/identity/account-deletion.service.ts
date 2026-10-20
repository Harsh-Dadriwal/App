import { ForbiddenException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import type { RequestActor } from "../../common/auth/auth.types";
import { SupabaseAdminService } from "../../common/supabase/supabase-admin.service";
import { QuotationPhotosService } from "../quotations/quotation-photos.service";

/**
 * Deletes a person's account on their request (Google Play requires this in the app and
 * on the web). The sign-in is removed, so the phone number and email are free again, and
 * the profile is wiped of personal details. Orders, payments and invoices stay, without
 * personal details, because tax law requires keeping them (see the privacy policy).
 */
@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly photos: QuotationPhotosService
  ) {}

  private get db() {
    return this.supabaseAdmin.getClient();
  }

  async deleteMyAccount(actor: RequestActor) {
    if (!actor.appUserId) throw new UnauthorizedException("Your profile could not be found. Please sign in again.");
    const role = (actor.role ?? "").toLowerCase();
    // The shop's own admin accounts are closed by the business, not from the app.
    if (role === "admin" || role === "tenant_admin") {
      throw new ForbiddenException("Shop admin accounts cannot be deleted from the app. Please contact the business owner.");
    }
    const userId = actor.appUserId;

    // Requirement-list photos may show names and addresses: remove them first.
    const memberships = await this.db.from("tenant_memberships").select("tenant_id").eq("user_id", userId);
    for (const row of memberships.data ?? []) {
      try {
        await this.photos.deleteOwnerPhotos(row.tenant_id as string, userId);
      } catch (error) {
        this.logger.warn(`Could not delete photos for ${userId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    await this.db.from("quotations").update({ photo_keys: [] }).eq("customer_id", userId);
    await this.db.from("push_tokens").delete().eq("user_id", userId);
    await this.db.from("tenant_memberships").update({ is_active: false }).eq("user_id", userId);

    // Remove the sign-in itself. The profile row stays (orders point at it) but is unlinked.
    if (actor.authUserId) {
      const removed = await this.db.auth.admin.deleteUser(actor.authUserId);
      if (removed.error && !/not found/i.test(removed.error.message)) throw new Error(removed.error.message);
    }

    const wiped = await this.db
      .from("users")
      .update({
        full_name: "Deleted user",
        username: `deleted_${userId.replace(/-/g, "").slice(0, 12)}`,
        phone: null,
        email: null,
        password_hash: null,
        company_name: null,
        gst_number: null,
        address_line1: null,
        address_line2: null,
        city: null,
        state: null,
        postal_code: null,
        profile_photo_url: null,
        notes: null,
        auth_user_id: null,
        status: "inactive",
        updated_at: new Date().toISOString()
      })
      .eq("id", userId);
    if (wiped.error) throw new Error(wiped.error.message);

    this.logger.log(`Account ${userId} deleted at the person's request.`);
    return { deleted: true };
  }
}
