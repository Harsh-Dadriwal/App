"use client";

import { useEffect, useMemo, useRef, useState, type DependencyList, type ReactNode } from "react";
import { getSupabaseBrowserClient, getSupabaseReadBrowserClient } from "@mahalaxmi/core/supabase/client";
import { useSharedMutationAction } from "@mahalaxmi/core/hooks/use-mutation-action";
import { queryCacheKey, readQueryCache, trackQuery, writeQueryCache } from "@mahalaxmi/core/hooks/query-cache";
import { SkeletonCards } from "@/components/skeleton";

export function FormFieldHint({ children }: { children: ReactNode }) {
  return <p className="form-field-hint">{children}</p>;
}

export function FormSectionHeader({ title, lead }: { title: string; lead?: ReactNode }) {
  return (
    <>
      <h3 className="form-section-title">{title}</h3>
      {lead ? <div className="form-section-lead">{lead}</div> : null}
    </>
  );
}

export function FlowWizardSteps({
  steps,
  currentStep,
  ariaLabel = "Form steps"
}: {
  steps: readonly { label: string; description: string }[];
  currentStep: number;
  ariaLabel?: string;
}) {
  return (
    <div className="product-wizard-steps" role="list" aria-label={ariaLabel}>
      {steps.map((step, index) => {
        const n = index + 1;
        const done = currentStep > n;
        const current = currentStep === n;
        return (
          <div
            key={`${step.label}-${index}`}
            role="listitem"
            className={`step-pill${done ? " is-done" : ""}${current ? " is-current" : ""}`}
            aria-current={current ? "step" : undefined}
          >
            <span>{n}</span>
            <div>
              <p>{step.label}</p>
              <FormFieldHint>{step.description}</FormFieldHint>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ListSearchField({
  value,
  onChange,
  placeholder,
  ariaLabel
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
}) {
  return (
    <div className="catalog-toolbar" style={{ marginBottom: 14 }}>
      <input
        className="catalog-search-input"
        style={{ width: "100%", maxWidth: 480 }}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={ariaLabel}
      />
    </div>
  );
}

type FetchResult<T> = {
  data: T[];
  error: string | null;
};

export function useRows<T>(
  fetcher: (client: NonNullable<Awaited<ReturnType<typeof getSupabaseBrowserClient>>>) => Promise<FetchResult<T>>,
  deps: DependencyList,
  options?: { realtimeTable?: string; clientType?: "primary" | "read"; enabled?: boolean }
) {
  // Same query (fetcher source + its inputs) -> same cache entry; see query-cache.ts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cacheKey = useMemo(() => queryCacheKey([fetcher.toString(), deps, options?.clientType ?? null, options?.realtimeTable ?? null]), deps);
  const [initialCache] = useState(() => (options?.enabled === false ? null : readQueryCache<T>(cacheKey)));
  const [data, setData] = useState<T[]>(initialCache ?? []);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(initialCache === null);
  const [reloadKey, setReloadKey] = useState(0);
  const hasLoadedRef = useRef(initialCache !== null);

  useEffect(() => {
    let active = true;
    let channel: any = null;

    void (async () => {
      if (options?.enabled === false) {
        if (active) {
          setLoading(false);
          setError(null);
        }
        return;
      }

      // Show the last result for this exact query straight away, then refresh it below.
      const cached = readQueryCache<T>(cacheKey);
      if (cached) {
        hasLoadedRef.current = true;
        setData(cached);
        setError(null);
        setLoading(false);
      }

      // Only show the loading state on the first fetch. Refetches (from
      // mutations, realtime updates, or manual refetch()) keep showing the
      // previously loaded data instead of blanking the screen.
      if (!hasLoadedRef.current) {
        setLoading(true);
      }
      const resolvedClientType =
        options?.clientType ?? (options?.realtimeTable ? "primary" : "read");
      const client = resolvedClientType === "read"
        ? await getSupabaseReadBrowserClient()
        : await getSupabaseBrowserClient();

      if (!client) {
        if (active) {
          setData([]);
          setError("This service is temporarily unavailable. Please try again shortly.");
          setLoading(false);
        }
        return;
      }

      if (options?.realtimeTable) {
        channel = client
          .channel(`public:${options.realtimeTable}:${Math.random().toString(36).slice(2)}`)
          .on("postgres_changes", { event: "*", schema: "public", table: options.realtimeTable }, () => {
            if (active) {
              setReloadKey((k) => k + 1);
            }
          })
          .subscribe();
      }

      const result = await trackQuery(fetcher(client));
      if (!result.error) {
        writeQueryCache(cacheKey, result.data);
      }

      if (!active) {
        return;
      }

      hasLoadedRef.current = true;
      // A failed background refresh keeps the cached copy on screen instead of blanking it.
      if (!(result.error && cached)) {
        setData(result.data);
        setError(result.error);
      }
      setLoading(false);
    })();

    return () => {
      active = false;
      if (channel) {
        void getSupabaseBrowserClient().then(c => c && c.removeChannel(channel));
      }
    };
  }, [...deps, cacheKey, reloadKey, options?.enabled]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleMutation = () => {
      setReloadKey((k) => k + 1);
    };

    window.addEventListener("supabase-mutation", handleMutation);
    return () => {
      window.removeEventListener("supabase-mutation", handleMutation);
    };
  }, []);

  return { data, error, loading, refetch: () => setReloadKey((value) => value + 1) };
}

export function useMutationAction() {
  const mutation = useSharedMutationAction();
  return {
    isSubmitting: mutation.loading,
    error: mutation.error,
    success: mutation.success,
    run: mutation.run,
    reset: mutation.reset
  };
}

export function PageSection({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="page-section">
      <div className="section-title">
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function FormCard({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="form-card">
      <div className="section-title">
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function FormGrid({ children }: { children: ReactNode }) {
  return <div className="form-layout-grid">{children}</div>;
}

export function FormNotice({
  error,
  success
}: {
  error?: string | null;
  success?: string | null;
}) {
  return (
    <>
      {success ? <p className="notice success">{success}</p> : null}
      {error ? <p className="notice error">{error}</p> : null}
    </>
  );
}

export function StatsGrid({
  items
}: {
  items: Array<{ label: string; value: string | number }>;
}) {
  return (
    <div className="stats-grid">
      {items.map((item) => (
        <article key={item.label} className="metric-card">
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </article>
      ))}
    </div>
  );
}

export function CardGrid({ children }: { children: React.ReactNode }) {
  return <div className="content-grid">{children}</div>;
}

export function DataCard({
  title,
  subtitle,
  meta,
  children
}: {
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <article className="data-card">
      <div className="data-card-head">
        <div>
          <strong>{title}</strong>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {meta ? <span className="badge">{meta}</span> : null}
      </div>
      {children ? <div className="data-card-body">{children}</div> : null}
    </article>
  );
}

export function DataTable({
  columns,
  rows
}: {
  columns: string[];
  rows: Array<Array<ReactNode>>;
}) {
  return (
    <div className="table-shell">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={`${index}-${cellIndex}`}>{cell ?? "-"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function QueryState({
  loading,
  error,
  empty,
  hasData,
  children
}: {
  loading: boolean;
  error: string | null;
  empty: { title: string; description: string };
  hasData: boolean;
  children: React.ReactNode;
}) {
  if (loading) {
    return <SkeletonCards />;
  }

  if (error) {
    return <div className="state-card state-card--error">{error}</div>;
  }

  if (!hasData) {
    return (
      <div className="state-card">
        <strong>{empty.title}</strong>
        <p>{empty.description}</p>
      </div>
    );
  }

  return <>{children}</>;
}
