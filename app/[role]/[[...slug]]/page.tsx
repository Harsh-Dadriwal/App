"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { AppFrame } from "@/components/app-frame";
import type { AppRole } from "@mahalaxmi/core/types/domain";
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
