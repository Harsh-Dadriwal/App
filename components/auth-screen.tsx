"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { getSupabaseBrowserClient } from "@mahalaxmi/core/supabase/client";
import {
  checkSignupAvailability,
  completePhoneSignup,
  sendPhoneOtp,
  verifyPhoneOtp
} from "@/lib/backend/modules/auth-gateway";
import type { AppRole } from "@mahalaxmi/core/types/domain";

type Step = "phone" | "otp" | "profile" | "email" | "forgot" | "reset";
type EmailMode = "login" | "signup";
/** What a customer gets from the app (every new account is a customer). */
const PERKS: Array<{ icon: string; title: string; text: string }> = [
  { icon: "🛠️", title: "Book repairs and installations", text: "Raise a complaint or installation request and choose who does the job." },
  { icon: "🛒", title: "Order electrical materials", text: "Order for your home or site straight from the shop." },
  { icon: "✅", title: "Approve before it is supplied", text: "Check every item on your site's list and approve it first." },
  { icon: "💡", title: "Plan your lighting", text: "See how lights will look in your rooms before you buy." },
  { icon: "💰", title: "Save every month", text: "Join a savings plan and get bonus points at maturity." },
  { icon: "🎁", title: "Wallet and referral rewards", text: "Earn rewards when friends you invite join." },
  { icon: "📊", title: "Track your budget", text: "Keep your project spending in one place." },
  { icon: "📘", title: "Home and electrical tips", text: "Practical guides for a safer, smarter home." }
];

function normalizeUsername(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 24);
}

/** "+919876543210" from a 10-digit Indian mobile number or an already-international one. */
function toE164(value: string) {
  const digits = value.replace(/[^0-9+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (/^[6-9][0-9]{9}$/.test(digits)) return `+91${digits}`;
  return digits;
}

function isValidMobile(value: string) {
  return /^\+[1-9][0-9]{7,14}$/.test(toE164(value));
}

function prettyPhone(e164: string) {
  const match = e164.match(/^\+91(\d{5})(\d{5})$/);
  return match ? `+91 ${match[1]} ${match[2]}` : e164;
}

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "Something went wrong. Please try again.";
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) return "That email and password don't match.";
  if (lower.includes("email not confirmed")) return "Please confirm your email first. Open the link we sent you, then log in.";
  if (lower.includes("user already registered")) return "This email already has an account. Log in instead.";
  if (lower.includes("password should be at least")) return "Use a password with at least 6 characters.";
  if (lower.includes("error sending confirmation email") || message.includes("535 5.7.8")) {
    return "We could not send the confirmation email right now. Please try again shortly.";
  }
  return message;
}

/**
 * The SMS code as six boxes. One real input sits over the boxes and holds all six digits,
 * so typing, backspace, paste and the phone's SMS autofill all work without moving focus.
 */
