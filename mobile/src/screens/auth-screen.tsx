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
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppButton, Field, Notice } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { backendRequest } from "@/lib/backend/http";
import {
  isPhoneLoginAvailable,
  onPhoneAutoVerified,
  resetPhoneVerification,
  startPhoneVerification,
  type PhoneVerification
} from "@/lib/phone-auth";
import { palette, radii, shadow } from "@/lib/theme";
import { roleLabels, type AppRole } from "@mahalaxmi/core/types/domain";
import { useAuth } from "@/providers/auth-provider";
import { useMobileNavigation } from "@/providers/navigation-provider";

type AuthMode = "login" | "signup";
type LoginMethod = "email" | "phone";
const PHONE_LOGIN = isPhoneLoginAvailable();

const ROLE_OPTIONS: Array<{ role: AppRole; icon: keyof typeof Feather.glyphMap; description: string }> = [
  { role: "customer", icon: "home", description: "Buy materials, raise complaints and installation requests" },
  { role: "electrician", icon: "zap", description: "Take jobs, order materials and earn rewards" },
  { role: "architect", icon: "pen-tool", description: "Plan lighting and review material for your sites" }
];

// Optional: the web app's address, so password-reset and confirmation emails open its /auth page.
const WEB_APP_URL = (process.env.EXPO_PUBLIC_WEB_APP_URL || "").replace(/\/$/, "");

function normalizeUsername(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 24);
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizePhone(value: string) {
  return value.replace(/[^0-9+]/g, "");
}

