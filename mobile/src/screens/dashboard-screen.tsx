import { Feather } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/providers/auth-provider";
import { AppButton, Card, ScreenShell, SectionTitle } from "@/components/ui";
import { palette, radii, shadow } from "@/lib/theme";
import { roleLabels, type AppRole } from "@mahalaxmi/core/types/domain";
import { useMobileNavigation, type MobileScreen } from "@/providers/navigation-provider";

type Action = { label: string; hint: string; route: MobileScreen; icon: keyof typeof Feather.glyphMap };

const notes: Action = { label: "Project notes", hint: "Site conversations", route: "notes", icon: "message-square" };

const selections: Action = { label: "Product selections", hint: "Pick products for a customer", route: "selections", icon: "list" };

const quotations: Action = { label: "Quotations", hint: "Send your list, get prices", route: "quotations", icon: "file-text" };

const roleActions: Record<AppRole, Action[]> = {
  customer: [
    { label: "Shop products", hint: "Live stock, easy ordering", route: "shop", icon: "shopping-bag" },
    { label: "My orders", hint: "Track your orders", route: "orders", icon: "package" },
    quotations,
    { label: "Selections", hint: "Picked by your electrician", route: "selections", icon: "list" },
    { label: "Complaints & installation", hint: "Get an electrician", route: "service-requests", icon: "tool" },
    notes
  ],
  electrician: [
    selections,
    { label: "Order materials", hint: "Live stock from the store", route: "shop", icon: "shopping-bag" },
    { label: "My orders", hint: "Track your orders", route: "orders", icon: "package" },
    quotations,
    { label: "Service requests", hint: "Jobs near you", route: "service-requests", icon: "tool" },
    { label: "Rewards", hint: "Partner incentives", route: "incentives", icon: "award" },
    notes
  ],
  architect: [
    selections,
    { label: "Shop products", hint: "Live stock from the store", route: "shop", icon: "shopping-bag" },
    { label: "My orders", hint: "Track your orders", route: "orders", icon: "package" },
    quotations,
    { label: "Rewards", hint: "Partner incentives", route: "incentives", icon: "award" },
    notes
  ],
  admin: [
    { label: "Orders", hint: "Confirm & deliver", route: "orders", icon: "package" },
    { label: "Quotations", hint: "Price requests", route: "quotations", icon: "file-text" },
    { label: "Selections", hint: "Picked by professionals", route: "selections", icon: "list" },
    { label: "Price list", hint: "Tally prices & stock", route: "price-list", icon: "tag" },
    { label: "Service requests", hint: "Complaints & installs", route: "service-requests", icon: "tool" },
    { label: "Fintech", hint: "Wallets & savings", route: "fintech", icon: "credit-card" },
    notes
  ],
  supplier: [notes],
  pop_man: [notes],
  carpenter: [notes],
  painter: [notes],
  tiles_man: [notes],
  plumber: [notes]
};

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export function DashboardScreen() {
  const { profile, signOut } = useAuth();
  const { navigate } = useMobileNavigation();

  if (!profile) {
    return <ScreenShell title="Loading your workspace" subtitle="Fetching your profile..." />;
  }

  const actions = roleActions[profile.role] ?? [notes];
  const firstName = (profile.full_name ?? "").trim().split(/\s+/)[0] || "there";
  const isPendingProfessional = profile.role !== "customer" && profile.role !== "admin" && profile.verification_status === "pending";

  return (
    <ScreenShell
      title={`${greeting()}, ${firstName}`}
      subtitle="What would you like to do today?"
      currentScreen="dashboard"
    >
      {isPendingProfessional ? (
        <Card tone="brand">
          <View style={styles.row}>
            <Feather name="clock" size={18} color={palette.brandDeep} />
            <Text style={styles.pendingText}>
              Your {roleLabels[profile.role].toLowerCase()} account is waiting for admin verification. You can already look around.
            </Text>
          </View>
        </Card>
      ) : null}

      <SectionTitle title="Quick actions" />
      <View style={styles.grid}>
        {actions.map((action) => (
          <Pressable
            key={`${action.route}-${action.label}`}
            style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
            onPress={() => navigate(action.route)}
            accessibilityRole="button"
            accessibilityLabel={action.label}
          >
            <View style={styles.tileIcon}>
              <Feather name={action.icon} size={20} color={palette.brand} />
            </View>
            <Text style={styles.tileLabel} numberOfLines={2}>{action.label}</Text>
            <Text style={styles.tileHint} numberOfLines={1}>{action.hint}</Text>
          </Pressable>
        ))}
      </View>

      <SectionTitle title="Your account" />
      <Card>
        <View style={styles.row}>
          <View style={styles.accountAvatar}>
            <Text style={styles.accountAvatarText}>{(profile.full_name ?? profile.email ?? "U").slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.accountName}>{profile.full_name ?? "User"}</Text>
            <Text style={styles.accountMeta}>{profile.email ?? profile.phone ?? ""}</Text>
            <Text style={styles.accountMeta}>
              {roleLabels[profile.role]}{profile.company_name ? ` · ${profile.company_name}` : ""}
            </Text>
          </View>
        </View>
        <AppButton label="Log out" icon="log-out" kind="secondary" onPress={() => void signOut()} />
      </Card>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  pendingText: { flex: 1, color: palette.brandDeep, fontWeight: "600", lineHeight: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: {
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 128,
    padding: 16,
    borderRadius: radii.lg,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.line,
    ...shadow
  },
  tilePressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  tileIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: palette.brandSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14
  },
  tileLabel: { fontSize: 15, fontWeight: "800", color: palette.ink, lineHeight: 19 },
  tileHint: { fontSize: 12.5, color: palette.muted, marginTop: 4 },
  accountAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: palette.night,
    alignItems: "center",
    justifyContent: "center"
  },
  accountAvatarText: { color: palette.gold, fontSize: 18, fontWeight: "900" },
  accountName: { fontSize: 16, fontWeight: "800", color: palette.ink },
  accountMeta: { color: palette.muted, fontSize: 13, marginTop: 2 }
});
