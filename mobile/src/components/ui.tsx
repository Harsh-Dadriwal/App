import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type KeyboardTypeOptions,
  type TextInputProps
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { palette, radii, shadow } from "@/lib/theme";
import { subscribeQueryActivity } from "@mahalaxmi/core/hooks/query-cache";
import { roleLabels } from "@mahalaxmi/core/types/domain";
import { useAuth } from "@/providers/auth-provider";
import {
  useMobileNavigation,
  type MobileScreen
} from "@/providers/navigation-provider";

type IconName = keyof typeof Feather.glyphMap;

const tabConfig: Record<string, Array<{ key: MobileScreen; label: string; icon: IconName }>> = {
  customer: [
    { key: "dashboard", label: "Home", icon: "home" },
    { key: "shop", label: "Shop", icon: "shopping-bag" },
    { key: "orders", label: "Orders", icon: "package" },
    { key: "quotations", label: "Quotes", icon: "file-text" },
    { key: "service-requests", label: "Service", icon: "tool" }
  ],
  electrician: [
    { key: "dashboard", label: "Home", icon: "home" },
    { key: "shop", label: "Shop", icon: "shopping-bag" },
    { key: "orders", label: "Orders", icon: "package" },
    { key: "quotations", label: "Quotes", icon: "file-text" },
    { key: "service-requests", label: "Jobs", icon: "tool" }
  ],
  architect: [
    { key: "dashboard", label: "Home", icon: "home" },
    { key: "shop", label: "Shop", icon: "shopping-bag" },
    { key: "orders", label: "Orders", icon: "package" },
    { key: "quotations", label: "Quotes", icon: "file-text" },
    { key: "incentives", label: "Rewards", icon: "award" }
  ],
  admin: [
    { key: "dashboard", label: "Home", icon: "home" },
    { key: "orders", label: "Orders", icon: "package" },
    { key: "quotations", label: "Quotes", icon: "file-text" },
    { key: "price-list", label: "Prices", icon: "tag" },
    { key: "service-requests", label: "Service", icon: "tool" }
  ]
};

