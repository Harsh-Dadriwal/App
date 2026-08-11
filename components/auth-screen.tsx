"use client";

import { useState, useEffect, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { getSupabaseBrowserClient } from "@mahalaxmi/core/supabase/client";
import { authRoleOptions } from "@/lib/navigation";
import type { AppRole } from "@mahalaxmi/core/types/domain";

type AuthMethod = "email" | "phone";
type AuthMode = "login" | "signup" | "forgot_password" | "reset_password";

type EmailFormState = {
  fullName: string;
  username: string;
  email: string;
  phone: string;
  password: string;
  role: AppRole;
  referralCode: string;
};

type PhoneFormState = {
  fullName: string;
  username: string;
  phone: string;
  otp: string;
  role: AppRole;
  referralCode: string;
};

const defaultEmailForm: EmailFormState = {
  fullName: "",
  username: "",
  email: "",
  phone: "",
  password: "",
  role: "customer",
  referralCode: ""
};

const defaultPhoneForm: PhoneFormState = {
  fullName: "",
  username: "",
  phone: "",
  otp: "",
  role: "customer",
  referralCode: ""
};

function normalizeUsername(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, "")
    .slice(0, 24);
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizePhone(value: string) {
  return value.replace(/[^0-9+]/g, "");
}

function mapAuthErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unable to continue.";

  if (message.toLowerCase().includes("database error saving new user")) {
    return "Signup could not finish because the Supabase signup trigger is still failing. Run db/auth_trigger_username_roles_repair.sql in Supabase first, then try again.";
  }

  if (
    message.toLowerCase().includes("error sending confirmation email") ||
    message.includes("535 5.7.8")
  ) {
    return "Signup reached email confirmation, but your SMTP credentials were rejected by Gmail. Recheck the SMTP username, app password, host, port, and encryption settings in Supabase Auth.";
  }

  if (message.toLowerCase().includes("user already registered")) {
    return "This email is already registered. Log in instead or use another email address.";
  }

  return message;
}

let firebaseScriptPromise: Promise<void> | null = null;

function loadFirebaseScripts() {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as any).firebase) return Promise.resolve();
  if (firebaseScriptPromise) return firebaseScriptPromise;

  firebaseScriptPromise = new Promise((resolve, reject) => {
    const appScript = document.createElement("script");
    appScript.src = "https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js";
    appScript.async = true;
    appScript.onload = () => {
      const authScript = document.createElement("script");
      authScript.src = "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth-compat.js";
      authScript.async = true;
      authScript.onload = () => resolve();
      authScript.onerror = () => reject(new Error("Failed to load Firebase Auth Script"));
      document.body.appendChild(authScript);
    };
    appScript.onerror = () => reject(new Error("Failed to load Firebase App Script"));
    document.body.appendChild(appScript);
  });

  return firebaseScriptPromise;
}

