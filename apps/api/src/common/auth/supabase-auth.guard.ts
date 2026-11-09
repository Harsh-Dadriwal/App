import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { SupabaseAdminService } from "../supabase/supabase-admin.service";
import type { AuthenticatedRequest } from "./authenticated-request";
import type { RequestActor } from "./auth.types";
import { SupabaseJwtVerifier } from "./jwt-verifier";

/** Profile columns the app shows, read once here so `/me/profile` needs no second query. */
export const ACTOR_PROFILE_COLUMNS =
  "id, auth_user_id, default_tenant_id, username, full_name, email, phone, role, city, state, company_name, verification_status, is_admin_verified";

const ACTOR_TTL_MS = 30_000;
const ACTOR_CACHE_LIMIT = 500;

type CachedActor = { actor: RequestActor; expiresAt: number };

const actorCache = new Map<string, CachedActor>();

/** Forget a person's cached profile, e.g. right after their default workspace changes. */
export function invalidateActorCache(authUserId?: string) {
  if (authUserId) actorCache.delete(authUserId);
  else actorCache.clear();
}

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly verifier: SupabaseJwtVerifier;

  constructor(private readonly supabaseAdmin: SupabaseAdminService) {
    this.verifier = new SupabaseJwtVerifier(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    );
  }

  private async resolveAuthUserId(token: string) {
    const claims = await this.verifier.verify(token);
    if (claims) return claims.sub;

    // Symmetric-key tokens (or a key we cannot find): let Supabase Auth check it.
    const userResult = await this.supabaseAdmin.getClient().auth.getUser(token);
    if (userResult.error || !userResult.data.user) {
      throw new UnauthorizedException(userResult.error?.message ?? "Invalid auth token.");
    }
    return userResult.data.user.id;
  }

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Please sign in to continue.");
    }

    const token = authHeader.slice("Bearer ".length);
    const authUserId = await this.resolveAuthUserId(token);

    const cached = actorCache.get(authUserId);
    if (cached && cached.expiresAt > Date.now()) {
      request.actor = cached.actor;
      return true;
    }

    const profileResult = await this.supabaseAdmin
      .getClient()
      .from("users")
      .select(ACTOR_PROFILE_COLUMNS)
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    const profile = (profileResult.data ?? null) as Record<string, any> | null;
    const actor: RequestActor = {
      authUserId,
      appUserId: profile?.id ?? null,
      role: profile?.role ?? null,
      defaultTenantId: profile?.default_tenant_id ?? null,
      profile
    };

    // Only remember people who have a profile, so a just-created account is picked up at once.
    if (profile) {
      if (actorCache.size >= ACTOR_CACHE_LIMIT) actorCache.clear();
      actorCache.set(authUserId, { actor, expiresAt: Date.now() + ACTOR_TTL_MS });
    }

    request.actor = actor;
    return true;
  }
}
