"use client";

import { useEffect, useState, type DependencyList, type ReactNode } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

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
  deps: DependencyList
) {
  const [data, setData] = useState<T[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    void (async () => {
      setLoading(true);
      const client = await getSupabaseBrowserClient();

      if (!client) {
        if (active) {
          setData([]);
          setError("Supabase is not configured.");
          setLoading(false);
        }
        return;
      }

      const result = await fetcher(client);

      if (!active) {
        return;
      }

      setData(result.data);
      setError(result.error);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [...deps, reloadKey]);

  return { data, error, loading, refetch: () => setReloadKey((value) => value + 1) };
}

export function useMutationAction() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function run(action: () => Promise<{ error?: { message?: string | null } | null } | void>, successMessage?: string) {
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await action();
      const maybeError = result && "error" in result ? result.error : null;

      if (maybeError?.message) {
        setError(maybeError.message);
        return false;
      }

      if (successMessage) {
        setSuccess(successMessage);
      }

      return true;
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Action failed.");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  function reset() {
    setError(null);
    setSuccess(null);
  }

  return { isSubmitting, error, success, run, reset };
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
  rows: Array<Array<string | number | null | undefined>>;
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
    return <div className="state-card">Loading data from the database...</div>;
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
