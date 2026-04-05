"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthScreen } from "@/components/auth-screen";
import { useAuth } from "@/components/providers/auth-provider";

export default function AuthPage() {
  const router = useRouter();
  const { configured, isLoading, session, profile, errorMessage } = useAuth();

  useEffect(() => {
    if (!configured || isLoading) {
      return;
    }

    if (session && profile) {
      router.replace(`/${profile.role}`);
    }
  }, [configured, isLoading, session, profile, router]);

  if (session && !profile) {
    return (
      <main className="loading-shell">
        <div className="loading-card">
          <span className="eyebrow">Signing In</span>
          <h1>Finishing your workspace setup...</h1>
          <p className="helper-copy">
            {errorMessage || "Your account is signed in. We are loading the role-based profile now."}
          </p>
        </div>
      </main>
    );
  }

  return <AuthScreen />;
}
