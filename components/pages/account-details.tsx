"use client";

import { useEffect, useState, type FormEvent } from "react";
import { FormNotice, PageSection } from "@/components/data-view";
import { useAuth } from "@/components/providers/auth-provider";
import { checkSignupAvailability, sendMyPhoneCode, updateMyProfile, verifyMyPhone } from "@/lib/backend/modules/auth-gateway";
import { getSupabaseBrowserClient } from "@mahalaxmi/core/supabase/client";
import { isValidEmail, isValidMobile, prettyPhone, toE164 } from "@mahalaxmi/core/auth";

type Editable = "full_name" | "username" | "company_name" | "city" | "state";

const FIELDS: Array<{ key: Editable; label: string; placeholder: string; maxLength: number; required?: boolean; hint?: string }> = [
  { key: "full_name", label: "Full name", placeholder: "Your name", maxLength: 150, required: true },
  { key: "username", label: "Username", placeholder: "yourname", maxLength: 24, required: true, hint: "Letters, numbers, dots and underscores." },
  { key: "company_name", label: "Company or shop (optional)", placeholder: "Company name", maxLength: 150 },
  { key: "city", label: "City (optional)", placeholder: "City", maxLength: 100 },
  { key: "state", label: "State (optional)", placeholder: "State", maxLength: 100 }
];

