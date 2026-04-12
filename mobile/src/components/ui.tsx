import { Feather } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { palette } from "@/lib/theme";
import { roleLabels } from "@/lib/types";
import { useAuth } from "@/providers/auth-provider";
import {
  useMobileNavigation,
  type MobileScreen
} from "@/providers/navigation-provider";

const tabConfig: Record<string, Array<{ key: MobileScreen; label: string; icon: keyof typeof Feather.glyphMap }>> = {
  customer: [
    { key: "dashboard", label: "Home", icon: "home" },
    { key: "catalog", label: "Catalog", icon: "grid" },
    { key: "order-builder", label: "Order", icon: "shopping-bag" },
    { key: "notes", label: "Notes", icon: "message-square" }
  ],
  electrician: [
    { key: "dashboard", label: "Home", icon: "home" },
    { key: "order-builder", label: "Order", icon: "shopping-bag" },
    { key: "materials", label: "Tracker", icon: "layers" },
    { key: "notes", label: "Notes", icon: "message-square" }
  ],
  architect: [
    { key: "dashboard", label: "Home", icon: "home" },
    { key: "catalog", label: "Catalog", icon: "grid" },
    { key: "materials", label: "Tracker", icon: "layers" },
    { key: "notes", label: "Notes", icon: "message-square" }
  ],
  admin: [
    { key: "dashboard", label: "Home", icon: "home" },
    { key: "admin-catalog", label: "Admin", icon: "settings" },
    { key: "catalog", label: "Products", icon: "package" },
    { key: "notes", label: "Notes", icon: "message-square" }
  ]
};