function OtpBoxes({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const [focused, setFocused] = useState(false);
  const activeIndex = Math.min(value.length, 5);

  return (
    <div className="otp-boxes">
      <input
        className="otp-input"
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        autoFocus
        disabled={disabled}
        aria-label="6-digit code"
      />
      {Array.from({ length: 6 }, (_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={`otp-box${value[index] ? " is-filled" : ""}${focused && index === activeIndex ? " is-active" : ""}`}
        >
          {value[index] ?? ""}
        </span>
      ))}
    </div>
  );
}

/** Live "is this username free?" hint, checked after the user stops typing. */
function useUsernameCheck(username: string) {
  const [state, setState] = useState<"idle" | "checking" | "free" | "taken">("idle");
  useEffect(() => {
    if (username.length < 3) {
      setState("idle");
      return;
    }
    setState("checking");
    const timer = window.setTimeout(async () => {
      const result = await checkSignupAvailability({ username });
      setState(result.data ? (result.data.username.available ? "free" : "taken") : "idle");
    }, 450);
    return () => window.clearTimeout(timer);
  }, [username]);
  return state;
}

function UsernameHint({ state }: { state: ReturnType<typeof useUsernameCheck> }) {
  if (state === "checking") return <span className="field-status">Checking…</span>;
  if (state === "free") return <span className="field-status is-ok">✓ Available</span>;
  if (state === "taken") return <span className="field-status is-bad">Already taken</span>;
  return <span className="field-status">Letters, numbers, dots and underscores</span>;
}

export function AuthScreen() {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const [step, setStep] = useState<Step>("phone");
  const [emailMode, setEmailMode] = useState<EmailMode>("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Phone flow
  const [phone, setPhone] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [signupToken, setSignupToken] = useState("");

  // Profile (phone sign-up) and email forms
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [referralCode, setReferralCode] = useState("");
  const usernameState = useUsernameCheck(step === "profile" || (step === "email" && emailMode === "signup") ? username : "");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("reset") === "true" || window.location.hash.includes("type=recovery")) {
      setStep("reset");
    }
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  function go(next: Step) {
    setError("");
    setNotice("");
    setStep(next);
  }

  async function openWorkspace(expectedRole?: AppRole) {
    const supabase = await getSupabaseBrowserClient();
    const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
    const loaded = data.session?.user?.id ? await refreshProfile(data.session.user.id) : null;
    const target = loaded?.role ?? expectedRole;
    router.replace(target ? `/${target}` : "/");
  }

  async function storeSession(session: { access_token: string; refresh_token: string }) {
    const supabase = await getSupabaseBrowserClient();
    if (!supabase) throw new Error("Sign-in is not available right now. Please try again shortly.");
    const { error: sessionError } = await supabase.auth.setSession(session);
    if (sessionError) throw sessionError;
  }

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusy(false);
    }
  }

  // ---- Phone: send, verify, complete profile ----

  function sendCode(event?: FormEvent) {
    event?.preventDefault();
    if (!isValidMobile(phone)) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    void run(async () => {
      const result = await sendPhoneOtp(toE164(phone));
      if (result.error) throw new Error(result.error);
      setSentTo(result.data?.phone ?? toE164(phone));
      setResendIn(result.data?.resendInSeconds ?? 45);
      setCode("");
      setStep("otp");
    });
  }

  function verifyCode(value = code) {
    if (value.length !== 6) return;
    void run(async () => {
      const result = await verifyPhoneOtp(sentTo, value);
      if (result.error || !result.data) throw new Error(result.error ?? "We could not check the code. Please try again.");
      if (result.data.status === "needs_profile") {
        setSignupToken(result.data.signupToken);
        setStep("profile");
        return;
      }
      await storeSession(result.data.session);
      await openWorkspace();
    });
  }

  function completeProfile(event: FormEvent) {
    event.preventDefault();
    if (fullName.trim().length < 2) return setError("Enter your full name.");
    if (username.length < 3) return setError("Choose a username with at least 3 characters.");
    if (usernameState === "taken") return setError("This username is already taken. Please choose another one.");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError("Enter a valid email address, or leave it empty.");
    void run(async () => {
      const result = await completePhoneSignup(signupToken, { full_name: fullName.trim(), username, email: email || undefined });
      if (result.error || !result.data) throw new Error(result.error ?? "We could not create your account. Please try again.");
      await storeSession(result.data.session);
      await openWorkspace("customer");
    });
  }

  // ---- Email: log in, sign up (phone required), forgot and reset password ----

  function submitEmail(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const supabase = await getSupabaseBrowserClient();
      if (!supabase) throw new Error("Sign-in is not available right now. Please try again shortly.");

      if (emailMode === "login") {
        const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
        if (loginError) throw loginError;
        await openWorkspace();
        return;
      }

      if (fullName.trim().length < 2) throw new Error("Enter your full name.");
      if (username.length < 3) throw new Error("Choose a username with at least 3 characters.");
      if (!isValidMobile(phone)) throw new Error("Enter a valid 10-digit mobile number.");
      if (password.length < 6) throw new Error("Use a password with at least 6 characters.");

      const mobile = toE164(phone);
      const availability = await checkSignupAvailability({ username, email, phone: mobile });
      if (availability.data) {
        if (!availability.data.username.available) throw new Error("This username is already taken. Please choose another one.");
        if (!availability.data.email.available) throw new Error("This email already has an account. Log in instead.");
        if (!availability.data.phone.available) throw new Error("This mobile number already has an account. Continue with your phone number instead.");
      }

      const { data, error: signupError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth`,
          // Every new account is a customer; the role is fixed on the server too.
          data: { full_name: fullName.trim(), username, role: "customer", phone: mobile, referral_code: referralCode || undefined }
        }
      });
      if (signupError) throw signupError;
      if (data.session) {
        await openWorkspace("customer");
        return;
      }
      setEmailMode("login");
      setPassword("");
      setNotice(`Account created. We sent a confirmation link to ${email}. Open it, then log in.`);
    });
  }

  function sendReset(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const supabase = await getSupabaseBrowserClient();
      const { error: resetError } = (await supabase?.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth?reset=true`
      })) ?? { error: null };
      if (resetError) throw resetError;
      setNotice(`If ${email} has an account, a reset link is on its way.`);
    });
  }

  function saveNewPassword(event: FormEvent) {
    event.preventDefault();
    if (password.length < 6) return setError("Use a password with at least 6 characters.");
    void run(async () => {
      const supabase = await getSupabaseBrowserClient();
      const { error: updateError } = (await supabase?.auth.updateUser({ password })) ?? { error: null };
      if (updateError) throw updateError;
      setNotice("Password updated. Opening your workspace…");
      await openWorkspace();
    });
  }

  const passwordField = (autoComplete: string, label = "Password") => (
    <label className="auth-field">
      <span>{label}</span>
      <div className="auth-input-wrap">
        <input
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={autoComplete}
          placeholder={autoComplete === "new-password" ? "At least 6 characters" : "Your password"}
          required
        />
        <button type="button" className="auth-input-action" onClick={() => setShowPassword((shown) => !shown)}>
          {showPassword ? "Hide" : "Show"}
        </button>
      </div>
    </label>
  );

  const phoneField = (label: string) => (
    <label className="auth-field">
      <span>{label}</span>
      <div className="auth-phone">
        <span className="auth-phone-prefix">🇮🇳 +91</span>
        <input
          value={phone}
          onChange={(event) => setPhone(event.target.value.replace(/[^0-9+ ]/g, ""))}
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="98765 43210"
          maxLength={16}
          required
        />
      </div>
    </label>
  );

  return (
    <main className="auth2-shell">
      <section className="auth2-hero" aria-hidden="true">
        <div className="auth2-hero-glow" />
        <div className="auth2-brand">
          <span className="auth2-logo">⚡</span>
          <span>Mahalaxmi Electricals</span>
        </div>
        <h1>Everything your home needs, electrically.</h1>
        <ul className="auth2-perks">
          {PERKS.map((perk) => (
            <li key={perk.title}>
              <span className="auth2-perk-icon">{perk.icon}</span>
              <span>
                <strong>{perk.title}</strong>
                <small>{perk.text}</small>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="auth2-panel">
        <div className="auth2-card">
          <div className="auth2-mobile-brand">
            <span className="auth2-logo">⚡</span> Mahalaxmi Electricals
          </div>

          {step === "phone" ? (
            <form onSubmit={sendCode} className="auth2-form">
              <header>
                <h2>Log in or sign up</h2>
                <p>Enter your mobile number. We will text you a 6-digit code.</p>
              </header>
              {phoneField("Mobile number")}
              <button type="submit" className="primary-button auth2-submit" disabled={busy}>
                {busy ? "Sending code…" : "Continue"}
              </button>
              <div className="auth2-divider"><span>or</span></div>
              <button type="button" className="secondary-button auth2-submit" onClick={() => go("email")}>
                ✉️ Continue with email
              </button>
            </form>
          ) : null}

          {step === "otp" ? (
            <form
              className="auth2-form"
              onSubmit={(event) => {
                event.preventDefault();
                verifyCode();
              }}
            >
              <header>
                <button type="button" className="auth2-back" onClick={() => go("phone")}>← Back</button>
                <h2>Enter the code</h2>
                <p>
                  Sent by SMS to <strong>{prettyPhone(sentTo)}</strong>{" "}
                  <button type="button" className="text-link-button" onClick={() => go("phone")}>Change</button>
                </p>
              </header>
              <OtpBoxes
                value={code}
                disabled={busy}
                onChange={(next) => {
                  setCode(next);
                  if (next.length === 6) verifyCode(next);
                }}
              />
              <button type="submit" className="primary-button auth2-submit" disabled={busy || code.length !== 6}>
                {busy ? "Checking…" : "Verify"}
              </button>
              <p className="auth2-resend">
                {resendIn > 0 ? (
                  <>Resend code in <strong>0:{String(resendIn).padStart(2, "0")}</strong></>
                ) : (
                  <button type="button" className="text-link-button" disabled={busy} onClick={() => sendCode()}>
                    Resend code
                  </button>
                )}
              </p>
            </form>
          ) : null}

          {step === "profile" ? (
            <form onSubmit={completeProfile} className="auth2-form">
              <header>
                <span className="auth2-badge">✓ {prettyPhone(sentTo)} verified</span>
                <h2>Complete your profile</h2>
                <p>Just a few details to create your account.</p>
              </header>
              <label className="auth-field">
                <span>Full name <em>*</em></span>
                <input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" placeholder="e.g. Ravi Kumar" required />
              </label>
              <label className="auth-field">
                <span>Username <em>*</em></span>
                <input value={username} onChange={(event) => setUsername(normalizeUsername(event.target.value))} autoComplete="username" placeholder="e.g. ravi.kumar" required />
                <UsernameHint state={usernameState} />
              </label>
              <label className="auth-field">
                <span>Email <small>(optional)</small></span>
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value.trim().toLowerCase())} autoComplete="email" placeholder="you@example.com" />
              </label>
              <button type="submit" className="primary-button auth2-submit" disabled={busy}>
                {busy ? "Creating your account…" : "Create account"}
              </button>
            </form>
          ) : null}

          {step === "email" ? (
            <form onSubmit={submitEmail} className="auth2-form">
              <header>
                <button type="button" className="auth2-back" onClick={() => go("phone")}>← Use mobile number</button>
                <h2>{emailMode === "login" ? "Log in with email" : "Create your account"}</h2>
              </header>
              <div className="auth2-tabs" role="tablist">
                {(["login", "signup"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="tab"
                    aria-selected={emailMode === mode}
                    className={emailMode === mode ? "is-active" : ""}
                    onClick={() => {
                      setEmailMode(mode);
                      setError("");
                      setNotice("");
                    }}
                  >
                    {mode === "login" ? "Log in" : "Sign up"}
                  </button>
                ))}
              </div>
              {emailMode === "signup" ? (
                <>
                  <label className="auth-field">
                    <span>Full name <em>*</em></span>
                    <input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" placeholder="e.g. Ravi Kumar" required />
                  </label>
                  <label className="auth-field">
                    <span>Username <em>*</em></span>
                    <input value={username} onChange={(event) => setUsername(normalizeUsername(event.target.value))} autoComplete="username" placeholder="e.g. ravi.kumar" required />
                    <UsernameHint state={usernameState} />
                  </label>
                </>
              ) : null}
              <label className="auth-field">
                <span>Email {emailMode === "signup" ? <em>*</em> : null}</span>
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value.trim().toLowerCase())} autoComplete="email" placeholder="you@example.com" required />
              </label>
              {emailMode === "signup" ? phoneField("Mobile number *") : null}
              {passwordField(emailMode === "login" ? "current-password" : "new-password", emailMode === "login" ? "Password" : "Password *")}
              {emailMode === "login" ? (
                <button type="button" className="text-link-button auth2-forgot" onClick={() => go("forgot")}>Forgot password?</button>
              ) : (
                <>
                  <label className="auth-field">
                    <span>Referral code <small>(optional)</small></span>
                    <input value={referralCode} onChange={(event) => setReferralCode(event.target.value.trim().toUpperCase())} placeholder="e.g. ME-ABC123" />
                  </label>
                </>
              )}
              <button type="submit" className="primary-button auth2-submit" disabled={busy}>
                {busy ? "Please wait…" : emailMode === "login" ? "Log in" : "Create account"}
              </button>
            </form>
          ) : null}

          {step === "forgot" ? (
            <form onSubmit={sendReset} className="auth2-form">
              <header>
                <button type="button" className="auth2-back" onClick={() => go("email")}>← Back to log in</button>
                <h2>Reset your password</h2>
                <p>We will email you a link to set a new password.</p>
              </header>
              <label className="auth-field">
                <span>Email</span>
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value.trim().toLowerCase())} autoComplete="email" required />
              </label>
              <button type="submit" className="primary-button auth2-submit" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
            </form>
          ) : null}

          {step === "reset" ? (
            <form onSubmit={saveNewPassword} className="auth2-form">
              <header>
                <h2>Set a new password</h2>
                <p>Choose a password you have not used here before.</p>
              </header>
              {passwordField("new-password", "New password")}
              <button type="submit" className="primary-button auth2-submit" disabled={busy}>{busy ? "Saving…" : "Save password"}</button>
            </form>
          ) : null}

          {error ? <p className="notice error" role="alert">{error}</p> : null}
          {notice ? <p className="notice success" role="status">{notice}</p> : null}

          <p className="auth2-legal">By continuing you agree to Mahalaxmi Electricals&apos; terms and privacy policy.</p>

          {step === "phone" || step === "email" ? (
            <section className="auth2-perks-inline" aria-label="What you get">
              <h3>What you get</h3>
              <ul className="auth2-perks">
                {PERKS.map((perk) => (
                  <li key={perk.title}>
                    <span className="auth2-perk-icon">{perk.icon}</span>
                    <span>
                      <strong>{perk.title}</strong>
                      <small>{perk.text}</small>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}