/** Edit name, username, city, state and company. */
function DetailsForm() {
  const { profile, refreshProfile } = useAuth();
  const [values, setValues] = useState<Record<Editable, string>>({ full_name: "", username: "", company_name: "", city: "", state: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // Start from the saved profile, and again whenever it is refreshed.
  useEffect(() => {
    if (!profile) return;
    setValues({
      full_name: profile.full_name ?? "",
      username: profile.username ?? "",
      company_name: profile.company_name ?? "",
      city: profile.city ?? "",
      state: profile.state ?? ""
    });
  }, [profile?.full_name, profile?.username, profile?.company_name, profile?.city, profile?.state]);

  const changed = FIELDS.filter((field) => values[field.key].trim() !== String(profile?.[field.key] ?? "").trim());

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !changed.length) return;
    setBusy(true);
    setError(null);
    setSaved(null);
    const result = await updateMyProfile(Object.fromEntries(changed.map((field) => [field.key, values[field.key].trim()])));
    if (result.error) {
      setError(result.error);
    } else {
      await refreshProfile();
      setSaved("Your details were saved.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={save} className="account-form">
      <div className="account-form-grid">
        {FIELDS.map((field) => (
          <label key={field.key} className="shop-field">
            {field.label}
            <input
              value={values[field.key]}
              onChange={(event) => { setValues((current) => ({ ...current, [field.key]: event.target.value })); setSaved(null); }}
              placeholder={field.placeholder}
              maxLength={field.maxLength}
              required={field.required}
              autoComplete={field.key === "full_name" ? "name" : field.key === "username" ? "username" : "off"}
              autoCapitalize={field.key === "username" ? "none" : undefined}
            />
            {field.hint ? <span className="form-field-hint">{field.hint}</span> : null}
          </label>
        ))}
      </div>
      <FormNotice error={error} success={saved} />
      <button type="submit" className="primary-button" disabled={busy || !changed.length}>
        {busy ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}

/** Add or change the mobile number: a code is texted to the new number and must be entered. */
function PhoneRow() {
  const { profile, refreshProfile } = useAuth();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"number" | "code">("number");
  const [number, setNumber] = useState("");
  const [code, setCode] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const current = prettyPhone(profile?.phone);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  function reset() {
    setOpen(false);
    setStep("number");
    setNumber("");
    setCode("");
    setError(null);
  }

  async function sendCode(event?: FormEvent) {
    event?.preventDefault();
    if (busy) return;
    if (!isValidMobile(number)) return setError("Enter a valid 10-digit mobile number.");
    if (toE164(number) === (profile?.phone?.startsWith("+") ? profile.phone : `+${profile?.phone ?? ""}`)) {
      return setError("That is already your number.");
    }
    setBusy(true);
    setError(null);
    const result = await sendMyPhoneCode(toE164(number));
    setBusy(false);
    if (result.error || !result.data) return setError(result.error ?? "We could not send the code. Please try again.");
    setStep("code");
    setCode("");
    setResendIn(result.data.resendInSeconds ?? 45);
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (code.replace(/\D/g, "").length !== 6) return setError("Enter the 6-digit code from the SMS.");
    setBusy(true);
    setError(null);
    const result = await verifyMyPhone(toE164(number), code);
    if (result.error || !result.data) {
      setBusy(false);
      return setError(result.error ?? "We could not verify the code. Please try again.");
    }
    await refreshProfile();
    setBusy(false);
    setDone(`Your mobile number is now ${prettyPhone(result.data.phone)}.`);
    reset();
  }

  return (
    <div className="contact-row">
      <div className="contact-row-head">
        <div>
          <strong>Mobile number</strong>
          <p>{current || "Not added yet"}</p>
        </div>
        {!open ? (
          <button type="button" className="secondary-button" onClick={() => { setOpen(true); setDone(null); }}>
            {current ? "Change number" : "Add number"}
          </button>
        ) : null}
      </div>
      {done && !open ? <p className="notice success">{done}</p> : null}
      {open ? (
        step === "number" ? (
          <form onSubmit={sendCode} className="contact-editor">
            <label className="shop-field">
              {current ? "New mobile number" : "Mobile number"}
              <input type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" value={number} onChange={(event) => setNumber(event.target.value)} autoFocus />
              <span className="form-field-hint">We will text a 6-digit code to confirm it is yours.</span>
            </label>
            <FormNotice error={error} success={null} />
            <div className="contact-actions">
              <button type="submit" className="primary-button" disabled={busy}>{busy ? "Sending…" : "Send code"}</button>
              <button type="button" className="secondary-button" onClick={reset}>Cancel</button>
            </div>
          </form>
        ) : (
          <form onSubmit={verify} className="contact-editor">
            <label className="shop-field">
              Code sent to {prettyPhone(toE164(number))}
              <input inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} autoFocus />
            </label>
            <FormNotice error={error} success={null} />
            <div className="contact-actions">
              <button type="submit" className="primary-button" disabled={busy}>{busy ? "Checking…" : "Verify and save"}</button>
              <button type="button" className="secondary-button" disabled={busy || resendIn > 0} onClick={() => void sendCode()}>
                {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
              </button>
              <button type="button" className="text-link-button" onClick={() => { setStep("number"); setError(null); }}>Use a different number</button>
            </div>
          </form>
        )
      ) : null}
    </div>
  );
}

/** Add or change the email: a confirmation link is sent to the new address and the change applies once it is opened. */
function EmailRow() {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const next = email.trim().toLowerCase();
    if (!isValidEmail(next)) return setError("Enter a valid email address.");
    if (next === (profile?.email ?? "").toLowerCase()) return setError("That is already your email.");
    setBusy(true);
    setError(null);

    const availability = await checkSignupAvailability({ email: next });
    if (availability.data && !availability.data.email.available) {
      setBusy(false);
      return setError("This email is already linked to another account.");
    }

    const supabase = await getSupabaseBrowserClient();
    const result = await supabase?.auth.updateUser({ email: next }, { emailRedirectTo: `${window.location.origin}/auth` });
    setBusy(false);
    if (!supabase || result?.error) {
      const message = String(result?.error?.message ?? "").toLowerCase();
      return setError(
        message.includes("already") ? "This email is already linked to another account."
          : message.includes("rate") || message.includes("seconds") ? "Please wait a minute before asking for another email."
            : "We could not send the confirmation email right now. Please try again shortly."
      );
    }
    setSentTo(next);
    setOpen(false);
    setEmail("");
  }

  return (
    <div className="contact-row">
      <div className="contact-row-head">
        <div>
          <strong>Email</strong>
          <p>{profile?.email || "Not added yet"}</p>
        </div>
        {!open ? (
          <button type="button" className="secondary-button" onClick={() => { setOpen(true); setSentTo(null); }}>
            {profile?.email ? "Change email" : "Add email"}
          </button>
        ) : null}
      </div>
      {sentTo && !open ? (
        <p className="notice success">
          We sent a confirmation link to {sentTo}. Your email changes once you open it. To log in with it, use “Forgot password” on the login page to choose a password.
        </p>
      ) : null}
      {open ? (
        <form onSubmit={submit} className="contact-editor">
          <label className="shop-field">
            {profile?.email ? "New email address" : "Email address"}
            <input type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} autoFocus />
            <span className="form-field-hint">We will email a link to confirm it is yours.</span>
          </label>
          <FormNotice error={error} success={null} />
          <div className="contact-actions">
            <button type="submit" className="primary-button" disabled={busy}>{busy ? "Sending…" : "Send confirmation link"}</button>
            <button type="button" className="secondary-button" onClick={() => { setOpen(false); setError(null); }}>Cancel</button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

export function AccountDetails() {
  return (
    <>
      <PageSection title="Your details" description="Keep your name and address up to date.">
        <DetailsForm />
      </PageSection>
      <PageSection title="Contact details" description="Add or change the number and email you can be reached on. Each is confirmed before it is saved.">
        <div className="contact-list">
          <PhoneRow />
          <EmailRow />
        </div>
      </PageSection>
    </>
  );
}
