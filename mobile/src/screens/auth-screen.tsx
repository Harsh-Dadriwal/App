import { Feather } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppButton, Field, Notice } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { palette, radii, shadow } from "@/lib/theme";
import {
  checkSignupAvailability,
  completePhoneSignup,
  sendPhoneOtp,
  verifyPhoneOtp
} from "@/lib/backend/auth-gateway";
import { useAuth } from "@/providers/auth-provider";
import { useMobileNavigation } from "@/providers/navigation-provider";

type Step = "phone" | "otp" | "profile" | "email" | "forgot";
type EmailMode = "login" | "signup";
/** What a customer gets from the app (every new account is a customer). */
const PERKS: Array<{ icon: keyof typeof Feather.glyphMap; title: string; text: string }> = [
  { icon: "tool", title: "Book repairs and installations", text: "Raise a complaint or installation request and choose who does the job." },
  { icon: "shopping-bag", title: "Order electrical materials", text: "Order for your home or site straight from the shop." },
  { icon: "check-square", title: "Approve before it is supplied", text: "Check every item on your site's list and approve it first." },
  { icon: "sun", title: "Plan your lighting", text: "See how lights will look in your rooms before you buy." },
  { icon: "trending-up", title: "Save every month", text: "Join a savings plan and get bonus points at maturity." },
  { icon: "gift", title: "Wallet and referral rewards", text: "Earn rewards when friends you invite join." },
  { icon: "pie-chart", title: "Track your budget", text: "Keep your project spending in one place." },
  { icon: "book-open", title: "Home and electrical tips", text: "Practical guides for a safer, smarter home." }
];

// Optional: the web app's address, so password-reset and confirmation emails open its /auth page.
const WEB_APP_URL = (process.env.EXPO_PUBLIC_WEB_APP_URL || "").replace(/\/$/, "");

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

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "Something went wrong. Please try again.";
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) return "That email and password don't match.";
  if (lower.includes("email not confirmed")) return "Please confirm your email first. Open the link we sent you, then log in.";
  if (lower.includes("user already registered")) return "This email already has an account. Log in instead.";
  if (lower.includes("password should be at least")) return "Use a password with at least 6 characters.";
  if (lower.includes("network request failed") || lower.includes("failed to fetch")) return "No internet connection. Check your network and try again.";
  return message;
}

/**
 * The SMS code as six boxes. One real input holds all six digits, so typing, backspace,
 * paste and Android/iOS SMS-code autofill all work without moving focus between boxes.
 */
function OtpBoxes({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(true);
  const active = Math.min(value.length, 5);
  return (
    <Pressable onPress={() => inputRef.current?.focus()} style={styles.otpRow} accessibilityLabel="6-digit code">
      {Array.from({ length: 6 }, (_, index) => {
        const filled = Boolean(value[index]);
        const isActive = focused && index === active;
        return (
          <View key={index} style={[styles.otpBox, filled && styles.otpBoxFilled, isActive && styles.otpBoxActive]}>
            <Text style={styles.otpDigit}>{value[index] ?? (isActive ? "|" : "")}</Text>
          </View>
        );
      })}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(text) => onChange(text.replace(/\D/g, "").slice(0, 6))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={6}
        autoFocus
        caretHidden
        style={styles.otpHiddenInput}
      />
    </Pressable>
  );
}

function PerksList() {
  return (
    <View style={styles.perks}>
      <Text style={styles.perksTitle}>What you get</Text>
      {PERKS.map((perk) => (
        <View key={perk.title} style={styles.perkRow}>
          <View style={styles.perkIcon}>
            <Feather name={perk.icon} size={17} color={palette.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.perkName}>{perk.title}</Text>
            <Text style={styles.perkText}>{perk.text}</Text>
          </View>
        </View>
      ))}
    </View>
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
    const timer = setTimeout(async () => {
      const result = await checkSignupAvailability({ username });
      setState(result.data ? (result.data.username.available ? "free" : "taken") : "idle");
    }, 450);
    return () => clearTimeout(timer);
  }, [username]);
  return state;
}

function usernameHint(state: ReturnType<typeof useUsernameCheck>) {
  if (state === "checking") return "Checking…";
  if (state === "free") return "✓ Available";
  if (state === "taken") return "Already taken — try another";
  return "Letters, numbers, dots and underscores";
}