export function AuthScreen() {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const [authMethod, setAuthMethod] = useState<AuthMethod>("email");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [emailForm, setEmailForm] = useState(defaultEmailForm);
  const [phoneForm, setPhoneForm] = useState(defaultPhoneForm);
  const [otpSent, setOtpSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      const isReset = searchParams.get("reset") === "true";
      const hash = window.location.hash;
      const isRecovery = hash.includes("type=recovery") || hash.includes("access_token=");
      
      if (isReset || isRecovery) {
        setAuthMode("reset_password");
        setNotice("Reset session active. Please enter your new secure password.");
      }
    }
  }, []);

  async function handleForgotPasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = await getSupabaseBrowserClient();
    if (!supabase) return;

    setIsSubmitting(true);
    setErrorMessage("");
    setNotice("");

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(emailForm.email, {
        redirectTo: `${window.location.origin}/auth?reset=true`,
      });

      if (error) throw error;

      setNotice("A password reset link has been sent to your email.");
    } catch (error) {
      setErrorMessage(mapAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResetPasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = await getSupabaseBrowserClient();
    if (!supabase) return;

    setIsSubmitting(true);
    setErrorMessage("");
    setNotice("");

    try {
      const { error } = await supabase.auth.updateUser({
        password: emailForm.password,
      });

      if (error) throw error;

      setNotice("Your password has been updated successfully. Redirecting...");
      setTimeout(() => {
        router.replace("/");
      }, 1500);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Password update failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function completeLoginRedirect(expectedRole?: AppRole) {
    const supabase = await getSupabaseBrowserClient();

    if (!supabase) {
      return;
    }

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (session?.user?.id) {
        const loadedProfile = await refreshProfile(session.user.id);
        const role = loadedProfile?.role ?? expectedRole;
        router.replace(role ? `/${role}` : "/");
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  function onEmailChange(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = event.target;
    setEmailForm((current) => ({
      ...current,
      [name]:
        name === "username"
          ? normalizeUsername(value)
          : name === "email"
            ? normalizeEmail(value)
            : name === "phone"
              ? normalizePhone(value)
              : value
    }));
  }

  function onPhoneChange(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = event.target;
    setPhoneForm((current) => ({
      ...current,
      [name]:
        name === "username"
          ? normalizeUsername(value)
          : name === "phone"
            ? normalizePhone(value)
            : value
    }));
  }

  async function validateSignupAvailability(values: {
    username: string;
    email?: string;
    phone?: string;
  }) {
    const response = await fetch("/api/auth/check-availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values)
    });

    const payload = (await response.json().catch(() => null)) as
      | {
          error?: string;
          checks?: {
            username?: { available: boolean };
            email?: { available: boolean };
            phone?: { available: boolean };
          };
        }
      | null;

    if (!response.ok) {
      throw new Error(payload?.error ?? "Unable to validate your signup details right now.");
    }

    if (!payload?.checks?.username?.available) {
      throw new Error("This username is already taken. Please choose another one.");
    }

    if (values.email && payload?.checks?.email?.available === false) {
      throw new Error("This email address is already being used by another user.");
    }

    if (values.phone && payload?.checks?.phone?.available === false) {
      throw new Error("This mobile number is already being used by another user.");
    }
  }

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = await getSupabaseBrowserClient();

    if (!supabase) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    setNotice("");

    try {
      if (authMode === "signup" && emailForm.role === "admin") {
        throw new Error("Admin accounts are created manually by the platform owner.");
      }

      if (authMode === "signup") {
        if (!emailForm.username) {
          throw new Error("Username is required.");
        }

        await validateSignupAvailability({
          username: emailForm.username,
          email: emailForm.email,
          phone: emailForm.phone
        });

        const { error, data } = await supabase.auth.signUp({
          email: emailForm.email,
          password: emailForm.password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth`,
            data: {
              full_name: emailForm.fullName,
              username: emailForm.username,
              role: emailForm.role,
              phone: emailForm.phone,
              referral_code: emailForm.referralCode
            }
          }
        });

        if (error) {
          throw error;
        }

        setNotice(
          data?.session
            ? "Account created successfully."
            : "Account created. Check your email to confirm your address."
        );

        if (data?.session) {
          await completeLoginRedirect(emailForm.role);
        } else {
          setAuthMode("login");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: emailForm.email,
          password: emailForm.password
        });

        if (error) {
          throw error;
        }

        setNotice("Login successful. Opening your workspace...");
        await completeLoginRedirect();
      }
    } catch (error) {
      setErrorMessage(mapAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePhoneOtpSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = await getSupabaseBrowserClient();

    if (!supabase) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    setNotice("");

    try {
      if (authMode === "signup" && phoneForm.role === "admin") {
        throw new Error("Admin accounts are created manually by the platform owner.");
      }

      if (authMode === "signup" && !phoneForm.username) {
        throw new Error("Username is required.");
      }

      if (authMode === "signup") {
        await validateSignupAvailability({
          username: phoneForm.username,
          phone: phoneForm.phone
        });
      }

      const firebaseApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

      if (firebaseApiKey) {
        await loadFirebaseScripts();
        const fb = (window as any).firebase;

        if (fb.apps.length === 0) {
          fb.initializeApp({
            apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
            authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
            appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
          });
        }

        let verifier = (window as any).recaptchaVerifier;
        if (!verifier) {
          verifier = new fb.auth.RecaptchaVerifier("recaptcha-container", {
            size: "invisible",
            callback: () => {}
          });
          (window as any).recaptchaVerifier = verifier;
        }

        const confirmationResult = await fb.auth().signInWithPhoneNumber(phoneForm.phone, verifier);
        (window as any).firebaseConfirmationResult = confirmationResult;

        setOtpSent(true);
        setNotice("OTP sent via Firebase. Enter the code to continue.");
        return;
      }

      const { error } = await supabase.auth.signInWithOtp({
        phone: phoneForm.phone,
        options: {
          shouldCreateUser: authMode === "signup",
          data:
            authMode === "signup"
              ? {
                full_name: phoneForm.fullName,
                username: phoneForm.username,
                role: phoneForm.role,
                phone: phoneForm.phone,
                referral_code: phoneForm.referralCode
              }
              : undefined
        }
      });

      if (error) {
        throw error;
      }

      setOtpSent(true);
      setNotice("OTP sent. Enter the code to continue.");
    } catch (error) {
      setErrorMessage(mapAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePhoneVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = await getSupabaseBrowserClient();

    if (!supabase) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    setNotice("");

    try {
      const firebaseApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

      if (firebaseApiKey) {
        const confirmationResult = (window as any).firebaseConfirmationResult;
        if (!confirmationResult) {
          throw new Error("No pending Firebase verification found. Try resending the code.");
        }

        const result = await confirmationResult.confirm(phoneForm.otp);
        const idToken = await result.user.getIdToken();

        const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || ""}/api/v1/auth/firebase-login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken })
        });

        const payload = await response.json();
        if (!response.ok || !payload?.session?.access_token) {
          throw new Error(payload?.message || "Exchange session exchange failed.");
        }

        const { error: sessionError } = await supabase.auth.setSession({
          access_token: payload.session.access_token,
          refresh_token: payload.session.access_token
        });

        if (sessionError) {
          throw sessionError;
        }

        setNotice("Phone verified successfully via Firebase.");
        await completeLoginRedirect(phoneForm.role);
        return;
      }

      const { error } = await supabase.auth.verifyOtp({
        phone: phoneForm.phone,
        token: phoneForm.otp,
        type: "sms"
      });

      if (error) {
        throw error;
      }

      setNotice("Phone verified successfully.");
      await completeLoginRedirect(phoneForm.role);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "OTP verification failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-hero">
        <div style={{ paddingBottom: '2rem' }}>
          <div className="brand-row" style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
            <span className="brand-mark" style={{
              background: 'linear-gradient(135deg, white, rgba(255,255,255,0.7))',
              color: '#1e3a8a',
              width: 48,
              height: 48,
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700
            }}>ME</span>
            <div>
              <p className="brand-name" style={{ color: 'white', fontSize: '1.25rem', marginBottom: 0 }}>Mahalaxmi Electricals</p>
              <small style={{ color: 'rgba(255,255,255,0.8)' }}>B2B & B2C Platform</small>
            </div>
          </div>
          <span className="eyebrow" style={{ color: '#93c5fd' }}>Secure Access</span>
          <h1>Customer onboarding & secure professional workspace access.</h1>
          <p>
            New accounts start as Customers. Platform Administrators can search your profile, verify your username, and promote you into electrician, architect, supplier, or specialized handyman roles like POP, painting, tiles, carpentry, and plumbing.
          </p>
        </div>

        <div className="role-grid">
          {authRoleOptions.map((role) => (
            <article
              key={role.value}
              className={`role-card ${role.value === "customer" ? "" : "role-card--locked"}`}
            >
              <strong>{role.label}</strong>
              <p>{role.description}</p>
              {role.value === "customer" ? <small style={{ color: '#6ee7b7' }}>Default signup role</small> : <small>Admin promotion only</small>}
            </article>
          ))}
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-panel-inner">
          <div className="auth-panel-header" style={{ marginBottom: '2.5rem' }}>
            <span className="eyebrow">
              {authMode === "login"
                ? "Welcome Back"
                : authMode === "signup"
                  ? "Create Account"
                  : authMode === "forgot_password"
                    ? "Reset Password Request"
                    : "Set New Password"}
            </span>
            <h2>
              {authMode === "login"
                ? "Access your workspace"
                : authMode === "signup"
                  ? "Set up your role-based account"
                  : authMode === "forgot_password"
                    ? "Recover your account password"
                    : "Secure your account"}
            </h2>
            <p>
              {authMode === "forgot_password"
                ? "Enter your email to receive a secure recovery link."
                : authMode === "reset_password"
                  ? "Enter your new strong password below."
                  : authMethod === "email"
                    ? "Use your email securely. No fuss."
                    : "Use SMS OTP for mobile-first rapid access."}
            </p>
          </div>

          {authMode !== "forgot_password" && authMode !== "reset_password" ? (
            <div className="toggle-row">
              <div className="segmented-control">
                <button
                  type="button"
                  className={authMode === "login" ? "is-active" : ""}
                  onClick={() => setAuthMode("login")}
                >
                  Login
                </button>
                <button
                  type="button"
                  className={authMode === "signup" ? "is-active" : ""}
                  onClick={() => setAuthMode("signup")}
                >
                  Sign Up
                </button>
              </div>
              <div className="segmented-control">
                <button
                  type="button"
                  className={authMethod === "email" ? "is-active" : ""}
                  onClick={() => {
                    setAuthMethod("email");
                    setOtpSent(false);
                  }}
                >
                  Email
                </button>
                <button
                  type="button"
                  className={authMethod === "phone" ? "is-active" : ""}
                  onClick={() => setAuthMethod("phone")}
                >
                  Phone
                </button>
              </div>
            </div>
          ) : null}

          {authMode === "forgot_password" ? (
            <form className="auth-form fade-in" onSubmit={handleForgotPasswordSubmit}>
              <label>
                Email address
                <input
                  className="input"
                  type="email"
                  name="email"
                  value={emailForm.email}
                  onChange={onEmailChange}
                  placeholder="name@example.com"
                  required
                />
              </label>
              <button type="submit" className="primary-button" disabled={isSubmitting} style={{ marginTop: '1rem' }}>
                {isSubmitting ? "Sending reset link..." : "Send Reset Link"}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setAuthMode("login")}
                style={{ marginTop: '0.5rem', background: 'transparent', border: 'none', color: '#60a5fa', cursor: 'pointer' }}
              >
                Back to Login
              </button>
            </form>
          ) : authMode === "reset_password" ? (
            <form className="auth-form fade-in" onSubmit={handleResetPasswordSubmit}>
              <label>
                New Password
                <input
                  className="input"
                  type="password"
                  name="password"
                  value={emailForm.password}
                  onChange={onEmailChange}
                  placeholder="Enter your new password"
                  required
                  minLength={6}
                />
              </label>
              <button type="submit" className="primary-button" disabled={isSubmitting} style={{ marginTop: '1rem' }}>
                {isSubmitting ? "Updating password..." : "Update Password"}
              </button>
            </form>
          ) : authMethod === "email" ? (
            <form className="auth-form fade-in" onSubmit={handleEmailSubmit}>
              {authMode === "signup" ? (
                <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <label style={{ gridColumn: '1 / -1' }}>
                    Full name
                    <input
                      className="input"
                      name="fullName"
                      value={emailForm.fullName}
                      onChange={onEmailChange}
                      placeholder="John Doe"
                      required
                    />
                  </label>
                  <label>
                    Username
                    <input
                      className="input"
                      name="username"
                      value={emailForm.username}
                      onChange={onEmailChange}
                      placeholder="harshdadriwal"
                      pattern="[a-z0-9._]{3,24}"
                      minLength={3}
                      maxLength={24}
                      required
                    />
                  </label>
                  <label>
                    Phone number
                    <input
                      className="input"
                      name="phone"
                      value={emailForm.phone}
                      onChange={onEmailChange}
                      placeholder="+91 XXXXXXXXXX"
                    />
                  </label>
                  <label>
                    Assigned Role
                    <div style={{
                      padding: '0.625rem 0.75rem',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius)',
                      color: 'var(--text-color)',
                      fontSize: '0.875rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}>
                      <span>Customer</span>
                      <span style={{ fontSize: '0.75rem', color: '#6ee7b7', background: 'rgba(110, 231, 183, 0.1)', padding: '2px 6px', borderRadius: 4 }}>Default</span>
                    </div>
                  </label>
                  <label style={{ gridColumn: '1 / -1' }}>
                    Referral Code (Optional)
                    <input
                      className="input"
                      name="referralCode"
                      value={emailForm.referralCode}
                      onChange={onEmailChange}
                      placeholder="ME-XXXXXX"
                    />
                  </label>
                </div>
              ) : null}

              <label>
                Email address
                <input
                  className="input"
                  type="email"
                  name="email"
                  value={emailForm.email}
                  onChange={onEmailChange}
                  placeholder="name@example.com"
                  required
                />
              </label>
              <label>
                Password
                <input
                  className="input"
                  type="password"
                  name="password"
                  value={emailForm.password}
                  onChange={onEmailChange}
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </label>
              {authMode === "login" ? (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-0.5rem', marginBottom: '1.25rem' }}>
                  <button
                    type="button"
                    onClick={() => setAuthMode("forgot_password")}
                    style={{ background: 'transparent', border: 'none', color: '#60a5fa', fontSize: '0.85rem', cursor: 'pointer', padding: 0 }}
                  >
                    Forgot password?
                  </button>
                </div>
              ) : null}
              <button type="submit" className="primary-button" disabled={isSubmitting} style={{ marginTop: '0.5rem' }}>
                {isSubmitting
                  ? "Please wait..."
                  : authMode === "login"
                    ? "Login Securely"
                    : "Create Account"}
              </button>
            </form>
          ) : otpSent ? (
            <form className="auth-form fade-in" onSubmit={handlePhoneVerify}>
              <label>
                Phone number
                <input
                  className="input"
                  name="phone"
                  value={phoneForm.phone}
                  onChange={onPhoneChange}
                  disabled
                />
              </label>
              <label>
                Secure OTP code
                <input
                  className="input"
                  name="otp"
                  value={phoneForm.otp}
                  onChange={onPhoneChange}
                  placeholder="123456"
                  required
                  autoFocus
                />
              </label>
              <button type="submit" className="primary-button" disabled={isSubmitting} style={{ marginTop: '1rem' }}>
                {isSubmitting ? "Verifying Token..." : "Verify OTP"}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setOtpSent(false);
                  setPhoneForm((current) => ({ ...current, otp: "" }));
                }}
              >
                Change phone number
              </button>
            </form>
          ) : (
            <form className="auth-form fade-in" onSubmit={handlePhoneOtpSend}>
              {authMode === "signup" ? (
                <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <label style={{ gridColumn: '1 / -1' }}>
                    Full name
                    <input
                      className="input"
                      name="fullName"
                      value={phoneForm.fullName}
                      onChange={onPhoneChange}
                      placeholder="John Doe"
                      required
                    />
                  </label>
                  <label style={{ gridColumn: '1 / -1' }}>
                    Username
                    <input
                      className="input"
                      name="username"
                      value={phoneForm.username}
                      onChange={onPhoneChange}
                      placeholder="harshdadriwal"
                      pattern="[a-z0-9._]{3,24}"
                      minLength={3}
                      maxLength={24}
                      required
                    />
                  </label>
                  <label style={{ gridColumn: '1 / -1' }}>
                    Assigned Role
                    <div style={{
                      padding: '0.625rem 0.75rem',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius)',
                      color: 'var(--text-color)',
                      fontSize: '0.875rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}>
                      <span>Customer</span>
                      <span style={{ fontSize: '0.75rem', color: '#6ee7b7', background: 'rgba(110, 231, 183, 0.1)', padding: '2px 6px', borderRadius: 4 }}>Default</span>
                    </div>
                  </label>
                  <label style={{ gridColumn: '1 / -1' }}>
                    Referral Code (Optional)
                    <input
                      className="input"
                      name="referralCode"
                      value={phoneForm.referralCode}
                      onChange={onPhoneChange}
                      placeholder="ME-XXXXXX"
                    />
                  </label>
                </div>
              ) : null}

              <label>
                Phone number
                <input
                  className="input"
                  name="phone"
                  value={phoneForm.phone}
                  onChange={onPhoneChange}
                  placeholder="+919876543210"
                  required
                />
              </label>
              <button type="submit" className="primary-button" disabled={isSubmitting} style={{ marginTop: '1rem' }}>
                {isSubmitting ? "Sending..." : "Send OTP Request"}
              </button>
              <p className="helper-copy" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                Standard message and data rates may apply.
              </p>
            </form>
          )}

          {notice ? <div className="notice success fade-in">{notice}</div> : null}
          {errorMessage ? <div className="notice error fade-in">{errorMessage}</div> : null}
          <div id="recaptcha-container"></div>
        </div>
      </section>
    </main>
  );
}
