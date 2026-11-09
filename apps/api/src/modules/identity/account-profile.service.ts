import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { SupabaseAdminService } from "../../common/supabase/supabase-admin.service";
import type { RequestActor } from "../../common/auth/auth.types";
import { ACTOR_PROFILE_COLUMNS, invalidateActorCache } from "../../common/auth/supabase-auth.guard";
import { PhoneAuthService, toE164 } from "./phone-auth.service";

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

const digitsOf = (value: string | null | undefined) => (value ?? "").replace(/[^0-9]/g, "");

/**
 * What a signed-in person may change about themselves. Name, username, city, state and
 * company are plain edits; a mobile number is only saved after a code texted to it is
 * entered. Role, verification, credit and the like are never touched here.
 */
@Injectable()
export class AccountProfileService {
  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly phoneAuth: PhoneAuthService
  ) {}

  private requireProfile(actor: RequestActor) {
    if (!actor.appUserId) {
      throw new UnauthorizedException("Your profile could not be found. Please sign in again.");
    }
    return actor.appUserId;
  }

  /** Body: any of { full_name, username, company_name, city, state }. Only the keys sent change. */
  async updateProfile(actor: RequestActor, body: Record<string, unknown>) {
    const userId = this.requireProfile(actor);
    const db = this.supabaseAdmin.getClient();
    const changes: Record<string, string | null> = {};

    if ("full_name" in body) {
      const fullName = text(body.full_name, 150);
      if (fullName.length < 2) throw new BadRequestException("Enter your full name.");
      changes.full_name = fullName;
    }

    if ("username" in body) {
      const username = text(body.username, 24).toLowerCase().replace(/[^a-z0-9._]/g, "");
      if (username.length < 3) throw new BadRequestException("Choose a username with at least 3 letters or numbers.");
      const taken = await db.from("users").select("id").ilike("username", username).neq("id", userId).limit(1);
      if (taken.error) throw new Error(taken.error.message);
      if (taken.data?.length) throw new BadRequestException("This username is already taken. Please choose another one.");
      changes.username = username;
    }

    for (const [key, max] of [["company_name", 150], ["city", 100], ["state", 100]] as const) {
      if (key in body) changes[key] = text(body[key], max) || null;
    }

    if (!Object.keys(changes).length) throw new BadRequestException("There is nothing to save.");

    const updated = await db.from("users").update(changes).eq("id", userId).select(ACTOR_PROFILE_COLUMNS).maybeSingle();
    if (updated.error) {
      if (updated.error.code === "23505") throw new BadRequestException("This username is already taken. Please choose another one.");
      throw new BadRequestException("We could not save your details right now. Please try again.");
    }

    // Sign-in keeps its own copy of name and username and copies it back onto the profile
    // whenever the person logs in, so the two must change together.
    if (changes.full_name !== undefined || changes.username !== undefined) {
      const authUser = await db.auth.admin.getUserById(actor.authUserId);
      if (!authUser.error && authUser.data.user) {
        const metadata = { ...(authUser.data.user.user_metadata ?? {}) };
        if (changes.full_name !== undefined) metadata.full_name = changes.full_name;
        if (changes.username !== undefined) metadata.username = changes.username;
        await db.auth.admin.updateUserById(actor.authUserId, { user_metadata: metadata });
      }
    }

    invalidateActorCache(actor.authUserId);
    return updated.data;
  }

  private async isUsedByAnotherAccount(userId: string, phone: string) {
    const digits = phone.slice(1);
    const result = await this.supabaseAdmin.getClient().from("users").select("id").in("phone", [phone, digits]).neq("id", userId).limit(1);
    if (result.error) throw new Error(result.error.message);
    return Boolean(result.data?.length);
  }

  /** Texts a code to a number the person wants to add or switch to. Body: { phone } */
  async sendPhoneCode(actor: RequestActor, rawPhone: unknown) {
    const userId = this.requireProfile(actor);
    const phone = toE164(rawPhone);
    if (!phone) throw new BadRequestException("Enter a valid mobile number, e.g. 98765 43210.");
    if (await this.isUsedByAnotherAccount(userId, phone)) {
      throw new BadRequestException("This mobile number is already linked to another account.");
    }
    return this.phoneAuth.sendCode(phone);
  }

  /** Saves the number once the texted code is right. Body: { phone, code } */
  async verifyPhone(actor: RequestActor, rawPhone: unknown, rawCode: unknown) {
    const userId = this.requireProfile(actor);
    const phone = toE164(rawPhone);
    const code = typeof rawCode === "string" ? rawCode.replace(/\D/g, "") : "";
    if (!phone || code.length !== 6) throw new BadRequestException("Enter the 6-digit code from the SMS.");

    await this.phoneAuth.consumeCode(phone, code);
    // Checked again after the code, in case another account took the number meanwhile.
    if (await this.isUsedByAnotherAccount(userId, phone)) {
      throw new BadRequestException("This mobile number is already linked to another account.");
    }

    const db = this.supabaseAdmin.getClient();
    const digits = phone.slice(1);
    // The sign-in side is what lets this number log in; it copies the number onto the profile.
    const authUpdate = await db.auth.admin.updateUserById(actor.authUserId, { phone: digits, phone_confirm: true });
    if (authUpdate.error) {
      throw new BadRequestException("We could not save your number right now. Please try again.");
    }

    const profile = await db.from("users").select("phone").eq("id", userId).maybeSingle();
    if (digitsOf(profile.data?.phone) !== digits) {
      const saved = await db.from("users").update({ phone: `+${digits}` }).eq("id", userId);
      if (saved.error) throw new BadRequestException("We could not save your number right now. Please try again.");
    }

    invalidateActorCache(actor.authUserId);
    return { phone: `+${digits}` };
  }
}