function PhoneInput({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={styles.groupLabel}>{label}</Text>
      <View style={styles.phoneShell}>
        <Text style={styles.phonePrefix}>🇮🇳 +91</Text>
        <TextInput
          value={value}
          onChangeText={(text) => onChange(text.replace(/[^0-9+ ]/g, ""))}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          placeholder="98765 43210"
          placeholderTextColor="#a89c8d"
          maxLength={16}
          style={styles.phoneInput}
          accessibilityLabel={label}
        />
      </View>
    </View>
  );
}

export function AuthScreen() {
  const { replace } = useMobileNavigation();
  const { session, errorMessage: profileError, signOut } = useAuth();
  const [step, setStep] = useState<Step>("phone");
  const [emailMode, setEmailMode] = useState<EmailMode>("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [phone, setPhone] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [signupToken, setSignupToken] = useState("");

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const usernameState = useUsernameCheck(step === "profile" || (step === "email" && emailMode === "signup") ? username : "");

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  function go(next: Step) {
    setError("");
    setNotice("");
    setStep(next);
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

  async function storeSession(next: { access_token: string; refresh_token: string }) {
    if (!supabase) throw new Error("Sign-in is not available right now. Please try again shortly.");
    const { error: sessionError } = await supabase.auth.setSession(next);
    if (sessionError) throw sessionError;
    replace("dashboard");
  }

  function sendCode() {
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
    });
  }

  function completeProfile() {
    if (fullName.trim().length < 2) return setError("Enter your full name.");
    if (username.length < 3) return setError("Choose a username with at least 3 characters.");
    if (usernameState === "taken") return setError("This username is already taken. Please choose another one.");
    if (email && !isValidEmail(email)) return setError("Enter a valid email address, or leave it empty.");
    void run(async () => {
      const result = await completePhoneSignup(signupToken, { full_name: fullName.trim(), username, email: email || undefined });
      if (result.error || !result.data) throw new Error(result.error ?? "We could not create your account. Please try again.");
      await storeSession(result.data.session);
    });
  }

  function submitEmail() {
    void run(async () => {
      if (!supabase) throw new Error("Sign-in is not available right now. Please try again shortly.");
      if (!isValidEmail(email)) throw new Error("Enter a valid email address.");

      if (emailMode === "login") {
        const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
        if (loginError) throw loginError;
        replace("dashboard");
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
          // Every new account is a customer; the role is fixed on the server too.
          data: { full_name: fullName.trim(), username, role: "customer", phone: mobile },
          ...(WEB_APP_URL ? { emailRedirectTo: `${WEB_APP_URL}/auth` } : {})
        }
      });
      if (signupError) throw signupError;
      if (data.session) {
        replace("dashboard");
        return;
      }
      setEmailMode("login");
      setPassword("");
      setNotice(`Account created. We sent a confirmation link to ${email}. Open it, then log in.`);
    });
  }

  function sendReset() {
    if (!isValidEmail(email)) return setError("Enter your email address.");
    void run(async () => {
      if (!supabase) return;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email,
        WEB_APP_URL ? { redirectTo: `${WEB_APP_URL}/auth?reset=true` } : undefined
      );
      if (resetError) throw resetError;
      setNotice(`If ${email} has an account, a reset link is on its way.`);
    });
  }

  const backLink = (label: string, target: Step) => (
    <Pressable onPress={() => go(target)} hitSlop={10} style={styles.backLink} accessibilityRole="button">
      <Feather name="arrow-left" size={16} color={palette.muted} />
      <Text style={styles.backText}>{label}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.brandPanel}>
            <View style={styles.glow} />
            <Image source={require("../../assets/splash-icon.png")} style={styles.logo} />
            <Text style={styles.brandName}>Mahalaxmi Electricals</Text>
            <Text style={styles.brandTagline}>Everything your home needs, electrically.</Text>
          </View>

          <View style={styles.sheet}>
            {session && profileError ? (
              <View style={{ gap: 10 }}>
                <Notice message={`${profileError} Please check your connection, or sign out and try again.`} tone="error" />
                <AppButton label="Sign out" kind="secondary" icon="log-out" onPress={() => void signOut()} />
              </View>
            ) : null}

            {step === "phone" ? (
              <View style={styles.block}>
                <Text style={styles.title}>Log in or sign up</Text>
                <Text style={styles.subtitle}>Enter your mobile number. We will text you a 6-digit code.</Text>
                <PhoneInput value={phone} onChange={setPhone} label="Mobile number" />
                <AppButton label="Continue" icon="arrow-right" loading={busy} onPress={sendCode} />
                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>or</Text>
                  <View style={styles.dividerLine} />
                </View>
                <AppButton label="Continue with email" icon="mail" kind="secondary" onPress={() => go("email")} />
              </View>
            ) : null}

            {step === "otp" ? (
              <View style={styles.block}>
                {backLink("Back", "phone")}
                <Text style={styles.title}>Enter the code</Text>
                <Text style={styles.subtitle}>
                  Sent by SMS to <Text style={styles.strong}>{prettyPhone(sentTo)}</Text>
                  {"  "}
                  <Text style={styles.link} onPress={() => go("phone")}>Change</Text>
                </Text>
                <OtpBoxes
                  value={code}
                  onChange={(next) => {
                    setCode(next);
                    if (next.length === 6) verifyCode(next);
                  }}
                />
                <AppButton label="Verify" icon="check" loading={busy} disabled={code.length !== 6} onPress={() => verifyCode()} />
                <Text style={styles.resend}>
                  {resendIn > 0 ? (
                    <>Resend code in <Text style={styles.strong}>0:{String(resendIn).padStart(2, "0")}</Text></>
                  ) : (
                    <Text style={styles.link} onPress={busy ? undefined : sendCode}>Resend code</Text>
                  )}
                </Text>
              </View>
            ) : null}

            {step === "profile" ? (
              <View style={styles.block}>
                <View style={styles.verifiedBadge}>
                  <Feather name="check-circle" size={14} color={palette.success} />
                  <Text style={styles.verifiedText}>{prettyPhone(sentTo)} verified</Text>
                </View>
                <Text style={styles.title}>Complete your profile</Text>
                <Text style={styles.subtitle}>Just a few details to create your account.</Text>
                <Field label="Full name *" value={fullName} onChangeText={setFullName} icon="user" autoComplete="name" placeholder="e.g. Ravi Kumar" />
                <Field
                  label="Username *"
                  value={username}
                  onChangeText={(value) => setUsername(normalizeUsername(value))}
                  icon="at-sign"
                  autoCapitalize="none"
                  placeholder="e.g. ravi.kumar"
                  hint={usernameHint(usernameState)}
                />
                <Field
                  label="Email (optional)"
                  value={email}
                  onChangeText={(value) => setEmail(value.trim().toLowerCase())}
                  icon="mail"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  placeholder="you@example.com"
                />
                <AppButton label="Create account" icon="user-plus" loading={busy} onPress={completeProfile} />
              </View>
            ) : null}

            {step === "email" ? (
              <View style={styles.block}>
                {backLink("Use mobile number", "phone")}
                <Text style={styles.title}>{emailMode === "login" ? "Log in with email" : "Create your account"}</Text>
                <View style={styles.segment}>
                  {(["login", "signup"] as const).map((mode) => {
                    const active = emailMode === mode;
                    return (
                      <Pressable
                        key={mode}
                        style={[styles.segmentButton, active && styles.segmentButtonActive]}
                        onPress={() => {
                          setEmailMode(mode);
                          setError("");
                          setNotice("");
                        }}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                      >
                        <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{mode === "login" ? "Log in" : "Sign up"}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {emailMode === "signup" ? (
                  <>
                    <Field label="Full name *" value={fullName} onChangeText={setFullName} icon="user" autoComplete="name" placeholder="e.g. Ravi Kumar" />
                    <Field
                      label="Username *"
                      value={username}
                      onChangeText={(value) => setUsername(normalizeUsername(value))}
                      icon="at-sign"
                      autoCapitalize="none"
                      placeholder="e.g. ravi.kumar"
                      hint={usernameHint(usernameState)}
                    />
                  </>
                ) : null}
                <Field
                  label={emailMode === "signup" ? "Email *" : "Email"}
                  value={email}
                  onChangeText={(value) => setEmail(value.trim().toLowerCase())}
                  icon="mail"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  placeholder="you@example.com"
                />
                {emailMode === "signup" ? <PhoneInput value={phone} onChange={setPhone} label="Mobile number *" /> : null}
                <Field
                  label={emailMode === "signup" ? "Password *" : "Password"}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  icon="lock"
                  placeholder={emailMode === "signup" ? "At least 6 characters" : "Your password"}
                  autoComplete={emailMode === "signup" ? "new-password" : "current-password"}
                />
                {emailMode === "login" ? (
                  <Pressable onPress={() => go("forgot")} style={{ alignSelf: "flex-end" }} hitSlop={8} accessibilityRole="button">
                    <Text style={styles.link}>Forgot password?</Text>
                  </Pressable>
                ) : null}
                <AppButton
                  label={emailMode === "login" ? "Log in" : "Create account"}
                  icon={emailMode === "login" ? "log-in" : "user-plus"}
                  loading={busy}
                  onPress={submitEmail}
                />
              </View>
            ) : null}

            {step === "forgot" ? (
              <View style={styles.block}>
                {backLink("Back to log in", "email")}
                <Text style={styles.title}>Reset your password</Text>
                <Text style={styles.subtitle}>We will email you a link to set a new password.</Text>
                <Field
                  label="Email"
                  value={email}
                  onChangeText={(value) => setEmail(value.trim().toLowerCase())}
                  icon="mail"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />
                <AppButton label="Send reset link" icon="send" loading={busy} onPress={sendReset} />
              </View>
            ) : null}

            {error ? <Notice message={error} tone="error" /> : null}
            {notice ? <Notice message={notice} tone="success" /> : null}

            <Text style={styles.legal}>By continuing you agree to Mahalaxmi Electricals&apos; terms and privacy policy.</Text>

            {step === "phone" || step === "email" ? <PerksList /> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.night },
  scroll: { flexGrow: 1 },
  brandPanel: { overflow: "hidden", alignItems: "center", paddingTop: 28, paddingBottom: 48, paddingHorizontal: 24 },
  glow: {
    position: "absolute",
    right: -80,
    top: -60,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(194, 87, 12, 0.35)"
  },
  logo: { width: 76, height: 76, marginBottom: 10 },
  brandName: { color: "#ffffff", fontSize: 22, fontWeight: "900", letterSpacing: -0.3 },
  brandTagline: { color: palette.nightMuted, fontSize: 14, marginTop: 4 },
  sheet: {
    flexGrow: 1,
    marginTop: -24,
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 26,
    paddingBottom: 32,
    backgroundColor: palette.bg,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl
  },
  block: { gap: 14 },
  title: { fontSize: 26, fontWeight: "900", color: palette.ink, letterSpacing: -0.4 },
  subtitle: { fontSize: 15, color: palette.muted, lineHeight: 21, marginTop: -6 },
  strong: { fontWeight: "800", color: palette.ink },
  link: { color: palette.brand, fontWeight: "800" },
  groupLabel: { fontWeight: "700", color: palette.ink, fontSize: 13.5 },
  backLink: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  backText: { color: palette.muted, fontWeight: "700" },
  phoneShell: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 54,
    paddingLeft: 14,
    borderWidth: 1.5,
    borderColor: palette.line,
    borderRadius: radii.md,
    backgroundColor: palette.surfaceSoft
  },
  phonePrefix: { fontWeight: "800", color: palette.muted, paddingRight: 12, marginRight: 12, borderRightWidth: 1, borderRightColor: palette.line },
  phoneInput: { flex: 1, minHeight: 50, fontSize: 17, letterSpacing: 0.6, color: palette.ink },
  divider: { flexDirection: "row", alignItems: "center", gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: palette.line },
  dividerText: { color: palette.muted, fontSize: 13 },
  otpRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  otpBox: {
    flex: 1,
    aspectRatio: 0.86,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: palette.line,
    borderRadius: 14,
    backgroundColor: palette.surface
  },
  otpBoxFilled: { borderColor: palette.brand, backgroundColor: palette.brandSoft },
  otpBoxActive: { borderColor: palette.brand, ...shadow, shadowColor: palette.brand, shadowOpacity: 0.25 },
  otpDigit: { fontSize: 24, fontWeight: "900", color: palette.ink },
  otpHiddenInput: { position: "absolute", width: 1, height: 1, opacity: 0 },
  resend: { textAlign: "center", color: palette.muted, fontSize: 14 },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: palette.successSoft
  },
  verifiedText: { color: palette.success, fontWeight: "800", fontSize: 12.5 },
  segment: { flexDirection: "row", padding: 4, borderRadius: radii.md, backgroundColor: "#efe6da" },
  segmentButton: { flex: 1, minHeight: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  segmentButtonActive: { backgroundColor: palette.surface, ...shadow },
  segmentText: { fontWeight: "700", color: palette.muted, fontSize: 15 },
  segmentTextActive: { color: palette.ink },
  perks: { gap: 14, marginTop: 8, paddingTop: 20, borderTopWidth: 1, borderTopColor: palette.line },
  perksTitle: { fontSize: 17, fontWeight: "900", color: palette.ink },
  perkRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  perkIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: palette.brandSoft },
  perkName: { fontSize: 14.5, fontWeight: "800", color: palette.ink },
  perkText: { fontSize: 12.5, color: palette.muted, marginTop: 2, lineHeight: 17 },
  legal: { textAlign: "center", fontSize: 12, color: palette.muted, marginTop: 8 }
});
