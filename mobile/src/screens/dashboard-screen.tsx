import { ScrollView, Text, View } from "react-native";
import { useAuth } from "@/providers/auth-provider";
import { AppButton, Card, ScreenShell, SectionTitle } from "@/components/ui";
import { roleLabels } from "@/lib/types";
import { useMobileNavigation, type MobileScreen } from "@/providers/navigation-provider";

const roleActions = {
  customer: [
    { label: "Browse sites and approvals", route: "dashboard" },
    { label: "Easy product ordering", route: "order-builder" },
    { label: "Project notes", route: "notes" }
  ],
  electrician: [
    { label: "Material tracker", route: "materials" },
    { label: "Fast order builder", route: "order-builder" },
    { label: "Project notes", route: "notes" }
  ],
  architect: [
    { label: "Material reviews", route: "materials" },
    { label: "Request new products", route: "catalog" },
    { label: "Project notes", route: "notes" }
  ],
  admin: [
    { label: "Admin catalog", route: "admin-catalog" },
    { label: "Live products", route: "catalog" },
    { label: "Notes and monitoring", route: "notes" }
  ]
} as const satisfies Record<string, Array<{ label: string; route: MobileScreen }>>;

export function DashboardScreen() {
  const { profile, signOut } = useAuth();
  const { navigate } = useMobileNavigation();

  if (!profile) {
    return (
      <ScreenShell title="Loading workspace" subtitle="Fetching your profile and role-based mobile workspace." />
    );
  }

  return (
    <ScreenShell
      title={`${roleLabels[profile.role]} mobile workspace`}
      subtitle="Designed for field use: quick taps, compact lists, and faster material selection from the same Supabase data."
      currentScreen="dashboard"
    >
      <Card tone="brand">
        <Text style={{ fontSize: 22, fontWeight: "800" }}>{profile.full_name ?? "User"}</Text>
        <Text style={{ marginTop: 6, lineHeight: 22 }}>{profile.email ?? profile.phone ?? roleLabels[profile.role]}</Text>
        <Text style={{ marginTop: 6, lineHeight: 22 }}>
          Role: {roleLabels[profile.role]}{profile.company_name ? ` · ${profile.company_name}` : ""}
        </Text>
      </Card>

      <SectionTitle
        title="Quick actions"
        description="Mobile-first shortcuts for the tasks people actually do on site."
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: "row", gap: 12 }}>
          {roleActions[profile.role].map((action) => (
            <View key={action.route} style={{ width: 260 }}>
              <Card tone="soft">
                <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 10 }}>{action.label}</Text>
                <AppButton label="Open" icon="arrow-up-right" onPress={() => navigate(action.route)} />
              </Card>
            </View>
          ))}
        </View>
      </ScrollView>

      <Card>
        <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 8 }}>Everything stays in sync</Text>
        <Text style={{ lineHeight: 22 }}>
          The mobile app uses the same tables, views, roles, notes, approvals, orders, product requests, and admin controls as the web app.
        </Text>
        <View style={{ marginTop: 14 }}>
          <AppButton label="Sign out" icon="log-out" kind="secondary" onPress={() => void signOut()} />
        </View>
      </Card>
    </ScreenShell>
  );
}