export function ScreenShell({
  title,
  subtitle,
  children,
  scroll = true,
  currentScreen,
  showBack,
  footer
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  scroll?: boolean;
  currentScreen?: MobileScreen;
  showBack?: boolean;
  /** Floats above the tab bar, e.g. a cart summary. */
  footer?: React.ReactNode;
}) {
  const { width } = useWindowDimensions();
  const { profile, session, tenantMemberships, activeTenant, switchTenant } = useAuth();
  const { screen, replace, goBack, canGoBack } = useMobileNavigation();
  const activeScreen = currentScreen ?? screen;
  const tabs = profile ? tabConfig[profile.role] ?? [] : [];
  const showTabs = Boolean(profile && session && tabs.length);
  const compact = width < 390;

  const content = (
    <View style={styles.screen}>
      <View style={[styles.hero, compact && styles.heroCompact]}>
        <View style={styles.heroGlowLarge} />
        <View style={styles.heroGlowSmall} />
        <View style={styles.heroTopRow}>
          {showBack && canGoBack ? (
            <Pressable style={styles.backButton} onPress={goBack} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8}>
              <Feather name="arrow-left" size={18} color={palette.nightText} />
            </Pressable>
          ) : (
            <View style={styles.brandMark}>
              <Feather name="zap" size={16} color={palette.night} />
            </View>
          )}
          <View style={styles.heroTopCopy}>
            <Text style={styles.workspaceName} numberOfLines={1}>
              {activeTenant?.app_name ?? "Mahalaxmi Electricals"}
            </Text>
            <Text style={styles.kicker} numberOfLines={1}>
              {profile ? `${roleLabels[profile.role]}${activeTenant?.display_name ? ` · ${activeTenant.display_name}` : ""}` : "Electrical supplies & services"}
            </Text>
          </View>
          {profile ? (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(profile.full_name ?? profile.email ?? "U").slice(0, 1).toUpperCase()}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {tenantMemberships.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tenantSwitchRow}>
            <View style={styles.tenantSwitchWrap}>
              {tenantMemberships.map((membership) => {
                const isActive = membership.tenant_id === activeTenant?.id;
                return (
                  <Pressable
                    key={membership.id}
                    style={[styles.tenantPill, isActive && styles.tenantPillActive]}
                    onPress={() => void switchTenant(membership.tenant_id)}
                  >
                    <Text style={[styles.tenantPillText, isActive && styles.tenantPillTextActive]}>
                      {membership.branding?.app_name ?? membership.tenant?.display_name ?? membership.tenant_id}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        ) : null}
      </View>
      {children}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <RefreshLine />
      <KeyboardAvoidingView
        style={styles.keyboardAvoider}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
      >
        {scroll ? (
          <ScrollView
            contentContainerStyle={[styles.scroll, showTabs && styles.scrollWithTabs]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {content}
          </ScrollView>
        ) : (
          <View style={[styles.nonScrollBody, showTabs && styles.scrollWithTabs]}>{content}</View>
        )}
      </KeyboardAvoidingView>
      {footer ? <View style={[styles.footer, showTabs && styles.footerWithTabs]}>{footer}</View> : null}
      {showTabs ? (
        <SafeAreaView edges={["bottom"]} style={styles.tabBarWrap}>
          <View style={styles.tabBar}>
            {tabs.map((tab) => {
              const active = tab.key === activeScreen;
              return (
                <Pressable
                  key={tab.key}
                  style={[styles.tabButton, active && styles.tabButtonActive]}
                  onPress={() => replace(tab.key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={tab.label}
                >
                  <Feather name={tab.icon} size={19} color={active ? "#ffffff" : palette.muted} />
                  <Text style={[styles.tabLabel, active && styles.tabLabelActive]} numberOfLines={1}>
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </SafeAreaView>
      ) : null}
    </SafeAreaView>
  );
}

export function Card({
  children,
  tone = "default"
}: {
  children: React.ReactNode;
  tone?: "default" | "soft" | "brand" | "danger";
}) {
  return (
    <View
      style={[
        styles.card,
        tone === "soft" && styles.cardSoft,
        tone === "brand" && styles.cardBrand,
        tone === "danger" && styles.cardDanger
      ]}
    >
      {children}
    </View>
  );
}

export function SectionTitle({
  title,
  description,
  action
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionHead}>
      <View style={styles.sectionCopy}>
        <View style={styles.sectionTitleRow}>
          <View style={styles.sectionAccent} />
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        {description ? <Text style={styles.sectionDescription}>{description}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function AppButton({
  label,
  onPress,
  kind = "primary",
  disabled = false,
  loading = false,
  icon
}: {
  label: string;
  onPress: () => void;
  kind?: "primary" | "secondary";
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
}) {
  const primary = kind === "primary";
  const tint = primary ? "#ffffff" : palette.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonSecondary,
        pressed && styles.buttonPressed,
        (disabled || loading) && styles.buttonDisabled
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={tint} /> : icon ? <Feather name={icon} size={17} color={tint} /> : null}
      <Text style={primary ? styles.buttonPrimaryText : styles.buttonSecondaryText}>{label}</Text>
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  multiline = false,
  icon,
  hint,
  keyboardType,
  autoCapitalize,
  autoComplete
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  multiline?: boolean;
  icon?: IconName;
  hint?: string;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps["autoCapitalize"];
  autoComplete?: TextInputProps["autoComplete"];
}) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputShell, multiline && styles.inputShellMultiline, focused && styles.inputShellFocused]}>
        {icon ? <Feather name={icon} size={17} color={focused ? palette.brand : palette.muted} style={multiline ? styles.inputIconTop : undefined} /> : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#a89c8d"
          style={[styles.input, multiline && styles.textarea]}
          secureTextEntry={secureTextEntry && !revealed}
          multiline={multiline}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize ?? (secureTextEntry ? "none" : undefined)}
          autoComplete={autoComplete}
          autoCorrect={secureTextEntry ? false : undefined}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={label}
        />
        {secureTextEntry ? (
          <Pressable
            onPress={() => setRevealed((current) => !current)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={revealed ? "Hide password" : "Show password"}
          >
            <Feather name={revealed ? "eye-off" : "eye"} size={18} color={palette.muted} />
          </Pressable>
        ) : null}
      </View>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  if (!onPress) {
    return (
      <View style={[styles.chip, active && styles.chipActive]}>
        <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
      </View>
    );
  }
  return (
    <Pressable
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.buttonPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(active) }}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function QueryState({
  loading,
  error,
  empty,
  hasData,
  children
}: {
  loading: boolean;
  error: string | null;
  empty: string;
  hasData: boolean;
  children: React.ReactNode;
}) {
  if (loading) {
    return <SkeletonList />;
  }

  if (error) {
    return (
      <View style={[styles.stateCard, styles.stateCardError]}>
        <Feather name="alert-circle" size={22} color={palette.danger} />
        <Text style={[styles.errorText, styles.stateText]}>{error}</Text>
      </View>
    );
  }

  if (!hasData) {
    return (
      <View style={styles.stateCard}>
        <Feather name="inbox" size={22} color={palette.muted} />
        <Text style={[styles.mutedText, styles.stateText]}>{empty}</Text>
      </View>
    );
  }

  return <>{children}</>;
}

/**
 * Thin sliding line at the top of the screen while fresh data loads in the background.
 * Waits 250ms before showing so quick refreshes do not flicker.
 */
function RefreshLine() {
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  const { width } = useWindowDimensions();
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => subscribeQueryActivity(setBusy), []);

  useEffect(() => {
    if (!busy) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), 250);
    return () => clearTimeout(timer);
  }, [busy]);

  useEffect(() => {
    if (!visible) return;
    slide.setValue(0);
    const loop = Animated.loop(Animated.timing(slide, { toValue: 1, duration: 1100, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [visible, slide]);

  // The track always keeps its 3px so the screen does not shift when the line appears.
  if (!visible) return <View pointerEvents="none" style={styles.refreshTrack} />;
  const translateX = slide.interpolate({ inputRange: [0, 1], outputRange: [-width * 0.4, width] });
  return (
    <View pointerEvents="none" style={styles.refreshTrack}>
      <Animated.View style={[styles.refreshBar, { width: width * 0.4, transform: [{ translateX }] }]} />
    </View>
  );
}

/** A gently pulsing placeholder block, shaped like the content it stands in for. */
function SkeletonBlock({ width, height = 12, pulse }: { width: number | `${number}%`; height?: number; pulse: Animated.Value }) {
  return <Animated.View style={[styles.skeletonBlock, { width, height, opacity: pulse }]} />;
}

/** Placeholder cards shown while a list loads for the first time. */
export function SkeletonList({ count = 3 }: { count?: number }) {
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Loading" style={{ gap: 12 }}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={styles.skeletonCard}>
          <SkeletonBlock width="35%" pulse={pulse} />
          <SkeletonBlock width={index % 2 ? "62%" : "78%"} height={18} pulse={pulse} />
          <SkeletonBlock width="90%" pulse={pulse} />
          <SkeletonBlock width="50%" pulse={pulse} />
        </View>
      ))}
    </View>
  );
}

export function Notice({
  message,
  tone = "default"
}: {
  message: string;
  tone?: "default" | "error" | "success";
}) {
  const icon: IconName = tone === "error" ? "alert-circle" : tone === "success" ? "check-circle" : "info";
  const color = tone === "error" ? palette.danger : tone === "success" ? palette.success : palette.brandDeep;
  return (
    <View
      style={[styles.notice, tone === "error" && styles.noticeError, tone === "success" && styles.noticeSuccess]}
      accessibilityLiveRegion="polite"
    >
      <Feather name={icon} size={18} color={color} />
      <Text style={[styles.noticeText, { color }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: palette.bg
  },
  keyboardAvoider: {
    flex: 1
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 28
  },
  scrollWithTabs: {
    paddingBottom: 116
  },
  nonScrollBody: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8
  },
  screen: {
    gap: 16
  },
  hero: {
    overflow: "hidden",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 22,
    borderRadius: radii.xl,
    backgroundColor: palette.night,
    ...shadow,
    shadowOpacity: 0.18,
    elevation: 6
  },
  heroCompact: {
    paddingHorizontal: 18
  },
  heroGlowLarge: {
    position: "absolute",
    right: -60,
    top: -70,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(194, 87, 12, 0.35)"
  },
  heroGlowSmall: {
    position: "absolute",
    right: 40,
    bottom: -50,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "rgba(224, 163, 58, 0.16)"
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20
  },
  heroTopCopy: {
    flex: 1,
    gap: 2
  },
  brandMark: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: palette.gold,
    alignItems: "center",
    justifyContent: "center"
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center"
  },
  workspaceName: {
    color: palette.nightText,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.2
  },
  kicker: {
    color: palette.nightMuted,
    fontSize: 12,
    fontWeight: "600"
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.brand,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.35)",
    alignItems: "center",
    justifyContent: "center"
  },
  avatarText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800"
  },
  title: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 33,
    letterSpacing: -0.3
  },
  titleCompact: {
    fontSize: 25,
    lineHeight: 30
  },
  subtitle: {
    color: palette.nightMuted,
    marginTop: 8,
    lineHeight: 21,
    fontSize: 14
  },
  tenantSwitchRow: {
    marginTop: 16
  },
  tenantSwitchWrap: {
    flexDirection: "row",
    gap: 8
  },
  tenantPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.1)"
  },
  tenantPillActive: {
    backgroundColor: palette.gold
  },
  tenantPillText: {
    color: palette.nightText,
    fontWeight: "700",
    fontSize: 12
  },
  tenantPillTextActive: {
    color: palette.night
  },
  card: {
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.line,
    borderRadius: radii.lg,
    backgroundColor: palette.surface,
    ...shadow,
    gap: 10
  },
  cardSoft: {
    backgroundColor: palette.surfaceSoft,
    shadowOpacity: 0,
    elevation: 0,
    borderWidth: 1
  },
  cardBrand: {
    backgroundColor: palette.brandSoft,
    borderColor: "rgba(194, 87, 12, 0.18)",
    borderWidth: 1
  },
  cardDanger: {
    backgroundColor: palette.dangerSoft,
    borderColor: "rgba(220, 38, 38, 0.25)",
    borderWidth: 1
  },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    marginTop: 4
  },
  sectionCopy: {
    flex: 1,
    gap: 4
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  sectionAccent: {
    width: 4,
    height: 18,
    borderRadius: 2,
    backgroundColor: palette.brand
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: palette.ink,
    letterSpacing: -0.2
  },
  sectionDescription: {
    color: palette.muted,
    lineHeight: 20,
    fontSize: 13.5
  },
  button: {
    minHeight: 52,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    flexDirection: "row",
    gap: 8
  },
  buttonPrimary: {
    backgroundColor: palette.brand,
    shadowColor: palette.brand,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4
  },
  buttonSecondary: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.lineStrong
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }]
  },
  buttonDisabled: {
    opacity: 0.5
  },
  buttonPrimaryText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 15
  },
  buttonSecondaryText: {
    color: palette.ink,
    fontWeight: "800",
    fontSize: 15
  },
  fieldWrap: {
    gap: 7,
    marginBottom: 4
  },
  fieldLabel: {
    fontWeight: "700",
    color: palette.ink,
    fontSize: 13.5
  },
  fieldHint: {
    color: palette.muted,
    fontSize: 12.5,
    lineHeight: 17
  },
  inputShell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: palette.line,
    borderRadius: radii.md,
    backgroundColor: palette.surfaceSoft
  },
  inputShellMultiline: {
    alignItems: "flex-start",
    paddingVertical: 12
  },
  inputShellFocused: {
    borderColor: palette.brand,
    backgroundColor: palette.surface
  },
  inputIconTop: {
    marginTop: 2
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    color: palette.ink,
    fontSize: 15
  },
  textarea: {
    minHeight: 96,
    paddingVertical: 0,
    textAlignVertical: "top"
  },
  chip: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface
  },
  chipActive: {
    backgroundColor: palette.brand,
    borderColor: palette.brand
  },
  chipText: {
    color: palette.ink,
    fontWeight: "700",
    fontSize: 13.5
  },
  chipTextActive: {
    color: "#ffffff"
  },
  stateCard: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 28,
    paddingHorizontal: 20,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: palette.lineStrong,
    backgroundColor: palette.surfaceSoft
  },
  refreshTrack: {
    height: 3,
    overflow: "hidden"
  },
  refreshBar: {
    height: 3,
    borderRadius: 3,
    backgroundColor: palette.brand
  },
  skeletonCard: {
    gap: 12,
    padding: 18,
    borderRadius: radii.lg,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.line
  },
  skeletonBlock: {
    borderRadius: 999,
    backgroundColor: palette.line
  },
  stateCardError: {
    borderColor: "rgba(220, 38, 38, 0.35)",
    backgroundColor: palette.dangerSoft
  },
  stateText: {
    textAlign: "center"
  },
  centerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  mutedText: {
    color: palette.muted,
    lineHeight: 21
  },
  errorText: {
    color: palette.danger,
    lineHeight: 21
  },
  successText: {
    color: palette.success,
    lineHeight: 21
  },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: radii.md,
    backgroundColor: palette.brandSoft
  },
  noticeError: {
    backgroundColor: palette.dangerSoft
  },
  noticeSuccess: {
    backgroundColor: palette.successSoft
  },
  noticeText: {
    flex: 1,
    lineHeight: 20,
    fontWeight: "600"
  },
  footer: { position: "absolute", left: 14, right: 14, bottom: 16 },
  footerWithTabs: { bottom: 96 },
  tabBarWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0
  },
  tabBar: {
    marginHorizontal: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
    padding: 6,
    borderRadius: 24,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.line,
    ...shadow,
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 10
  },
  tabButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: 3
  },
  tabButtonActive: {
    backgroundColor: palette.brand
  },
  tabLabel: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: "700"
  },
  tabLabelActive: {
    color: "#ffffff"
  }
});


