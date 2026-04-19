"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { isSupabaseConfigured } from "@/lib/supabase";

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
          <span className="eyebrow">Supabase Setup Required</span>
          <h1>Connect the app with your Supabase project before using the workspace.</h1>
          <p>
            Add your project URL and anon key to <code>.env.local</code>.
          </p>
          <div className="code-block">
            <code>NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co</code>
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key</code>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="loading-shell fade-in">
      <div className="loading-card">
        <span className="eyebrow">Initializing</span>
        <h1>Welcome to Mahalaxmi Electricals</h1>
        <p>Loading your workspace...</p>
      </div>
    </main>
  );
}
