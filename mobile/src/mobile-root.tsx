import { View } from "react-native";
import { AuthProvider, useAuth } from "@/providers/auth-provider";
import { NavigationProvider, useMobileNavigation } from "@/providers/navigation-provider";
import { ScreenShell } from "@/components/ui";
import { AuthScreen } from "@/screens/auth-screen";
import { DashboardScreen } from "@/screens/dashboard-screen";
import { CatalogScreen } from "@/screens/catalog-screen";
import { OrderBuilderScreen } from "@/screens/order-builder-screen";
import { MaterialsScreen } from "@/screens/materials-screen";
import { NotesScreen } from "@/screens/notes-screen";
import { AdminCatalogScreen } from "@/screens/admin-catalog-screen";

function AppBody() {
  const { configured, loading, session, profile } = useAuth();
  const { screen } = useMobileNavigation();

  if (!configured) {
    return (
      <ScreenShell title="Supabase setup required" subtitle="Add your Expo public Supabase URL and anon key before opening the mobile workspace." />
    );
  }

  if (loading) {
    return <ScreenShell title="Opening mobile workspace" subtitle="Checking your session and profile..." />;
  }

  if (!session || !profile) {
    return <AuthScreen />;
  }

  if (screen === "catalog") return <CatalogScreen />;
  if (screen === "order-builder") return <OrderBuilderScreen />;
  if (screen === "materials") return <MaterialsScreen />;
  if (screen === "notes") return <NotesScreen />;
  if (screen === "admin-catalog") return <AdminCatalogScreen />;
  return <DashboardScreen />;
}

export function MobileRoot() {
  return (
    <AuthProvider>
      <NavigationProvider>
        <View style={{ flex: 1 }}>
          <AppBody />
        </View>
      </NavigationProvider>
    </AuthProvider>
  );
}