export function BottomActionSheet({
  visible,
  onClose,
  title,
  children
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={sheetStyles.overlay} onPress={onClose}>
        <Pressable style={sheetStyles.container} pointerEvents="box-none">
          <View style={sheetStyles.handle} />
          <View style={sheetStyles.header}>
            <Text style={sheetStyles.title}>{title}</Text>
            <Pressable
              style={sheetStyles.closeBtn}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Feather name="x" size={20} color={palette.ink} />
            </Pressable>
          </View>
          <View style={sheetStyles.content}>{children}</View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

import { PanResponder, Animated, Modal } from "react-native";
import { useRef, useMemo } from "react";

export function SlideToConfirm({
  label = "Slide to confirm",
  onConfirm,
  color = palette.brand
}: {
  label?: string;
  onConfirm: () => void;
  color?: string;
}) {
  const pan = useRef(new Animated.Value(0)).current;
  const containerWidth = useRef(0);
  const knobWidth = 50;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderMove: (_, gestureState) => {
          const maxDx = containerWidth.current - knobWidth - 8;
          if (gestureState.dx > 0) {
            pan.setValue(Math.min(gestureState.dx, maxDx));
          }
        },
        onPanResponderRelease: (_, gestureState) => {
          const maxDx = containerWidth.current - knobWidth - 8;
          if (gestureState.dx >= maxDx * 0.85) {
            Animated.timing(pan, {
              toValue: maxDx,
              duration: 100,
              useNativeDriver: true,
            }).start(() => {
              onConfirm();
              Animated.timing(pan, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
              }).start();
            });
          } else {
            Animated.spring(pan, {
              toValue: 0,
              useNativeDriver: true,
            }).start();
          }
        },
      }),
    [onConfirm, pan]
  );

  return (
    <View
      style={slideStyles.track}
      onLayout={(e) => {
        containerWidth.current = e.nativeEvent.layout.width;
      }}
    >
      <Text style={slideStyles.label}>{label}</Text>
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          slideStyles.knob,
          {
            backgroundColor: color,
            transform: [{ translateX: pan }],
          },
        ]}
      >
        <Feather name="chevrons-right" size={20} color="#fff" />
      </Animated.View>
    </View>
  );
}

const sheetStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingBottom: 34,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: palette.line,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: palette.lineStrong,
    alignSelf: "center",
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: palette.ink,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.line,
  },
  content: {
    gap: 12,
  },
});

const slideStyles = StyleSheet.create({
  track: {
    height: 58,
    borderRadius: 20,
    backgroundColor: palette.surfaceSoft,
    borderWidth: 1,
    borderColor: palette.lineStrong,
    justifyContent: "center",
    paddingHorizontal: 4,
    overflow: "hidden",
    position: "relative",
  },
  label: {
    textAlign: "center",
    fontWeight: "800",
    fontSize: 14,
    color: palette.muted,
    width: "100%",
  },
  knob: {
    position: "absolute",
    left: 4,
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
});
