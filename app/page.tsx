"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { SkeletonWorkspace } from "@/components/skeleton";
import { isSupabaseConfigured } from "@mahalaxmi/core/supabase/client";

export default function RootPage() {
  const router = useRouter();
  const { session, profile, isLoading } = useAuth();
  
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      return;
    }
    
    if (isLoading) return;

    if (!session) {
      router.replace("/auth");
    } else if (profile?.role) {
      router.replace(`/${profile.role}`);
    } else {
      router.replace("/auth");
    }
  }, [session, profile, isLoading, router]);

  if (!isSupabaseConfigured()) {
    return (
      <main className="setup-shell fade-in">
        <section className="setup-card">
          <span className="eyebrow">Service unavailable</span>
          <h1>We cannot load your workspace right now. Please try again shortly.</h1>
        </section>
      </main>
    );
  }

  return <SkeletonWorkspace />;
}
