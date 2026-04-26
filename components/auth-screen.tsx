"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { authRoleOptions } from "@/lib/navigation";
import type { AppRole } from "@/lib/app-types";

type AuthMethod = "email" | "phone";
type AuthMode = "login" | "signup";

type EmailFormState = {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  role: AppRole;
};

type PhoneFormState = {
  fullName: string;
  phone: string;
  otp: string;
  role: AppRole;
};

const defaultEmailForm: EmailFormState = {
  fullName: "",
  email: "",
  phone: "",
  password: "",
  role: "customer"
};

const defaultPhoneForm: PhoneFormState = {
  fullName: "",
  phone: "",
  otp: "",
  role: "customer"
};

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
    setEmailForm((current) => ({ ...current, [name]: value }));
  }

  function onPhoneChange(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = event.target;
    setPhoneForm((current) => ({ ...current, [name]: value }));
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
        const { error, data } = await supabase.auth.signUp({
          email: emailForm.email,
          password: emailForm.password,
          options: {
            data: {
              full_name: emailForm.fullName,
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
      setErrorMessage(error instanceof Error ? error.message : "Unable to continue.");
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

      const { error } = await supabase.auth.signInWithOtp({
        phone: phoneForm.phone,
        options: {
          shouldCreateUser: authMode === "signup",
          data:
            authMode === "signup"
              ? {
                  full_name: phoneForm.fullName,
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
      setErrorMessage(error instanceof Error ? error.message : "Unable to send OTP.");
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
          <span className="eyebrow" style={{ color: '#93c5fd' }}>Unified Access</span>
          <h1>Phone and email access for every professional role.</h1>
          <p>
            Architects, contractors, and customers work together harmoniously within our advanced secure procurement layers.
          </p>
        </div>

        <div className="role-grid">
          {authRoleOptions.map((role) => (
            <article
              key={role.value}
              className={`role-card ${role.signupAllowed ? "" : "role-card--locked"}`}
            >
              <strong>{role.label}</strong>
              <p>{role.description}</p>
              {role.signupAllowed ? null : <small>Manual creation only</small>}
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
                      placeholder="Ashok Kumar"
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
                    Role
                    <select className="input" name="role" value={emailForm.role} onChange={onEmailChange}>
                      {authRoleOptions.map((role) => (
                        <option
                          key={role.value}
                          value={role.value}
                          disabled={!role.signupAllowed}
                        >
                          {role.label}
                          {!role.signupAllowed ? " (manual only)" : ""}
                        </option>
                      ))}
                    </select>
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
                      placeholder="Ashok Kumar"
                      required
                    />
                  </label>
                  <label style={{ gridColumn: '1 / -1' }}>
                    Role
                    <select className="input" name="role" value={phoneForm.role} onChange={onPhoneChange}>
                      {authRoleOptions.map((role) => (
                        <option
                          key={role.value}
                          value={role.value}
                          disabled={!role.signupAllowed}
                        >
                          {role.label}
                          {!role.signupAllowed ? " (manual only)" : ""}
                        </option>
                      ))}
                    </select>
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
