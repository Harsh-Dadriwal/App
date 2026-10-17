// App shell: picks the screen to show. Changes here ship to phones over the air on push.
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { palette } from "@/lib/theme";
import { AppButton } from "@/components/ui";
import { isRoleEnabled, roleLabels } from "@mahalaxmi/core/types/domain";
import { AuthProvider, useAuth } from "@/providers/auth-provider";
import { NavigationProvider, useMobileNavigation } from "@/providers/navigation-provider";
import { AuthScreen } from "@/screens/auth-screen";
import { DashboardScreen } from "@/screens/dashboard-screen";
import { NotesScreen } from "@/screens/notes-screen";
import { PriceListScreen } from "@/screens/price-list-screen";
import { OrdersScreen, ShopScreen } from "@/screens/shop-screen";
import { QuotationsScreen } from "@/screens/quotations-screen";
import { ServiceRequestsScreen } from "@/screens/service-requests-screen";
import { FintechScreen } from "@/screens/fintech-screen";
import { IncentivesScreen } from "@/screens/incentives-screen";

function Splash({ title, message, busy }: { title?: string; message: string; busy?: boolean }) {
  return (
    <View style={styles.splash}>
      <StatusBar style="light" />
      <Image source={require("../assets/splash-icon.png")} style={styles.splashLogo} />
      <Text style={styles.splashTitle}>{title ?? "Mahalaxmi Electricals"}</Text>
      <Text style={styles.splashMessage}>{message}</Text>
      {busy ? <ActivityIndicator color={palette.gold} style={{ marginTop: 20 }} /> : null}
    </View>
  );
}

function AppBody() {
  const { configured, loading, session, profile, signOut } = useAuth();
  const { screen } = useMobileNavigation();

  if (!configured) {
    return (
      <Splash
        title="Service unavailable"
        message="This copy of the app was built without its server settings. Please install the latest version or contact support."
      />
    );
  }

  if (loading) {
    return <Splash message="Opening your workspace..." busy />;
  }

  if (!session || !profile) {
    return (
      <>
        <StatusBar style="light" />
        <AuthScreen />
      </>
    );
  }

  // Roles switched off in ENABLED_ROLES (supplier, handyman trades) are not available yet.
  if (!isRoleEnabled(profile.role)) {
    return (
      <View style={styles.splash}>
        <StatusBar style="light" />
        <Image source={require("../assets/splash-icon.png")} style={styles.splashLogo} />
        <Text style={styles.splashTitle}>{roleLabels[profile.role] ?? "This"} accounts are not available yet</Text>
        <Text style={styles.splashMessage}>
          We are only opening the app to customers, electricians and architects for now. Please contact Mahalaxmi Electricals if you need access.
        </Text>
        <View style={{ marginTop: 24, alignSelf: "stretch" }}>
          <AppButton label="Log out" icon="log-out" onPress={() => void signOut()} />
        </View>
      </View>
    );
  }

  if (screen === "shop") return <ShopScreen />;
  if (screen === "orders") return <OrdersScreen />;
  if (screen === "quotations") return <QuotationsScreen />;
  if (screen === "incentives") return <IncentivesScreen />;
  if (screen === "notes") return <NotesScreen />;
  if (screen === "price-list") return <PriceListScreen />;
  if (screen === "service-requests") return <ServiceRequestsScreen />;
  if (screen === "fintech") return <FintechScreen />;
  return <DashboardScreen />;
}

export function MobileRoot() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationProvider>
          <View style={{ flex: 1, backgroundColor: palette.bg }}>
            <StatusBar style="dark" />
            <AppBody />
          </View>
        </NavigationProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    backgroundColor: palette.night
  },
  splashLogo: { width: 88, height: 88, borderRadius: 26, marginBottom: 20 },
  splashTitle: { color: "#ffffff", fontSize: 22, fontWeight: "900", textAlign: "center" },
  splashMessage: { color: palette.nightMuted, fontSize: 15, marginTop: 10, textAlign: "center", lineHeight: 22 }
});
