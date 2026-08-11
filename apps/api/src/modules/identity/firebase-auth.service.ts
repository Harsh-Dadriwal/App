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
      throw new UnauthorizedException("FIREBASE_PROJECT_ID environment variable is not set.");
    }

    try {
      const decodedToken = await verifyFirebaseIdToken(idToken, projectId);
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

  async exchangeFirebaseTokenForSupabaseSession(idToken: string) {
    const rawPhoneNumber = await this.verifyFirebaseToken(idToken);

    // Normalize phone number to match how it is stored in database
    const normalizedPhone = rawPhoneNumber.trim();

    const supabase = this.supabaseAdmin.getClient();

    // 1. Check if user already exists in public.users
    const { data: userProfile, error: profileError } = await supabase
      .from("users")
      .select("id, auth_user_id, full_name, role, email")
      .eq("phone", normalizedPhone)
      .maybeSingle();

    if (profileError) {
      throw new BadRequestException(`Failed to check user profile: ${profileError.message}`);
    }

    let authUserId: string;
    let finalProfile: typeof userProfile;

    if (userProfile?.auth_user_id) {
      authUserId = userProfile.auth_user_id;
      finalProfile = userProfile;
    } else {
      // 2. If user profile doesn't have an auth_user_id, check if user exists in auth.users by phone
      const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers();
      if (listError) {
        throw new BadRequestException(`Failed to retrieve auth users: ${listError.message}`);
      }

      const existingAuthUser = authUsers.users.find((u) => u.phone === normalizedPhone);

      if (existingAuthUser) {
        authUserId = existingAuthUser.id;

        // Link the auth_user_id in public.users if not already linked
        if (userProfile) {
          const { error: linkError } = await supabase
            .from("users")
            .update({ auth_user_id: authUserId })
            .eq("id", userProfile.id);

          if (linkError) {
            throw new BadRequestException(`Failed to link auth user: ${linkError.message}`);
          }
          finalProfile = { ...userProfile, auth_user_id: authUserId };
        } else {
          // If profile doesn't exist, we select/wait for the handle_new_auth_user trigger to finish
          const { data: freshProfile } = await supabase
            .from("users")
            .select("id, auth_user_id, full_name, role, email")
            .eq("auth_user_id", authUserId)
            .maybeSingle();
          finalProfile = freshProfile;
        }
      } else {
        // 3. User does not exist in auth.users at all, let's create them!
        const generatedUsername = "user_" + Math.random().toString(36).substring(2, 8);
        const { data: newAuthUser, error: createError } = await supabase.auth.admin.createUser({
          phone: normalizedPhone,
          phone_confirm: true,
          user_metadata: {
            role: "customer",
            full_name: "Customer " + normalizedPhone.slice(-4),
            username: generatedUsername
          }
        });

        if (createError) {
          throw new BadRequestException(`Failed to register user in auth: ${createError.message}`);
        }

        authUserId = newAuthUser.user.id;

        // Fetch the profile created by database trigger handle_new_auth_user()
        const { data: freshProfile, error: fetchError } = await supabase
          .from("users")
          .select("id, auth_user_id, full_name, role, email")
          .eq("auth_user_id", authUserId)
          .maybeSingle();

        if (fetchError || !freshProfile) {
          throw new BadRequestException("User registration completed, but profile sync failed.");
        }
        finalProfile = freshProfile;
      }
    }

    // 4. Generate custom Supabase JWT signed with SUPABASE_JWT_SECRET
    const jwtSecret =
      process.env.SUPABASE_JWT_SECRET || "super-secret-jwt-key-with-at-least-32-characters-long";

    const payload = {
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24 Hours expiry
      sub: authUserId,
      email: finalProfile?.email || "",
      phone: normalizedPhone,
      app_metadata: {
        provider: "firebase",
        providers: ["firebase"]
      },
      user_metadata: {
        role: finalProfile?.role || "customer",
        full_name: finalProfile?.full_name || ""
      },
      role: "authenticated"
    };

    const token = jwt.sign(payload, jwtSecret);

    return {
      session: {
        access_token: token,
        token_type: "bearer",
        expires_in: 86400,
        user: {
          id: authUserId,
          phone: normalizedPhone,
          email: finalProfile?.email || "",
          user_metadata: {
            role: finalProfile?.role || "customer",
            full_name: finalProfile?.full_name || ""
          }
        }
      }
    };
  }
}
