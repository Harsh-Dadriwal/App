import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { BackHandler } from "react-native";

export type MobileScreen =
  | "dashboard"
  | "shop"
  | "orders"
  | "quotations"
  | "incentives"
  | "notes"
  | "price-list"
  | "service-requests"
  | "fintech";

type NavigationContextValue = {
  screen: MobileScreen;
  navigate: (screen: MobileScreen) => void;
  replace: (screen: MobileScreen) => void;
  goBack: () => void;
  canGoBack: boolean;
};

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<MobileScreen[]>(["dashboard"]);
  const screen = history[history.length - 1] ?? "dashboard";

  const value = useMemo(
    () => ({
      screen,
      navigate: (nextScreen: MobileScreen) => {
        setHistory((current) => {
          const currentScreen = current[current.length - 1];
          if (currentScreen === nextScreen) {
            return current;
          }
          return [...current, nextScreen];
        });
      },
      replace: (nextScreen: MobileScreen) => {
        setHistory((current) => {
          if (current.length === 0) {
            return [nextScreen];
          }

          const cloned = [...current];
          cloned[cloned.length - 1] = nextScreen;
          return cloned;
        });
      },
      goBack: () => {
        setHistory((current) => (current.length > 1 ? current.slice(0, -1) : current));
      },
      canGoBack: history.length > 1
    }),
    [screen, history.length]
  );

  // Android back button walks back through the app's own screens before leaving the app.
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (history.length <= 1) return false;
      setHistory((current) => current.slice(0, -1));
      return true;
    });
    return () => subscription.remove();
  }, [history.length]);

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useMobileNavigation() {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error("useMobileNavigation must be used within NavigationProvider");
  }
  return context;
}
