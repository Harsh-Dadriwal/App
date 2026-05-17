import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppButton, Card, Field, Notice, ScreenShell } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { palette } from "@/lib/theme";
import { roleLabels, type AppRole } from "@mahalaxmi/core/types/domain";
import { useMobileNavigation } from "@/providers/navigation-provider";

type AuthMode = "login" | "signup";
type AuthMethod = "email" | "phone";

export function AuthScreen() {
  const { replace } = useMobileNavigation();
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authMethod, setAuthMethod] = useState<AuthMethod>("email");
  const [role, setRole] = useState<AppRole>("customer");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");

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

  async function handleEmail() {
    if (!supabase) return;
    setBusy(true);
    setErrorMessage("");
    setNotice("");
    try {
      if (authMode === "signup") {
        if (!username) {
          throw new Error("Username is required.");
        }

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              username,
              role,
              phone
            }
          }
        });
        if (error) throw error;
        setNotice("Account created. Opening your mobile workspace...");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setNotice("Login successful.");
      }
      replace("dashboard");
    } catch (error) {
      setErrorMessage(mapAuthErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handlePhone() {
    if (!supabase) return;
    setBusy(true);
    setErrorMessage("");
    setNotice("");
    try {
      if (!otpSent) {
        if (authMode === "signup" && !username) {
          throw new Error("Username is required.");
        }

        const { error } = await supabase.auth.signInWithOtp({
          phone,
          options: {
            shouldCreateUser: authMode === "signup",
            data:
              authMode === "signup"
                ? { full_name: fullName, username, role, phone }
                : undefined
          }
        });
        if (error) throw error;
        setOtpSent(true);
        setNotice("OTP sent to your phone.");
      } else {
        const { error } = await supabase.auth.verifyOtp({ phone, token: otp, type: "sms" });
        if (error) throw error;
        replace("dashboard");
      }
    } catch (error) {
      setErrorMessage(mapAuthErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenShell
      title="Mobile site and material operations"
      subtitle="Sign in once and manage approvals, product selection, ordering, notes, and admin workflows from the same Supabase backend."
      currentScreen="dashboard"
    >
      <Card tone="brand">
        <View style={styles.toggleRow}>
          <Pressable style={[styles.toggle, authMode === "login" && styles.toggleActive]} onPress={() => setAuthMode("login")}>
            <Text style={[styles.toggleText, authMode === "login" && styles.toggleTextActive]}>Login</Text>
          </Pressable>
          <Pressable style={[styles.toggle, authMode === "signup" && styles.toggleActive]} onPress={() => setAuthMode("signup")}>
            <Text style={[styles.toggleText, authMode === "signup" && styles.toggleTextActive]}>Sign up</Text>
          </Pressable>
        </View>

        <View style={styles.toggleRow}>
          <Pressable style={[styles.toggle, authMethod === "email" && styles.toggleActive]} onPress={() => setAuthMethod("email")}>
            <Text style={[styles.toggleText, authMethod === "email" && styles.toggleTextActive]}>Email</Text>
          </Pressable>
          <Pressable style={[styles.toggle, authMethod === "phone" && styles.toggleActive]} onPress={() => setAuthMethod("phone")}>
            <Text style={[styles.toggleText, authMethod === "phone" && styles.toggleTextActive]}>Phone</Text>
          </Pressable>
        </View>

        {authMode === "signup" ? (
          <>
            <Text style={styles.roleLabel}>Choose role</Text>
            <View style={styles.roleRow}>
              {(["customer", "electrician", "architect"] as AppRole[]).map((option) => (
                <Pressable key={option} style={[styles.rolePill, role === option && styles.rolePillActive]} onPress={() => setRole(option)}>
                  <Text style={[styles.rolePillText, role === option && styles.rolePillTextActive]}>{roleLabels[option]}</Text>
                </Pressable>
              ))}
            </View>
            <Field label="Full name" value={fullName} onChangeText={setFullName} />
            <Field
              label="Username"
              value={username}
              onChangeText={(value) => setUsername(normalizeUsername(value))}
              placeholder="harshdadriwal"
            />
          </>
        ) : null}

        {authMethod === "email" ? (
          <>
            <Field label="Email" value={email} onChangeText={(value) => setEmail(normalizeEmail(value))} placeholder="you@example.com" />
            {authMode === "signup" ? <Field label="Phone (optional)" value={phone} onChangeText={(value) => setPhone(normalizePhone(value))} placeholder="+91..." /> : null}
            <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry />
            <AppButton label={busy ? "Please wait..." : authMode === "signup" ? "Create account" : "Login"} onPress={() => void handleEmail()} disabled={busy} />
          </>
        ) : (
          <>
            <Field label="Phone" value={phone} onChangeText={(value) => setPhone(normalizePhone(value))} placeholder="+91..." />
            {otpSent ? <Field label="OTP" value={otp} onChangeText={setOtp} placeholder="6-digit code" /> : null}
            <AppButton label={busy ? "Please wait..." : otpSent ? "Verify OTP" : "Send OTP"} onPress={() => void handlePhone()} disabled={busy} />
          </>
        )}
      </Card>

      {notice ? <Notice message={notice} tone="success" /> : null}
      {errorMessage ? <Notice message={errorMessage} tone="error" /> : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  toggleRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  toggle: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceSoft,
    alignItems: "center"
  },
  toggleActive: { backgroundColor: palette.ink, borderColor: palette.ink },
  toggleText: { fontWeight: "700", color: palette.ink },
  toggleTextActive: { color: "#fffaf2" },
  roleLabel: { fontWeight: "700", color: palette.ink, marginBottom: 10 },
  roleRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 14 },
  rolePill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceSoft
  },
  rolePillActive: { backgroundColor: palette.brand, borderColor: palette.brand },
  rolePillText: { color: palette.ink, fontWeight: "700" },
  rolePillTextActive: { color: "#fffaf2" }
});
