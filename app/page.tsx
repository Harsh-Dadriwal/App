"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthScreen } from "@/components/auth-screen";
import { useAuth } from "@/components/providers/auth-provider";

export default function HomePage() {
  const router = useRouter();
  const { configured, isLoading, session, profile } = useAuth();

  useEffect(() => {
    if (!configured || isLoading) {
      return;
    }

    if (session && profile) {
      router.replace(`/${profile.role}`);
    } else {
      router.replace("/auth");
    }
  }, [configured, isLoading, session, profile, router]);

  if (!configured || isLoading) {
    return (
      <main className="loading-shell">
        <div className="loading-card">
          <span className="eyebrow">Loading</span>
          <h1>Preparing your workspace...</h1>
        </div>
      </main>
    );
  }

  return <AuthScreen />;
}
