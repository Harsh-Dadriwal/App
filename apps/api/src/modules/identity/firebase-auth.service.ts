import { Injectable, UnauthorizedException, BadRequestException } from "@nestjs/common";
import { SupabaseAdminService } from "../../common/supabase/supabase-admin.service";
import * as https from "https";
import * as jwt from "jsonwebtoken";

const GOOGLE_CERT_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

// Simple in-memory cache so we don't fetch keys on every request
let cachedKeys: Record<string, string> | null = null;
let cacheExpiry = 0;

async function fetchGooglePublicKeys(): Promise<Record<string, string>> {
  if (cachedKeys && Date.now() < cacheExpiry) {
    return cachedKeys;
  }

  return new Promise((resolve, reject) => {
    https
      .get(GOOGLE_CERT_URL, (res) => {
        let data = "";
        res.on("data", (chunk: string) => (data += chunk));
        res.on("end", () => {
          try {
            cachedKeys = JSON.parse(data) as Record<string, string>;
            // Cache for 1 hour
            cacheExpiry = Date.now() + 60 * 60 * 1000;
            resolve(cachedKeys);
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

async function verifyFirebaseIdToken(
  idToken: string,
  projectId: string
): Promise<{ phone_number?: string; uid: string }> {
  // Decode the header to get the key ID (kid)
  const parts = idToken.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format.");
  }

  let header: { kid?: string; alg?: string };
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  } catch {
    throw new Error("Could not decode JWT header.");
  }

  if (!header.kid) {
    throw new Error("No 'kid' field in Firebase JWT header.");
  }

  const keys = await fetchGooglePublicKeys();
  const publicKey = keys[header.kid];

  if (!publicKey) {
    throw new Error(`No matching public key for kid: ${header.kid}. Try again after a short delay.`);
  }

  const decoded = jwt.verify(idToken, publicKey, {
    algorithms: ["RS256"],
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`
  }) as { sub: string; phone_number?: string };

  return { uid: decoded.sub, phone_number: decoded.phone_number };
}

export type SignupProfile = { full_name?: unknown; username?: unknown; role?: unknown };

/** Roles a new user may pick when signing up by phone; anything else becomes a customer. */
const SIGNUP_ROLES = ["customer", "electrician", "architect"];

/** Internal-only address used to issue sessions for phone-only accounts; never emailed. */
const PHONE_LOGIN_EMAIL_DOMAIN = "phone.mahalaxmi-electricals.app";

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

// Wrapper helper to allow clean unit test mocking without complex module overriding
export const firebaseAdminWrapper = {
  verifyIdToken: (idToken: string) => {
    const projectId = process.env.FIREBASE_PROJECT_ID || "";
    return verifyFirebaseIdToken(idToken, projectId);
  }
};

@Injectable()
export class FirebaseAuthService {
  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  async verifyFirebaseToken(idToken: string): Promise<string> {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    if (!projectId) {
      throw new UnauthorizedException("Sign-in is temporarily unavailable. Please try again shortly.");
    }

    try {
      const decodedToken = await firebaseAdminWrapper.verifyIdToken(idToken);
      if (!decodedToken.phone_number) {
        throw new Error("Token verification succeeded, but no phone number was found in the token.");
      }
      return decodedToken.phone_number;
    } catch (err) {
      throw new UnauthorizedException(
        err instanceof Error ? err.message : "Firebase ID Token verification failed."
      );
    }
  }

  /**
   * Turns a verified Firebase phone sign-in into a real Supabase session (with a working
   * refresh token), creating the account on first sign-in.
   *
   * The session is issued by Supabase itself: the API asks for a one-time magic-link token
   * for the user's email and redeems it straight away, so no email is ever sent and no JWT
   * secret is needed. Phone-only accounts get an internal placeholder address for this,
   * which is kept off their visible profile.
   */
  async exchangeFirebaseTokenForSupabaseSession(idToken: string, signup?: SignupProfile) {
    const phone = await this.verifyFirebaseToken(idToken);
    const digits = phone.replace(/[^0-9]/g, "");
    if (digits.length < 8) {
      throw new BadRequestException("This phone number could not be used. Please try again.");
    }
    const admin = this.supabaseAdmin.getClient();

    // Profiles may store the number with or without "+"; Supabase Auth stores it without.
    const profileLookup = await admin
      .from("users")
      .select("id, auth_user_id")
      .in("phone", [`+${digits}`, digits])
      .limit(1)
      .maybeSingle();
    if (profileLookup.error) {
      throw new BadRequestException("We could not sign you in right now. Please try again.");
    }
    const profile = profileLookup.data as { id: string; auth_user_id: string | null } | null;

    let authUserId = profile?.auth_user_id ?? (await this.findAuthUserIdByPhone(digits));
    let isNewUser = false;

    if (!authUserId) {
      const role = SIGNUP_ROLES.includes(String(signup?.role)) ? String(signup?.role) : "customer";
      const fullName = cleanText(signup?.full_name, 150) || `Customer ${digits.slice(-4)}`;
      const username = cleanText(signup?.username, 24).toLowerCase().replace(/[^a-z0-9._]/g, "");
      const created = await admin.auth.admin.createUser({
        phone: digits,
        phone_confirm: true,
        user_metadata: { role, full_name: fullName, phone: `+${digits}`, ...(username ? { username } : {}) }
      });
      if (created.error || !created.data.user) {
        throw new BadRequestException("We could not create your account right now. Please try again.");
      }
      authUserId = created.data.user.id;
      isNewUser = true;
    }

    if (profile && !profile.auth_user_id) {
      const linked = await admin.from("users").update({ auth_user_id: authUserId }).eq("id", profile.id);
      if (linked.error) {
        throw new BadRequestException("We could not sign you in right now. Please try again.");
      }
    }

    const authUser = await admin.auth.admin.getUserById(authUserId);
    if (authUser.error || !authUser.data.user) {
      throw new BadRequestException("We could not sign you in right now. Please try again.");
    }

    let email = authUser.data.user.email ?? "";
    if (!email) {
      email = `${digits}@${PHONE_LOGIN_EMAIL_DOMAIN}`;
      const updated = await admin.auth.admin.updateUserById(authUserId, { email, email_confirm: true });
      if (updated.error) {
        throw new BadRequestException("We could not sign you in right now. Please try again.");
      }
      // The auth -> profile sync trigger copies email changes; keep the placeholder off the profile.
      await admin.from("users").update({ email: null }).eq("auth_user_id", authUserId).eq("email", email);
    }

    const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const tokenHash = link.data?.properties?.hashed_token;
    if (link.error || !tokenHash) {
      throw new BadRequestException("We could not sign you in right now. Please try again.");
    }

    const verified = await this.supabaseAdmin.createAnonClient().auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
    const session = verified.data?.session;
    if (verified.error || !session) {
      throw new BadRequestException("We could not sign you in right now. Please try again.");
    }

    return {
      isNewUser,
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        token_type: session.token_type,
        expires_in: session.expires_in,
        expires_at: session.expires_at,
        user: { id: session.user.id, phone: `+${digits}` }
      }
    };
  }

  /** Supabase Auth has no lookup by phone, so page through users (fine at this app's size). */
  private async findAuthUserIdByPhone(digits: string) {
    const admin = this.supabaseAdmin.getClient();
    for (let page = 1; page <= 20; page += 1) {
      const result = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (result.error) {
        throw new BadRequestException("We could not sign you in right now. Please try again.");
      }
      const users = result.data.users ?? [];
      const match = users.find((user) => (user.phone ?? "").replace(/[^0-9]/g, "") === digits);
      if (match) return match.id;
      if (users.length < 1000) return null;
    }
    return null;
  }
}
