"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { getSupabaseBrowserClient } from "@mahalaxmi/core/supabase/client";
import { authRoleOptions } from "@/lib/navigation";
import type { AppRole } from "@mahalaxmi/core/types/domain";

type AuthMethod = "email" | "phone";
type AuthMode = "login" | "signup";

type EmailFormState = {
  fullName: string;
  username: string;
  email: string;
  phone: string;
  password: string;
  role: AppRole;
};

type PhoneFormState = {
  fullName: string;
  username: string;
  phone: string;
  otp: string;
  role: AppRole;
};

const defaultEmailForm: EmailFormState = {
  fullName: "",
  username: "",
  email: "",
  phone: "",
  password: "",
  role: "customer"
};

const defaultPhoneForm: PhoneFormState = {
  fullName: "",
  username: "",
  phone: "",
  otp: "",
  role: "customer"
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
    return "Signup could not finish because the database signup trigger needs the latest patch. Run db/user_roles_username_patch.sql in Supabase, then try again.";
  }

  if (message.toLowerCase().includes("user already registered")) {
    return "This email is already registered. Log in instead or use another email address.";
  }

  return message;
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
              phone: emailForm.phone
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
                phone: phoneForm.phone
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
            <span className="eyebrow">{authMode === "login" ? "Welcome Back" : "Create Account"}</span>
            <h2>{authMode === "login" ? "Access your workspace" : "Set up your role-based account"}</h2>
            <p>
              {authMethod === "email"
                ? "Use your email securely. No fuss."
                : "Use SMS OTP for mobile-first rapid access."}
            </p>
          </div>

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

          {authMethod === "email" ? (
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
              <button type="submit" className="primary-button" disabled={isSubmitting} style={{ marginTop: '1rem' }}>
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
        </div>
      </section>
    </main>
  );
}
