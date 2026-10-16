"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { roleLabels } from "@/lib/navigation";
import type { AppRole } from "@mahalaxmi/core/types/domain";

/** Shown to accounts whose role is switched off in ENABLED_ROLES. */
export function RoleUnavailable({ role }: { role: AppRole }) {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const label = roleLabels[role] ?? "This";

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "1.5rem", background: "var(--bg-color)" }}>
      <div className="state-card" style={{ maxWidth: 460, gap: "0.75rem" }}>
        <strong>{label} accounts are not available yet</strong>
        <p>
          We are only opening the app to customers, electricians and architects for now. Please contact Mahalaxmi
          Electricals if you need access, and we will let you know when {label.toLowerCase()} accounts are live.
        </p>
        {session ? (
          <button
            type="button"
            className="secondary-button"
            onClick={() => void signOut().then(() => router.replace("/auth"))}
          >
            Log out
          </button>
        ) : (
          <button type="button" className="secondary-button" onClick={() => router.replace("/auth")}>
            Go to login
          </button>
        )}
      </div>
    </main>
  );
}
