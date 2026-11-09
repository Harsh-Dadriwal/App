import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { AppButton, Card, Field, Notice, ScreenShell, SectionTitle } from "@/components/ui";
import { useAuth } from "@/providers/auth-provider";
import { supabase } from "@/lib/supabase";
import { checkSignupAvailability, sendMyPhoneCode, updateMyProfile, verifyMyPhone } from "@/lib/backend/auth-gateway";
import { isValidEmail, isValidMobile, prettyPhone, toE164 } from "@mahalaxmi/core/auth";
import { palette } from "@/lib/theme";

const WEB_APP_URL = (process.env.EXPO_PUBLIC_WEB_APP_URL || "https://app-rho-one-49.vercel.app").replace(/\/$/, "");

type Editable = "full_name" | "username" | "company_name" | "city" | "state";

function DetailsCard() {
  const { profile, session, refreshProfile } = useAuth();
  const [values, setValues] = useState<Record<Editable, string>>({ full_name: "", username: "", company_name: "", city: "", state: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

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

  const keys = Object.keys(values) as Editable[];
  const changed = keys.filter((key) => values[key].trim() !== String(profile?.[key] ?? "").trim());
  const update = (key: Editable) => (value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setSaved("");
  };

  async function save() {
    if (busy || !changed.length) return;
    if (values.full_name.trim().length < 2) return setError("Enter your full name.");
    if (values.username.trim().length < 3) return setError("Choose a username with at least 3 letters or numbers.");
    setBusy(true);
    setError("");
    setSaved("");
    const result = await updateMyProfile(Object.fromEntries(changed.map((key) => [key, values[key].trim()])));
    if (result.error) {
      setError(result.error);
    } else {
      await refreshProfile(session?.user?.id);
      setSaved("Your details were saved.");
    }
    setBusy(false);
  }

  return (
    <Card>
      <Field label="Full name" value={values.full_name} onChangeText={update("full_name")} icon="user" autoComplete="name" />
      <Field label="Username" value={values.username} onChangeText={update("username")} icon="at-sign" autoCapitalize="none" hint="Letters, numbers, dots and underscores." />
      <Field label="Company or shop (optional)" value={values.company_name} onChangeText={update("company_name")} icon="briefcase" />
      <Field label="City (optional)" value={values.city} onChangeText={update("city")} icon="map-pin" />
      <Field label="State (optional)" value={values.state} onChangeText={update("state")} icon="map" />
      {error ? <Notice tone="error" message={error} /> : null}
      {saved ? <Notice tone="success" message={saved} /> : null}
      <AppButton label={busy ? "Saving…" : "Save changes"} icon="check" loading={busy} disabled={!changed.length} onPress={() => void save()} />
    </Card>
  );
}

/** Add or change the mobile number: a code is texted to the new number and must be entered. */
function PhoneCard() {
  const { profile, session, refreshProfile } = useAuth();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"number" | "code">("number");
  const [number, setNumber] = useState("");
  const [code, setCode] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const current = prettyPhone(profile?.phone);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  function reset() {
    setOpen(false);
    setStep("number");
    setNumber("");
    setCode("");
    setError("");
  }

  async function sendCode() {
    if (busy) return;
    if (!isValidMobile(number)) return setError("Enter a valid 10-digit mobile number.");
    const stored = profile?.phone ? (profile.phone.startsWith("+") ? profile.phone : `+${profile.phone}`) : "";
    if (toE164(number) === stored) return setError("That is already your number.");
    setBusy(true);
    setError("");
    const result = await sendMyPhoneCode(toE164(number));
    setBusy(false);
    if (result.error || !result.data) return setError(result.error ?? "We could not send the code. Please try again.");
    setStep("code");
    setCode("");
    setResendIn(result.data.resendInSeconds ?? 45);
  }

  async function verify() {
    if (busy) return;
    if (code.replace(/\D/g, "").length !== 6) return setError("Enter the 6-digit code from the SMS.");
    setBusy(true);
    setError("");
    const result = await verifyMyPhone(toE164(number), code);
    if (result.error || !result.data) {
      setBusy(false);
      return setError(result.error ?? "We could not verify the code. Please try again.");
    }
    await refreshProfile(session?.user?.id);
    setBusy(false);
    setDone(`Your mobile number is now ${prettyPhone(result.data.phone)}.`);
    reset();
  }

  return (
    <Card>
      <Text style={{ color: palette.muted, fontSize: 12.5, fontWeight: "700" }}>Mobile number</Text>
      <Text style={{ color: palette.ink, fontSize: 16, fontWeight: "800" }}>{current || "Not added yet"}</Text>
      {done && !open ? <Notice tone="success" message={done} /> : null}
      {!open ? (
        <AppButton label={current ? "Change number" : "Add number"} icon="phone" kind="secondary" onPress={() => { setOpen(true); setDone(""); }} />
      ) : step === "number" ? (
        <View style={{ gap: 12 }}>
          <Field label={current ? "New mobile number" : "Mobile number"} value={number} onChangeText={setNumber} keyboardType="phone-pad" icon="phone" placeholder="98765 43210" autoComplete="tel" hint="We will text a 6-digit code to confirm it is yours." />
          {error ? <Notice tone="error" message={error} /> : null}
          <AppButton label={busy ? "Sending…" : "Send code"} icon="send" loading={busy} onPress={() => void sendCode()} />
          <AppButton label="Cancel" kind="secondary" onPress={reset} />
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <Field label={`Code sent to ${prettyPhone(toE164(number))}`} value={code} onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" icon="lock" placeholder="6-digit code" autoComplete="sms-otp" />
          {error ? <Notice tone="error" message={error} /> : null}
          <AppButton label={busy ? "Checking…" : "Verify and save"} icon="check" loading={busy} onPress={() => void verify()} />
          <AppButton label={resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"} kind="secondary" disabled={busy || resendIn > 0} onPress={() => void sendCode()} />
          <AppButton label="Use a different number" kind="secondary" onPress={() => { setStep("number"); setError(""); }} />
        </View>
      )}
    </Card>
  );
}

/** Add or change the email: a confirmation link is sent to the new address and the change applies once it is opened. */
function EmailCard() {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");

  async function submit() {
    if (busy) return;
    const next = email.trim().toLowerCase();
    if (!isValidEmail(next)) return setError("Enter a valid email address.");
    if (next === (profile?.email ?? "").toLowerCase()) return setError("That is already your email.");
    setBusy(true);
    setError("");

    const availability = await checkSignupAvailability({ email: next });
    if (availability.data && !availability.data.email.available) {
      setBusy(false);
      return setError("This email is already linked to another account.");
    }

    const result = await supabase?.auth.updateUser({ email: next }, { emailRedirectTo: `${WEB_APP_URL}/auth` });
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
    <Card>
      <Text style={{ color: palette.muted, fontSize: 12.5, fontWeight: "700" }}>Email</Text>
      <Text style={{ color: palette.ink, fontSize: 16, fontWeight: "800" }}>{profile?.email || "Not added yet"}</Text>
      {sentTo && !open ? (
        <Notice tone="success" message={`We sent a confirmation link to ${sentTo}. Your email changes once you open it. To log in with it, use “Forgot password” on the login screen to choose a password.`} />
      ) : null}
      {!open ? (
        <AppButton label={profile?.email ? "Change email" : "Add email"} icon="mail" kind="secondary" onPress={() => { setOpen(true); setSentTo(""); }} />
      ) : (
        <View style={{ gap: 12 }}>
          <Field label={profile?.email ? "New email address" : "Email address"} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" icon="mail" placeholder="you@example.com" autoComplete="email" hint="We will email a link to confirm it is yours." />
          {error ? <Notice tone="error" message={error} /> : null}
          <AppButton label={busy ? "Sending…" : "Send confirmation link"} icon="send" loading={busy} onPress={() => void submit()} />
          <AppButton label="Cancel" kind="secondary" onPress={() => { setOpen(false); setError(""); }} />
        </View>
      )}
    </Card>
  );
}

export function AccountScreen() {
  return (
    <ScreenShell title="My details" subtitle="Keep your name and contact details up to date." currentScreen="dashboard" showBack>
      <SectionTitle title="Your details" />
      <DetailsCard />
      <SectionTitle title="Mobile number" />
      <PhoneCard />
      <SectionTitle title="Email" />
      <EmailCard />
    </ScreenShell>
  );
}