/** Accepts 10-digit Indian numbers without a country code. */
function toE164(value: string) {
  const digits = value.replace(/[^0-9+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (/^[6-9][0-9]{9}$/.test(digits)) return `+91${digits}`;
  return digits;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function mapAuthErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unable to continue.";
  const lower = message.toLowerCase();

  if (lower.includes("invalid login credentials")) {
    return "That email and password don't match. Check them and try again.";
  }
  if (lower.includes("email not confirmed")) {
    return "Please confirm your email first. Open the link we sent you, then log in.";
  }
  if (lower.includes("database error saving new user")) {
    return "We could not finish creating your account. Please try again or contact support.";
  }
  if (lower.includes("error sending confirmation email") || message.includes("535 5.7.8")) {
    return "We could not send the confirmation email right now. Please try again shortly or contact support.";
  }
  if (lower.includes("user already registered")) {
    return "This email is already registered. Log in instead or use another email address.";
  }
  if (lower.includes("password should be at least")) {
    return "Use a password with at least 6 characters.";
  }
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "Too many attempts. Please wait a minute and try again.";
  }
  if (lower.includes("network request failed") || lower.includes("failed to fetch")) {
    return "No internet connection. Check your network and try again.";
  }
  return message;
}

export function AuthScreen() {
  const { replace } = useMobileNavigation();
  const { session, errorMessage: profileError, signOut } = useAuth();
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [role, setRole] = useState<AppRole>("customer");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [canResend, setCanResend] = useState(false);
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("email");
  const [code, setCode] = useState("");
  const [verification, setVerification] = useState<PhoneVerification | null>(null);
  const finishingPhoneLogin = useRef(false);

  // Android may verify the number from the SMS by itself; finish the login when it does.
  useEffect(() => {
    if (!verification) return;
    return onPhoneAutoVerified((idToken) => void completePhoneLogin(idToken));
  }, [verification]);

  async function completePhoneLogin(idToken: string) {
    if (!supabase || finishingPhoneLogin.current) return;
    finishingPhoneLogin.current = true;
    setBusy(true);
    setErrorMessage("");
    try {
      const result = await backendRequest<{ session?: { access_token: string; refresh_token?: string } }>("/api/v1/auth/firebase-login", {
        method: "POST",
        body: { idToken },
        requireAuth: false,
        timeoutMs: 20_000
      });
      const accessToken = result.data?.session?.access_token;
      if (result.error || !accessToken) {
        throw new Error(result.error ?? "We could not sign you in right now. Please try again.");
      }
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: result.data?.session?.refresh_token ?? accessToken
      });
      if (error) throw error;
      await resetPhoneVerification();
      setVerification(null);
      replace("dashboard");
    } catch (error) {
      setErrorMessage(mapAuthErrorMessage(error));
    } finally {
      finishingPhoneLogin.current = false;
      setBusy(false);
    }
  }

  async function handleSendCode() {
    setErrorMessage("");
    setNotice("");
    const number = toE164(phone);
    if (!/^\+[1-9][0-9]{7,14}$/.test(number)) {
      setErrorMessage("Enter your mobile number, e.g. 98765 43210 or +91 98765 43210.");
      return;
    }
    setBusy(true);
    try {
      setVerification(await startPhoneVerification(number));
      setCode("");
      setNotice(`We sent a 6-digit code to ${number}.`);
    } catch (error) {
      setErrorMessage(mapAuthErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyCode() {
    if (!verification) return;
    setErrorMessage("");
    if (!/^[0-9]{6}$/.test(code)) {
      setErrorMessage("Enter the 6-digit code from the SMS.");
      return;
    }
    setBusy(true);
    try {
      const idToken = await verification.confirm(code);
      setBusy(false);
      await completePhoneLogin(idToken);
    } catch (error) {
      setErrorMessage(mapAuthErrorMessage(error));
      setBusy(false);
    }
  }

  function switchMode(next: AuthMode) {
    setAuthMode(next);
    setLoginMethod("email");
    setVerification(null);
    setErrorMessage("");
    setNotice("");
    setCanResend(false);
  }

  async function handleSubmit() {
    if (!supabase) return;
    setErrorMessage("");
    setNotice("");
    setCanResend(false);

    if (!isValidEmail(email)) {
      setErrorMessage("Enter a valid email address.");
      return;
    }
    if (password.length < 6) {
      setErrorMessage("Use a password with at least 6 characters.");
      return;
    }
    if (authMode === "signup" && (!fullName.trim() || !username)) {
      setErrorMessage("Add your full name and a username.");
      return;
    }

    setBusy(true);
    try {
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName.trim(), username, role, phone },
            ...(WEB_APP_URL ? { emailRedirectTo: `${WEB_APP_URL}/auth` } : {})
          }
        });
        if (error) throw error;

        if (!data.session) {
          // Email confirmation is required before the first login.
          setAuthMode("login");
          setPassword("");
          setCanResend(true);
          setNotice(`Account created. We sent a confirmation link to ${email}. Open it, then come back and log in.`);
          return;
        }
        replace("dashboard");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          if (error.message.toLowerCase().includes("email not confirmed")) setCanResend(true);
          throw error;
        }
        replace("dashboard");
      }
    } catch (error) {
      setErrorMessage(mapAuthErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotPassword() {
    if (!supabase) return;
    setErrorMessage("");
    setNotice("");
    if (!isValidEmail(email)) {
      setErrorMessage("Enter your email above, then tap Forgot password again.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email,
        WEB_APP_URL ? { redirectTo: `${WEB_APP_URL}/auth?reset=true` } : undefined
      );
      if (error) throw error;
      setNotice(`If ${email} has an account, a password reset link is on its way.`);
    } catch (error) {
      setErrorMessage(mapAuthErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    if (!supabase || !isValidEmail(email)) return;
    setBusy(true);
    setErrorMessage("");
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) throw error;
      setNotice(`We sent a new confirmation link to ${email}.`);
    } catch (error) {
      setErrorMessage(mapAuthErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const isSignup = authMode === "signup";
  const usePhone = !isSignup && loginMethod === "phone";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.brandPanel}>
            <View style={styles.glowLarge} />
            <View style={styles.glowSmall} />
            <Image source={require("../../assets/splash-icon.png")} style={styles.logo} accessibilityIgnoresInvertColors />
            <Text style={styles.brandName}>Mahalaxmi Electricals</Text>
            <Text style={styles.brandTagline}>
              {isSignup ? "Create your account in under a minute." : "Welcome back. Log in to continue."}
            </Text>
          </View>

          <View style={styles.sheet}>
            <View style={styles.segment} accessibilityRole="tablist">
              {(["login", "signup"] as const).map((mode) => {
                const active = authMode === mode;
                return (
                  <Pressable
                    key={mode}
                    style={[styles.segmentButton, active && styles.segmentButtonActive]}
                    onPress={() => switchMode(mode)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                      {mode === "login" ? "Log in" : "Sign up"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {session && profileError ? (
              <View style={styles.block}>
                <Notice message={`${profileError} Please check your connection, or sign out and log in again.`} tone="error" />
                <AppButton label="Sign out" kind="secondary" icon="log-out" onPress={() => void signOut()} />
              </View>
            ) : null}

            {isSignup ? (
              <View style={styles.block}>
                <Text style={styles.groupLabel}>I am a</Text>
                {ROLE_OPTIONS.map((option) => {
                  const active = role === option.role;
                  return (
                    <Pressable
                      key={option.role}
                      style={[styles.roleCard, active && styles.roleCardActive]}
                      onPress={() => setRole(option.role)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active }}
                    >
                      <View style={[styles.roleIcon, active && styles.roleIconActive]}>
                        <Feather name={option.icon} size={18} color={active ? "#ffffff" : palette.brand} />
                      </View>
                      <View style={styles.flex}>
                        <Text style={styles.roleTitle}>{roleLabels[option.role]}</Text>
                        <Text style={styles.roleDescription}>{option.description}</Text>
                      </View>
                      <Feather name={active ? "check-circle" : "circle"} size={20} color={active ? palette.brand : palette.lineStrong} />
                    </Pressable>
                  );
                })}
                <Field label="Full name" value={fullName} onChangeText={setFullName} icon="user" autoComplete="name" placeholder="Your name" />
                <Field
                  label="Username"
                  value={username}
                  onChangeText={(value) => setUsername(normalizeUsername(value))}
                  icon="at-sign"
                  autoCapitalize="none"
                  placeholder="e.g. ravi.kumar"
                />
              </View>
            ) : null}

            {!isSignup && PHONE_LOGIN ? (
              <View style={styles.methodRow}>
                {(["email", "phone"] as const).map((method) => {
                  const active = loginMethod === method;
                  return (
                    <Pressable
                      key={method}
                      style={[styles.methodButton, active && styles.methodButtonActive]}
                      onPress={() => {
                        setLoginMethod(method);
                        setErrorMessage("");
                        setNotice("");
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active }}
                    >
                      <Feather name={method === "email" ? "mail" : "smartphone"} size={15} color={active ? palette.brand : palette.muted} />
                      <Text style={[styles.methodText, active && styles.methodTextActive]}>{method === "email" ? "Email" : "Phone"}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {usePhone ? (
              <View style={styles.block}>
                <Field
                  label="Mobile number"
                  value={phone}
                  onChangeText={(value) => {
                    setPhone(normalizePhone(value));
                    setVerification(null);
                  }}
                  placeholder="98765 43210"
                  icon="smartphone"
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  hint={verification ? undefined : "New number? We'll create a customer account for you."}
                />
                {verification ? (
                  <>
                    <Field
                      label="6-digit code"
                      value={code}
                      onChangeText={(value) => setCode(value.replace(/[^0-9]/g, "").slice(0, 6))}
                      placeholder="123456"
                      icon="key"
                      keyboardType="number-pad"
                      autoComplete="sms-otp"
                    />
                    <Pressable onPress={() => void handleSendCode()} disabled={busy} style={styles.linkButton} hitSlop={8} accessibilityRole="button">
                      <Text style={styles.linkText}>Resend code</Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
            ) : (
            <View style={styles.block}>
                <Field
                  label="Email"
                  value={email}
                  onChangeText={(value) => setEmail(normalizeEmail(value))}
                  placeholder="you@example.com"
                  icon="mail"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />
                {isSignup ? (
                  <Field
                    label="Phone (optional)"
                    value={phone}
                    onChangeText={(value) => setPhone(normalizePhone(value))}
                    placeholder="+91 98765 43210"
                    icon="phone"
                    keyboardType="phone-pad"
                    autoComplete="tel"
                  />
                ) : null}
                <Field
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  icon="lock"
                  placeholder={isSignup ? "At least 6 characters" : "Your password"}
                  autoComplete={isSignup ? "new-password" : "current-password"}
                />
                {!isSignup ? (
                  <Pressable onPress={() => void handleForgotPassword()} disabled={busy} style={styles.linkButton} hitSlop={8} accessibilityRole="button">
                    <Text style={styles.linkText}>Forgot password?</Text>
                  </Pressable>
                ) : null}
              </View>
  
            )}

            {errorMessage ? <Notice message={errorMessage} tone="error" /> : null}
            {notice ? <Notice message={notice} tone="success" /> : null}

            {usePhone ? (
              <AppButton
                label={verification ? "Verify and log in" : "Send code"}
                icon={verification ? "check" : "message-square"}
                loading={busy}
                onPress={() => void (verification ? handleVerifyCode() : handleSendCode())}
              />
            ) : (
              <AppButton
                label={isSignup ? "Create account" : "Log in"}
                icon={isSignup ? "user-plus" : "log-in"}
                loading={busy}
                onPress={() => void handleSubmit()}
              />
            )}

            {canResend ? (
              <Pressable onPress={() => void handleResend()} disabled={busy} style={styles.centerLink} accessibilityRole="button">
                <Text style={styles.linkText}>Didn&apos;t get the email? Send it again</Text>
              </Pressable>
            ) : null}

            <Pressable onPress={() => switchMode(isSignup ? "login" : "signup")} style={styles.centerLink} accessibilityRole="button">
              <Text style={styles.switchText}>
                {isSignup ? "Already have an account? " : "New here? "}
                <Text style={styles.linkText}>{isSignup ? "Log in" : "Create an account"}</Text>
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.night },
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },
  brandPanel: {
    overflow: "hidden",
    alignItems: "center",
    paddingTop: 36,
    paddingBottom: 56,
    paddingHorizontal: 24
  },
  glowLarge: {
    position: "absolute",
    right: -80,
    top: -60,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(194, 87, 12, 0.35)"
  },
  glowSmall: {
    position: "absolute",
    left: -60,
    bottom: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(224, 163, 58, 0.12)"
  },
  logo: { width: 96, height: 96, marginBottom: 14 },
  brandName: { color: "#ffffff", fontSize: 26, fontWeight: "900", letterSpacing: -0.3, textAlign: "center" },
  brandTagline: { color: palette.nightMuted, fontSize: 15, marginTop: 8, textAlign: "center", lineHeight: 21 },
  sheet: {
    flexGrow: 1,
    marginTop: -28,
    backgroundColor: palette.bg,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 32,
    gap: 16
  },
  segment: {
    flexDirection: "row",
    padding: 4,
    borderRadius: radii.md,
    backgroundColor: "#efe6da"
  },
  segmentButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  segmentButtonActive: { backgroundColor: palette.surface, ...shadow },
  segmentText: { fontWeight: "700", color: palette.muted, fontSize: 15 },
  segmentTextActive: { color: palette.ink },
  block: { gap: 12 },
  groupLabel: { fontWeight: "800", color: palette.ink, fontSize: 15 },
  roleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: palette.line,
    backgroundColor: palette.surface
  },
  roleCardActive: { borderColor: palette.brand, backgroundColor: palette.brandSoft },
  roleIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.brandSoft
  },
  roleIconActive: { backgroundColor: palette.brand },
  roleTitle: { fontWeight: "800", color: palette.ink, fontSize: 15 },
  roleDescription: { color: palette.muted, fontSize: 12.5, marginTop: 2, lineHeight: 17 },
  linkButton: { alignSelf: "flex-end", paddingVertical: 4 },
  methodRow: { flexDirection: "row", gap: 10 },
  methodButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: palette.line,
    backgroundColor: palette.surface
  },
  methodButtonActive: { borderColor: palette.brand, backgroundColor: palette.brandSoft },
  methodText: { fontWeight: "700", color: palette.muted },
  methodTextActive: { color: palette.brandDeep },
  centerLink: { alignSelf: "center", paddingVertical: 6 },
  linkText: { color: palette.brand, fontWeight: "800", fontSize: 14 },
  switchText: { color: palette.muted, fontSize: 14 }
});
