"use client";

import { useRows } from "@/components/data-view";
import type { AppRole } from "@mahalaxmi/core/types/domain";

export const NOTE_STEPS = [
  { label: "Where & who", description: "Site and recipient" },
  { label: "Message", description: "Note text" }
] as const;

export const ARCH_REQUEST_STEPS = [
  { label: "Site & title", description: "What you need" },
  { label: "Category", description: "Preferred group" },
  { label: "Brand", description: "Preferred line" },
  { label: "Details", description: "Description and send" }
] as const;

export const ADMIN_ASSIGN_STEPS = [
  { label: "Site", description: "Which project" },
  { label: "Who", description: "Role and person" },
  { label: "Status", description: "Save assignment" }
] as const;

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function ModalShell({
  title,
  description,
  onClose,
  children
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div className="section-title">
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <button type="button" className="secondary-button" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

export function useAccessibleSites(role: AppRole, profileId: string) {
  return useRows(
    async (client) => {
      if (!profileId && role !== "admin") {
        return { data: [] as any[], error: null };
      }

      if (role === "customer") {
        const { data, error } = await client
          .from("sites")
          .select("id, site_name, site_code")
          .eq("customer_id", profileId)
          .order("site_name");
        return { data: (data ?? []) as any[], error: error?.message ?? null };
      }

      if (role === "electrician") {
        const { data, error } = await client
          .from("vw_electrician_ongoing_projects")
          .select("site_id, site_name, site_code")
          .eq("electrician_id", profileId)
          .order("site_name");
        return {
          data: (data ?? []).map((item: any) => ({ id: item.site_id, site_name: item.site_name, site_code: item.site_code })) as any[],
          error: error?.message ?? null
        };
      }

      if (role === "architect") {
        const { data, error } = await client
          .from("vw_architect_ongoing_projects")
          .select("site_id, site_name, site_code")
          .eq("architect_id", profileId)
          .order("site_name");
        return {
          data: (data ?? []).map((item: any) => ({ id: item.site_id, site_name: item.site_name, site_code: item.site_code })) as any[],
          error: error?.message ?? null
        };
      }

      const { data, error } = await client
        .from("sites")
        .select("id, site_name, site_code")
        .order("site_name");
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [role, profileId]
  );
}

export function getRecipientOptions(role: AppRole) {
  if (role === "customer") {
    return [
      { value: "electrician", label: "Electrician" },
      { value: "architect", label: "Architect" },
      { value: "admin", label: "Admin" }
    ];
  }

  if (role === "electrician") {
    return [
      { value: "customer", label: "Customer" },
      { value: "architect", label: "Architect" },
      { value: "admin", label: "Admin" }
    ];
  }

  if (role === "architect") {
    return [
      { value: "customer", label: "Customer" },
      { value: "electrician", label: "Electrician" },
      { value: "admin", label: "Admin" }
    ];
  }

  return [
    { value: "customer", label: "Customer" },
    { value: "electrician", label: "Electrician" },
    { value: "architect", label: "Architect" },
    { value: "admin", label: "Admin" }
  ];
}
