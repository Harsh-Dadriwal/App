import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { SupabaseAdminService } from "../supabase/supabase-admin.service";
import type { AuthenticatedRequest } from "./authenticated-request";

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token.");
    }

    const token = authHeader.slice("Bearer ".length);
    const supabase = this.supabaseAdmin.getClient();
    const userResult = await supabase.auth.getUser(token);

    if (userResult.error || !userResult.data.user) {
      throw new UnauthorizedException(userResult.error?.message ?? "Invalid auth token.");
    }

    const profileResult = await supabase
      .from("users")
      .select("id, role, default_tenant_id")
      .eq("auth_user_id", userResult.data.user.id)
      .maybeSingle();

    request.actor = {
      authUserId: userResult.data.user.id,
      appUserId: profileResult.data?.id ?? null,
      role: profileResult.data?.role ?? null,
      defaultTenantId: profileResult.data?.default_tenant_id ?? null
    };

    return true;
  }
}
