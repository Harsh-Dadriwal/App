import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException
} from "@nestjs/common";
import { createHash, createHmac, randomInt, timingSafeEqual } from "crypto";
import { SupabaseAdminService } from "../../common/supabase/supabase-admin.service";
import { TextBeeSmsService } from "./textbee-sms.service";

export type SignupProfile = { full_name?: unknown; username?: unknown; role?: unknown };

/** Roles a new user may pick when signing up by phone; anything else becomes a customer. */
const SIGNUP_ROLES = ["customer", "electrician", "architect"];

/** Internal-only address used to issue sessions for phone-only accounts; never emailed. */
const PHONE_LOGIN_EMAIL_DOMAIN = "phone.mahalaxmi-electricals.app";

const CODE_TTL_MS = 5 * 60 * 1000;
/** How long a new user has to fill in the profile step after verifying their number. */
const SIGNUP_TOKEN_TTL_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_MS = 45 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;
const MAX_SENDS_PER_NUMBER_PER_DAY = 5;
/** Protects the SIM sending the codes; override with TEXTBEE_DAILY_LIMIT. */
const DEFAULT_DAILY_SEND_LIMIT = 200;

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

/** "+919876543210" from "+91 98765 43210", "919876543210" or a 10-digit Indian mobile number. */
export function toE164(value: unknown) {
  const raw = typeof value === "string" ? value.replace(/[^0-9+]/g, "") : "";
  const phone = raw.startsWith("+") ? raw : /^[6-9][0-9]{9}$/.test(raw) ? `+91${raw}` : /^91[6-9][0-9]{9}$/.test(raw) ? `+${raw}` : raw;
  return /^\+[1-9][0-9]{7,14}$/.test(phone) ? phone : null;
}

function tooManyRequests(message: string) {
  return new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
}

