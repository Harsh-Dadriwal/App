"use client";

import { useAuth } from "@/components/providers/auth-provider";
import {
  CardGrid,
  DataCard,
  DataTable,
  PageSection,
  QueryState,
  StatsGrid,
  useRows
} from "@/components/data-view";
export function ArchitectDashboardPage() {
  const { profile } = useAuth();
  const architectId = profile?.id ?? "";
  const ongoing = useRows(
    async (client) => {
      const { data, error } = await client
        .from("vw_architect_ongoing_projects")
        .select("*")
        .eq("architect_id", architectId);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [architectId],
    { enabled: Boolean(architectId) }
  );
  const newProjects = useRows(
    async (client) => {
      const { data, error } = await client.from("vw_architect_new_projects").select("*");
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    []
  );

  return (
    <div className="page-stack">
      <StatsGrid
        items={[
          { label: "Open projects", value: newProjects.data.length },
          { label: "Ongoing projects", value: ongoing.data.length },
          { label: "Customer pending items", value: ongoing.data.reduce((sum, row: any) => sum + Number(row.customer_pending_items ?? 0), 0) },
          { label: "Supplied items", value: ongoing.data.reduce((sum, row: any) => sum + Number(row.supplied_items ?? 0), 0) }
        ]}
      />
      <PageSection
        title="Architect review flow"
        description="Project and material reviews at a glance."
      >
        <QueryState
          loading={ongoing.loading}
          error={ongoing.error}
          hasData={ongoing.data.length > 0}
          empty={{
            title: "No architect-assigned projects",
            description: "Assign an architect to a site to see it appear here."
          }}
        >
          <CardGrid>
            {ongoing.data.map((project: any) => (
              <DataCard
                key={project.site_id}
                title={project.site_name}
                subtitle={project.customer_name}
                meta={project.site_status}
              >
                <p>Electrician: {project.electrician_name ?? "-"}</p>
                <p>Awaiting customer: {project.customer_pending_items}</p>
                <p>Awaiting supply: {project.supply_pending_items}</p>
              </DataCard>
            ))}
          </CardGrid>
        </QueryState>
      </PageSection>
    </div>
  );
}

export function ArchitectProjectsPage({ mode }: { mode: "new" | "ongoing" }) {
  const { profile } = useAuth();
  const architectId = profile?.id ?? "";
  const query = useRows(
    async (client) => {
      if (mode === "new") {
        const { data, error } = await client.from("vw_architect_new_projects").select("*");
        return { data: (data ?? []) as any[], error: error?.message ?? null };
      }

      const { data, error } = await client
        .from("vw_architect_ongoing_projects")
        .select("*")
        .eq("architect_id", architectId);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [mode, architectId],
    { enabled: mode !== "ongoing" || Boolean(architectId) }
  );

  return (
    <PageSection
      title={mode === "new" ? "New architect projects" : "Ongoing architect projects"}
      description="Your assigned projects."
    >
      <QueryState
        loading={query.loading}
        error={query.error}
        hasData={query.data.length > 0}
        empty={{
          title: "No project data",
          description: "Projects will appear here once assigned."
        }}
      >
        <DataTable
          columns={
            mode === "new"
              ? ["Site", "Project Type", "City", "Budget", "Status"]
              : ["Site", "Customer", "Status", "Requested by Electrician", "Customer Pending", "Supplied"]
          }
          rows={
            mode === "new"
              ? query.data.map((row: any) => [
                  row.site_name,
                  row.project_type,
                  row.city,
                  row.estimated_budget ? `₹${Number(row.estimated_budget).toLocaleString("en-IN")}` : "-",
                  row.status
                ])
              : query.data.map((row: any) => [
                  row.site_name,
                  row.customer_name,
                  row.site_status,
                  row.electrician_requested_items,
                  row.customer_pending_items,
                  row.supplied_items
                ])
          }
        />
      </QueryState>
    </PageSection>
  );
}
