// Web (and type) fallback. The Android/iOS implementation is phone-auth.native.ts, which
// Metro picks automatically on device builds.

export type PhoneVerification = {
  /** Confirms the SMS code and returns a Firebase ID token for the API. */
  confirm: (code: string) => Promise<string>;
};

export function isPhoneLoginAvailable() {
  return false;
}

export async function startPhoneVerification(_phone: string): Promise<PhoneVerification> {
  throw new Error("Phone login is only available in the Android app.");
}

/** Resolves with an ID token if Android verifies the number automatically (no code needed). */
export function onPhoneAutoVerified(_listener: (idToken: string) => void) {
  return () => {};
}

export async function resetPhoneVerification() {}