export function ScreenShell({
  title,
  subtitle,
  children,
  scroll = true,
  currentScreen,
  showBack
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  scroll?: boolean;
  currentScreen?: MobileScreen;
  showBack?: boolean;
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
        <View style={styles.heroGlow} />
        <View style={styles.heroTopRow}>
          <View style={styles.heroTopLeft}>
            {showBack && canGoBack ? (
              <Pressable style={styles.backButton} onPress={goBack}>
                <Feather name="arrow-left" size={16} color={palette.ink} />
                <Text style={styles.backButtonText}>Back</Text>
              </Pressable>
            ) : (
              <View style={styles.workspaceBadge}>
              <Text style={styles.workspaceBadgeText}>
                {activeTenant?.app_name ?? (profile ? `${roleLabels[profile.role]} mobile` : "Mahalaxmi Electricals")}
              </Text>
            </View>
            )}
            {profile ? (
              <Text style={styles.kicker}>
                {activeTenant?.display_name || profile.company_name || profile.city || "Live field workspace"}
              </Text>
            ) : (
              <Text style={styles.kicker}>Fast field operations</Text>
            )}
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
    <SafeAreaView style={styles.safe}>
      <View style={styles.backgroundTintTop} />
      <View style={styles.backgroundTintBottom} />
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.scroll, showTabs && styles.scrollWithTabs]}
          showsVerticalScrollIndicator={false}
        >
          {content}
        </ScrollView>
      ) : (
        <View style={[styles.nonScrollBody, showTabs && styles.scrollWithTabs]}>{content}</View>
      )}
      {showTabs ? (
        <View style={styles.tabBar}>
          {tabs.map((tab) => {
            const active = tab.key === activeScreen;
            return (
              <Pressable
                key={tab.key}
                style={[styles.tabButton, active && styles.tabButtonActive]}
                onPress={() => replace(tab.key)}
              >
                <Feather
                  name={tab.icon}
                  size={18}
                  color={active ? "#fffaf4" : palette.muted}
                />
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

export function Card({
  children,
  tone = "default"
}: {
  children: React.ReactNode;
  tone?: "default" | "soft" | "brand";
}) {
  return (
    <View
      style={[
        styles.card,
        tone === "soft" && styles.cardSoft,
        tone === "brand" && styles.cardBrand
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
        <Text style={styles.sectionTitle}>{title}</Text>
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
  icon
}: {
  label: string;
  onPress: () => void;
  kind?: "primary" | "secondary";
  disabled?: boolean;
  icon?: keyof typeof Feather.glyphMap;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        kind === "primary" ? styles.buttonPrimary : styles.buttonSecondary,
        disabled && styles.buttonDisabled
      ]}
    >
      {icon ? (
        <Feather
          name={icon}
          size={16}
          color={kind === "primary" ? "#fffaf4" : palette.ink}
        />
      ) : null}
      <Text style={kind === "primary" ? styles.buttonPrimaryText : styles.buttonSecondaryText}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  multiline = false
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  multiline?: boolean;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.muted}
        style={[styles.input, multiline && styles.textarea]}
        secureTextEntry={secureTextEntry}
        multiline={multiline}
      />
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
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
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
    return (
      <Card tone="soft">
        <View style={styles.centerRow}>
          <ActivityIndicator color={palette.brand} />
          <Text style={styles.mutedText}>Loading from Supabase...</Text>
        </View>
      </Card>
    );
  }

  if (error) {
    return (
      <Card tone="soft">
        <Text style={styles.errorText}>{error}</Text>
      </Card>
    );
  }

  if (!hasData) {
    return (
      <Card tone="soft">
        <Text style={styles.mutedText}>{empty}</Text>
      </Card>
    );
  }

  return <>{children}</>;
}

export function Notice({
  message,
  tone = "default"
}: {
  message: string;
  tone?: "default" | "error" | "success";
}) {
  return (
    <View
      style={[
        styles.notice,
        tone === "error" && styles.noticeError,
        tone === "success" && styles.noticeSuccess
      ]}
    >
      <Text
        style={[
          styles.noticeText,
          tone === "error" && styles.errorText,
          tone === "success" && styles.successText
        ]}
      >
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: palette.bg
  },
  backgroundTintTop: {
    position: "absolute",
    top: -80,
    left: -40,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(183, 97, 51, 0.12)"
  },
  backgroundTintBottom: {
    position: "absolute",
    right: -50,
    bottom: 60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(39, 95, 99, 0.08)"
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24
  },
  scrollWithTabs: {
    paddingBottom: 110
  },
  nonScrollBody: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 10
  },
  screen: {
    gap: 16
  },
  hero: {
    overflow: "hidden",
    padding: 20,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 28,
    backgroundColor: palette.surfaceRaised,
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4
  },
  heroCompact: {
    padding: 18
  },
  heroGlow: {
    position: "absolute",
    right: -20,
    top: -10,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: palette.brandSoft
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 18
  },
  heroTopLeft: {
    flex: 1,
    gap: 8
  },
  workspaceBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: palette.surfaceSoft,
    borderWidth: 1,
    borderColor: palette.line
  },
  workspaceBadgeText: {
    color: palette.brandDeep,
    textTransform: "uppercase",
    letterSpacing: 1.6,
    fontSize: 11,
    fontWeight: "800"
  },
  backButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: palette.surfaceSoft,
    borderWidth: 1,
    borderColor: palette.line
  },
  backButtonText: {
    color: palette.ink,
    fontWeight: "700"
  },
  kicker: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: "600"
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.ink,
    alignItems: "center",
    justifyContent: "center"
  },
  avatarText: {
    color: "#fffaf4",
    fontSize: 16,
    fontWeight: "800"
  },
  title: {
    color: palette.ink,
    fontSize: 34,
    fontWeight: "900",
    lineHeight: 38
  },
  titleCompact: {
    fontSize: 30,
    lineHeight: 34
  },
  subtitle: {
    color: palette.muted,
    marginTop: 8,
    lineHeight: 22,
    fontSize: 15
  },
  tenantSwitchRow: {
    marginTop: 14
  },
  tenantSwitchWrap: {
    flexDirection: "row",
    gap: 8
  },
  tenantPill: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.lineStrong,
    backgroundColor: palette.surfaceSoft
  },
  tenantPillActive: {
    backgroundColor: palette.ink,
    borderColor: palette.ink
  },
  tenantPillText: {
    color: palette.ink,
    fontWeight: "700",
    fontSize: 12
  },
  tenantPillTextActive: {
    color: "#fffaf4"
  },
  card: {
    padding: 16,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 24,
    backgroundColor: palette.surface,
    shadowColor: palette.shadow,
    shadowOpacity: 0.7,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
    gap: 10
  },
  cardSoft: {
    backgroundColor: palette.surfaceSoft
  },
  cardBrand: {
    backgroundColor: "#fff4ea",
    borderColor: "rgba(183, 97, 51, 0.22)"
  },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start"
  },
  sectionCopy: {
    flex: 1,
    gap: 4
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: palette.ink
  },
  sectionDescription: {
    color: palette.muted,
    lineHeight: 21
  },
  button: {
    minHeight: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    flexDirection: "row",
    gap: 8
  },
  buttonPrimary: {
    backgroundColor: palette.brand
  },
  buttonSecondary: {
    backgroundColor: palette.surfaceSoft,
    borderWidth: 1,
    borderColor: palette.lineStrong
  },
  buttonDisabled: {
    opacity: 0.55
  },
  buttonPrimaryText: {
    color: "#fffaf4",
    fontWeight: "800"
  },
  buttonSecondaryText: {
    color: palette.ink,
    fontWeight: "800"
  },
  fieldWrap: {
    gap: 8
  },
  fieldLabel: {
    fontWeight: "800",
    color: palette.ink
  },
  input: {
    borderWidth: 1,
    borderColor: palette.lineStrong,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: "#fffdfa",
    color: palette.ink
  },
  textarea: {
    minHeight: 110,
    textAlignVertical: "top"
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceSoft
  },
  chipActive: {
    backgroundColor: palette.ink,
    borderColor: palette.ink
  },
  chipText: {
    color: palette.ink,
    fontWeight: "700"
  },
  chipTextActive: {
    color: "#fffaf2"
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
    padding: 14,
    borderRadius: 18,
    backgroundColor: palette.surfaceSoft
  },
  noticeError: {
    backgroundColor: "rgba(178,63,45,0.10)"
  },
  noticeSuccess: {
    backgroundColor: "rgba(46,123,78,0.10)"
  },
  noticeText: {
    color: palette.ink
  },
  tabBar: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: "rgba(25, 22, 19, 0.94)",
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6
  },
  tabButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: 4
  },
  tabButtonActive: {
    backgroundColor: "rgba(255, 250, 244, 0.16)"
  },
  tabLabel: {
    color: "#cbbfaf",
    fontSize: 11,
    fontWeight: "700"
  },
  tabLabelActive: {
    color: "#fffaf4"
  }
});

export const uiStyles = styles;