@Injectable()
export class PhoneAuthService {
  private readonly logger = new Logger(PhoneAuthService.name);

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly sms: TextBeeSmsService
  ) {}

  private hashCode(phone: string, code: string) {
    const secret = process.env.OTP_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    return createHash("sha256").update(`${phone}:${code}:${secret}`).digest("hex");
  }

  /** Creates a 6-digit code for the number and texts it. */
  async sendCode(rawPhone: unknown) {
    const phone = toE164(rawPhone);
    if (!phone) throw new BadRequestException("Enter your mobile number, e.g. 98765 43210 or +91 98765 43210.");
    if (!this.sms.isConfigured()) throw new ServiceUnavailableException("Phone sign-in is not available right now. Please use email.");

    const db = this.supabaseAdmin.getClient();
    const existing = await db.from("phone_otp_codes").select("created_at").eq("phone", phone).maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data) {
      const waitMs = RESEND_COOLDOWN_MS - (Date.now() - new Date(existing.data.created_at).getTime());
      if (waitMs > 0) throw tooManyRequests(`Please wait ${Math.ceil(waitMs / 1000)} seconds before asking for a new code.`);
    }

    const usage = await db.rpc("register_phone_otp_send", { p_phone: phone });
    if (usage.error) throw new Error(usage.error.message);
    const counts = (Array.isArray(usage.data) ? usage.data[0] : usage.data) as { phone_sends: number; total_sends: number };
    if (counts.phone_sends > MAX_SENDS_PER_NUMBER_PER_DAY) {
      throw tooManyRequests(`You have reached today's limit of ${MAX_SENDS_PER_NUMBER_PER_DAY} codes. Please try again tomorrow or use email.`);
    }
    const dailyLimit = Number(process.env.TEXTBEE_DAILY_LIMIT) || DEFAULT_DAILY_SEND_LIMIT;
    if (counts.total_sends > dailyLimit) {
      throw new ServiceUnavailableException("Phone sign-in is busy right now. Please try again later or use email.");
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const stored = await db.from("phone_otp_codes").upsert({
      phone,
      code_hash: this.hashCode(phone, code),
      expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
      attempts: 0,
      created_at: new Date().toISOString()
    });
    if (stored.error) throw new Error(stored.error.message);

    try {
      await this.sms.send(phone, `${code} is your Mahalaxmi Electricals login code. It expires in 5 minutes. Do not share it with anyone.`);
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error));
      await db.from("phone_otp_codes").delete().eq("phone", phone);
      throw new ServiceUnavailableException("We could not send the code right now. Please try again in a minute or use email.");
    }

    return { phone, expiresInSeconds: CODE_TTL_MS / 1000, resendInSeconds: RESEND_COOLDOWN_MS / 1000 };
  }

  /** Checks the code and signs the user in, creating the account (with signup details) if new. */
  async verifyCode(rawPhone: unknown, rawCode: unknown, signup?: SignupProfile) {
    const phone = toE164(rawPhone);
    const code = typeof rawCode === "string" ? rawCode.replace(/\D/g, "") : "";
    if (!phone || code.length !== 6) throw new BadRequestException("Enter the 6-digit code from the SMS.");

    const db = this.supabaseAdmin.getClient();
    const row = await db.from("phone_otp_codes").select("code_hash, expires_at, attempts").eq("phone", phone).maybeSingle();
    if (row.error) throw new Error(row.error.message);
    if (!row.data || new Date(row.data.expires_at).getTime() < Date.now()) {
      if (row.data) await db.from("phone_otp_codes").delete().eq("phone", phone);
      throw new BadRequestException("This code has expired. Please ask for a new one.");
    }
    if (row.data.attempts >= MAX_VERIFY_ATTEMPTS) {
      await db.from("phone_otp_codes").delete().eq("phone", phone);
      throw tooManyRequests("Too many wrong codes. Please ask for a new one.");
    }

    const expected = Buffer.from(row.data.code_hash, "hex");
    const actual = Buffer.from(this.hashCode(phone, code), "hex");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      const attempts = row.data.attempts + 1;
      await db.from("phone_otp_codes").update({ attempts }).eq("phone", phone);
      const left = MAX_VERIFY_ATTEMPTS - attempts;
      throw new BadRequestException(left > 0 ? `That code is not right. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many wrong codes. Please ask for a new one.");
    }

    // One use only.
    await db.from("phone_otp_codes").delete().eq("phone", phone);

    const digits = phone.replace(/[^0-9]/g, "");
    const existing = await this.findAccount(digits);
    if (existing) {
      return { status: "signed_in" as const, isNewUser: false, session: await this.issueSession(existing.authUserId, digits, existing.profileId) };
    }

    // Older app versions send their sign-up details together with the code.
    const profile = signup ? this.parseProfile(signup, { lenient: true }) : null;
    if (profile) {
      return { status: "signed_in" as const, isNewUser: true, session: await this.createAccountAndSignIn(digits, profile) };
    }

    // New number: no account yet. The app asks for name, username and email, then calls
    // completeSignup with this short-lived proof that the number was verified.
    return { status: "needs_profile" as const, phone, signupToken: this.makeSignupToken(phone) };
  }

  /** Creates the account for a number verified moments ago (see verifyCode) and signs in. */
  async completeSignup(signupToken: unknown, rawProfile: unknown) {
    const phone = this.readSignupToken(signupToken);
    const digits = phone.replace(/[^0-9]/g, "");

    const existing = await this.findAccount(digits);
    if (existing) {
      return { status: "signed_in" as const, isNewUser: false, session: await this.issueSession(existing.authUserId, digits, existing.profileId) };
    }

    const profile = this.parseProfile(rawProfile, { lenient: false })!;
    const availability = await this.checkAvailability({ username: profile.username, email: profile.email ?? undefined });
    if (!availability.username.available) throw new BadRequestException("This username is already taken. Please choose another one.");
    if (profile.email && !availability.email.available) throw new BadRequestException("This email is already linked to another account. Log in with it instead.");

    return { status: "signed_in" as const, isNewUser: true, session: await this.createAccountAndSignIn(digits, profile) };
  }

  /** Whether a username, email or phone number is free, for sign-up forms. */
  async checkAvailability(values: { username?: unknown; email?: unknown; phone?: unknown }) {
    const db = this.supabaseAdmin.getClient();
    const username = cleanText(values.username, 24).toLowerCase();
    const email = cleanText(values.email, 255).toLowerCase();
    const phone = toE164(values.phone);
    const isTaken = async (column: string, candidates: string[]) => {
      if (!candidates.length) return false;
      const query = column === "phone"
        ? db.from("users").select("id").in("phone", candidates).limit(1)
        : db.from("users").select("id").ilike(column, candidates[0]).limit(1);
      const result = await query;
      if (result.error) throw new Error(result.error.message);
      return Boolean(result.data?.length);
    };
    const phoneDigits = phone ? phone.slice(1) : "";
    const [usernameTaken, emailTaken, phoneTaken] = await Promise.all([
      isTaken("username", username ? [username] : []),
      isTaken("email", email ? [email] : []),
      isTaken("phone", phone ? [phone, phoneDigits] : [])
    ]);
    return {
      username: { available: !usernameTaken },
      email: { available: !emailTaken },
      phone: { available: !phoneTaken }
    };
  }

  private makeSignupToken(phone: string) {
    const body = Buffer.from(JSON.stringify({ phone, exp: Date.now() + SIGNUP_TOKEN_TTL_MS })).toString("base64url");
    return `${body}.${this.sign(body)}`;
  }

  private readSignupToken(token: unknown) {
    const [body, signature] = typeof token === "string" ? token.split(".") : [];
    const expected = body ? this.sign(body) : "";
    const valid =
      Boolean(body && signature) &&
      signature.length === expected.length &&
      timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    const payload = valid ? (JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { phone?: string; exp?: number }) : null;
    if (!payload?.phone || !payload.exp || payload.exp < Date.now()) {
      throw new BadRequestException("Your verification has expired. Please verify your number again.");
    }
    return payload.phone;
  }

  private sign(value: string) {
    const secret = process.env.OTP_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    return createHmac("sha256", secret).update(`signup:${value}`).digest("base64url");
  }

  /** Name and username are required; email is optional; role defaults to customer. */
  private parseProfile(raw: unknown, options: { lenient: boolean }) {
    const source = (raw && typeof raw === "object" ? raw : {}) as SignupProfile & { email?: unknown };
    const fullName = cleanText(source.full_name, 150);
    const username = cleanText(source.username, 24).toLowerCase().replace(/[^a-z0-9._]/g, "");
    const email = cleanText(source.email, 255).toLowerCase();
    const role = SIGNUP_ROLES.includes(String(source.role)) ? String(source.role) : "customer";

    const problem =
      fullName.length < 2 ? "Enter your full name."
        : username.length < 3 ? "Choose a username with at least 3 letters or numbers."
          : email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? "Enter a valid email address, or leave it empty."
            : null;
    if (problem) {
      if (options.lenient) return null;
      throw new BadRequestException(problem);
    }
    return { fullName, username, email: email || null, role };
  }

  private async findAccount(digits: string) {
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
    const authUserId = profile?.auth_user_id ?? (await this.findAuthUserIdByPhone(digits));
    return authUserId ? { authUserId, profileId: profile && !profile.auth_user_id ? profile.id : null } : null;
  }

  private async createAccountAndSignIn(
    digits: string,
    profile: { fullName: string; username: string; email: string | null; role: string }
  ) {
    const admin = this.supabaseAdmin.getClient();
    const created = await admin.auth.admin.createUser({
      phone: digits,
      phone_confirm: true,
      user_metadata: { role: profile.role, full_name: profile.fullName, username: profile.username, phone: `+${digits}` }
    });
    if (created.error || !created.data.user) {
      throw new BadRequestException("We could not create your account right now. Please try again.");
    }
    const authUserId = created.data.user.id;
    // The contact email lives on the profile; the login itself is by phone.
    if (profile.email) {
      await admin.from("users").update({ email: profile.email }).eq("auth_user_id", authUserId);
    }
    return this.issueSession(authUserId, digits, null);
  }

  /**
   * Returns a real Supabase session for an account. Supabase issues it itself: the API asks
   * for a one-time magic-link token for the login email and redeems it straight away, so no
   * email is sent and no JWT secret is needed. Phone-only logins get an internal placeholder
   * address for this, which never appears on the profile (see sync_auth_user_profile).
   */
  private async issueSession(authUserId: string, digits: string, unlinkedProfileId: string | null) {
    const admin = this.supabaseAdmin.getClient();

    if (unlinkedProfileId) {
      const linked = await admin.from("users").update({ auth_user_id: authUserId }).eq("id", unlinkedProfileId);
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
      const contactEmail = await admin.from("users").select("email").eq("auth_user_id", authUserId).maybeSingle();
      const updated = await admin.auth.admin.updateUserById(authUserId, { email, email_confirm: true });
      if (updated.error) {
        throw new BadRequestException("We could not sign you in right now. Please try again.");
      }
      // Restore the profile's own contact email if the sync trigger replaced it.
      await admin.from("users").update({ email: contactEmail.data?.email ?? null }).eq("auth_user_id", authUserId).eq("email", email);
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
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      token_type: session.token_type,
      expires_in: session.expires_in,
      expires_at: session.expires_at,
      user: { id: session.user.id, phone: `+${digits}` }
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
