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
        <div className="brand-row">
          <span className="brand-mark">ME</span>
          <div>
            <p className="brand-name">Mahalaxmi Electricals</p>
            <small>B2B/B2C procurement and site management platform</small>
          </div>
        </div>
        <span className="eyebrow">Unified Access</span>
        <h1>Phone and email login for every role, with a cleaner production-style flow.</h1>
        <p>
          Customers, electricians, and architects can sign up directly. Admin accounts stay manual
          and capped so business control stays tight.
        </p>

        <div className="auth-benefits">
          <div className="benefit-chip">
            <strong>Phone + Email</strong>
            <span>Flexible login that works like a normal modern app.</span>
          </div>
          <div className="benefit-chip">
            <strong>Role-aware onboarding</strong>
            <span>Each user lands in the right workspace after sign-in.</span>
          </div>
          <div className="benefit-chip">
            <strong>Controlled admin access</strong>
            <span>Admins are promoted manually and limited to four accounts.</span>
          </div>
        </div>

        <div className="role-grid">
          {authRoleOptions.map((role) => (
            <article
              key={role.value}
              className={`role-card ${role.signupAllowed ? "" : "role-card--locked"}`}
            >
              <strong>{role.label}</strong>
              <p>{role.description}</p>
              <small>{role.signupAllowed ? "Self signup enabled" : "Manual creation only"}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-panel-header">
          <span className="eyebrow">{authMode === "login" ? "Welcome Back" : "Create Account"}</span>
          <h2>{authMode === "login" ? "Access your workspace" : "Set up your role-based account"}</h2>
          <p>
            {authMethod === "email"
              ? "Use email and password for a familiar web and mobile login pattern."
              : "Use SMS OTP for faster mobile-first access."}
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

        <div className="auth-steps">
          <div className="step-pill">
            <span>1</span>
            <p>Select method and role</p>
          </div>
          <div className="step-pill">
            <span>2</span>
            <p>Verify access</p>
          </div>
          <div className="step-pill">
            <span>3</span>
            <p>Open your dashboard</p>
          </div>
        </div>

        {authMethod === "email" ? (
          <form className="auth-form" onSubmit={handleEmailSubmit}>
            {authMode === "signup" ? (
              <div className="form-grid">
                <label>
                  Full name
                  <input
                    name="fullName"
                    value={emailForm.fullName}
                    onChange={onEmailChange}
                    placeholder="Harsh Dadriwal"
                    required
                  />
                </label>
                <label>
                  Phone number
                  <input
                    name="phone"
                    value={emailForm.phone}
                    onChange={onEmailChange}
                    placeholder="+919876543210"
                  />
                </label>
                <label>
                  Role
                  <select name="role" value={emailForm.role} onChange={onEmailChange}>
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
                type="password"
                name="password"
                value={emailForm.password}
                onChange={onEmailChange}
                placeholder="••••••••"
                required
                minLength={6}
              />
            </label>
            <button type="submit" className="primary-button" disabled={isSubmitting}>
              {isSubmitting
                ? "Please wait..."
                : authMode === "login"
                  ? "Login with Email"
                  : "Create Account"}
            </button>
            <div className="auth-footer-note">
              <strong>Admin access</strong>
              <p>Admins are promoted manually by the owner after signup, not created from public signup.</p>
            </div>
          </form>
        ) : otpSent ? (
          <form className="auth-form" onSubmit={handlePhoneVerify}>
            <label>
              Phone number
              <input
                name="phone"
                value={phoneForm.phone}
                onChange={onPhoneChange}
                placeholder="+919876543210"
                required
              />
            </label>
            <label>
              OTP code
              <input
                name="otp"
                value={phoneForm.otp}
                onChange={onPhoneChange}
                placeholder="123456"
                required
              />
            </label>
            <button type="submit" className="primary-button" disabled={isSubmitting}>
              {isSubmitting ? "Verifying..." : "Verify OTP"}
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
          <form className="auth-form" onSubmit={handlePhoneOtpSend}>
            {authMode === "signup" ? (
              <div className="form-grid">
                <label>
                  Full name
                  <input
                    name="fullName"
                    value={phoneForm.fullName}
                    onChange={onPhoneChange}
                    placeholder="Harsh Dadriwal"
                    required
                  />
                </label>
                <label>
                  Role
                  <select name="role" value={phoneForm.role} onChange={onPhoneChange}>
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
                name="phone"
                value={phoneForm.phone}
                onChange={onPhoneChange}
                placeholder="+919876543210"
                required
              />
            </label>
            <button type="submit" className="primary-button" disabled={isSubmitting}>
              {isSubmitting ? "Sending..." : "Send OTP"}
            </button>
            <p className="helper-copy">
              Use international format with country code. In Supabase, phone auth requires SMS provider configuration.
            </p>
          </form>
        )}

        {notice ? <p className="notice success">{notice}</p> : null}
        {errorMessage ? <p className="notice error">{errorMessage}</p> : null}
      </section>
    </main>
  );
}
