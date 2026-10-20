"use client";

import Link from "next/link";
import { useState } from "react";
import { FormNotice, PageSection } from "@/components/data-view";
import { useAuth } from "@/components/providers/auth-provider";
import { deleteMyAccount } from "@/lib/backend/modules/auth-gateway";
import { roleLabels } from "@mahalaxmi/core/types/domain";

/** Profile summary, privacy links and permanent account deletion (required by Google Play). */
export function AccountPage() {
  const { profile, signOut } = useAuth();
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = profile?.role === "admin";

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    const result = await deleteMyAccount();
    if (result.error) {
      setError(result.error);
      setDeleting(false);
      return;
    }
    await signOut();
    window.location.replace("/auth");
  }

  return (
    <div className="page-stack">
      <PageSection title="Your account" description="The details we hold for you.">
        <dl className="account-details">
          <div><dt>Name</dt><dd>{profile?.full_name ?? "-"}</dd></div>
          <div><dt>Username</dt><dd>{profile?.username ?? "-"}</dd></div>
          <div><dt>Mobile</dt><dd>{profile?.phone ?? "-"}</dd></div>
          <div><dt>Email</dt><dd>{profile?.email ?? "-"}</dd></div>
          <div><dt>Account type</dt><dd>{profile?.role ? roleLabels[profile.role] : "-"}</dd></div>
        </dl>
        <p className="shop-muted">
          Read our <Link href="/privacy">privacy policy</Link> to see how your information is used.
        </p>
      </PageSection>

      <section className="danger-zone">
        <h3>Delete my account</h3>
        {isAdmin ? (
          <p>Shop admin accounts cannot be deleted from the app. Please ask the business owner.</p>
        ) : (
          <>
            <p>
              This permanently deletes your sign-in, name, contact details, address and uploaded photos, and signs you out on every device.
              Order and payment records are kept without your personal details, as tax law requires. This cannot be undone.
            </p>
            <label className="shop-field">
              Type DELETE to confirm
              <input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} autoComplete="off" />
            </label>
            <FormNotice error={error} success={null} />
            <button type="button" className="danger-button" disabled={confirmText.trim() !== "DELETE" || deleting} onClick={() => void handleDelete()}>
              {deleting ? "Deleting…" : "Delete my account"}
            </button>
          </>
        )}
      </section>
    </div>
  );
}
