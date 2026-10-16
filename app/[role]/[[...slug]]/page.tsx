"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { AppFrame } from "@/components/app-frame";
import { isRoleEnabled, type AppRole } from "@mahalaxmi/core/types/domain";
import { RoleUnavailable } from "@/components/role-unavailable";
import { roleLabels } from "@/lib/navigation";
import { getRolePage } from "@/lib/role-page-registry";

export default function RolePage({
  params
}: {
  params: Promise<{ role: string; slug?: string[] }>;
}) {
  const unwrappedParams = use(params);
  const role = unwrappedParams.role as AppRole;
  const slug = unwrappedParams.slug || [];
  const pathPart = slug.join("/");

  if (!roleLabels[role]) {
    notFound();
  }

  // Accounts with a role that is switched off (see ENABLED_ROLES) land here after login.
  if (!isRoleEnabled(role)) {
    return <RoleUnavailable role={role} />;
  }

  const page = getRolePage(role, pathPart);

  if (!page) {
    notFound();
  }

  return (
    <AppFrame role={role} title={page.title}>
      <div className="fade-in">
        {page.component}
      </div>
    </AppFrame>
  );
}
