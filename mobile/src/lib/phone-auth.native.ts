import Constants, { ExecutionEnvironment } from "expo-constants";
import type { PhoneVerification } from "./phone-auth";

export type { PhoneVerification } from "./phone-auth";

type FirebaseAuthModule = typeof import("@react-native-firebase/auth");

/**
 * True only in real builds made with a google-services.json (see app.config.js). Expo Go
 * has no Firebase native code, so phone login is always off there.
 */
export function isPhoneLoginAvailable() {
  return Boolean(Constants.expoConfig?.extra?.phoneLogin) && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
}

// Loaded on first use, never at app start: importing it in a build without Firebase's
// native module (Expo Go, or a build without google-services.json) crashes the app.
let firebaseAuth: FirebaseAuthModule | null = null;
function loadFirebaseAuth(): FirebaseAuthModule {
  if (!isPhoneLoginAvailable()) {
    throw new Error("Phone login is not available in this version of the app. Please use email.");
  }
  if (!firebaseAuth) {
    firebaseAuth = require("@react-native-firebase/auth") as FirebaseAuthModule;
  }
  return firebaseAuth;
}

function friendlyError(error: unknown) {
  const code = (error as { code?: string })?.code ?? "";
  if (code.includes("invalid-phone-number")) return new Error("Enter your mobile number with country code, e.g. +91 98765 43210.");
  if (code.includes("invalid-verification-code")) return new Error("That code is not right. Check the SMS and try again.");
  if (code.includes("session-expired") || code.includes("code-expired")) return new Error("The code expired. Tap Resend code to get a new one.");
  if (code.includes("too-many-requests") || code.includes("quota-exceeded")) return new Error("Too many attempts. Please wait a few minutes and try again.");
  if (code.includes("network-request-failed")) return new Error("No internet connection. Check your network and try again.");
  if (code.includes("app-not-authorized") || code.includes("missing-client-identifier")) {
    return new Error("Phone login is not set up for this version of the app yet. Please use email for now.");
  }
  return error instanceof Error ? error : new Error("We could not verify your number. Please try again.");
}

export async function startPhoneVerification(phone: string): Promise<PhoneVerification> {
  try {
    const { getAuth, signInWithPhoneNumber } = loadFirebaseAuth();
    const confirmation = await signInWithPhoneNumber(getAuth(), phone);
    return {
      confirm: async (code: string) => {
        try {
          const credential = await confirmation.confirm(code);
          if (!credential?.user) throw new Error("We could not verify your number. Please try again.");
          return await credential.user.getIdToken();
        } catch (error) {
          throw friendlyError(error);
        }
      }
    };
  } catch (error) {
    throw friendlyError(error);
  }
}

/**
 * Android can read the SMS and verify the number on its own; Firebase then signs the
 * user in without the code being typed. This hands back the ID token when that happens.
 */
export function onPhoneAutoVerified(listener: (idToken: string) => void) {
  if (!isPhoneLoginAvailable()) return () => {};
  const { getAuth, onAuthStateChanged } = loadFirebaseAuth();
  return onAuthStateChanged(getAuth(), (user) => {
    if (user?.phoneNumber) {
      void user.getIdToken().then(listener).catch(() => undefined);
    }
  });
}

/** The Firebase sign-in is only a step towards the app's own session, so it is not kept. */
export async function resetPhoneVerification() {
  if (!isPhoneLoginAvailable()) return;
  try {
    const { getAuth, signOut } = loadFirebaseAuth();
    await signOut(getAuth());
  } catch {
    // Nothing signed in.
  }
}
