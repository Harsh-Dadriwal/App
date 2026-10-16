"use client";

import { useEffect, useState } from "react";
import { subscribeQueryActivity } from "@mahalaxmi/core/hooks/query-cache";

/** Placeholder card shapes with a soft shimmer, shown while a list loads for the first time. */
export function SkeletonCards({ count = 6 }: { count?: number }) {
  return (
    <div className="skeleton-grid" role="status" aria-live="polite" aria-label="Loading">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="skeleton-card" style={{ animationDelay: `${index * 60}ms` }}>
          <span className="skeleton-line" style={{ width: "38%" }} />
          <span className="skeleton-line skeleton-line--title" style={{ width: `${70 - (index % 3) * 12}%` }} />
          <span className="skeleton-line" style={{ width: "88%" }} />
          <span className="skeleton-line" style={{ width: "54%" }} />
        </div>
      ))}
    </div>
  );
}

/** The workspace layout drawn in placeholder blocks while the signed-in user is restored. */
export function SkeletonWorkspace() {
  return (
    <main className="skeleton-workspace" role="status" aria-live="polite" aria-label="Opening your workspace">
      <aside className="skeleton-sidebar">
        <span className="skeleton-line skeleton-line--brand" />
        {Array.from({ length: 8 }, (_, index) => (
          <span key={index} className="skeleton-line skeleton-line--nav" style={{ width: `${82 - (index % 4) * 9}%` }} />
        ))}
      </aside>
      <section className="skeleton-main">
        <div className="skeleton-header">
          <span className="skeleton-line skeleton-line--title" style={{ width: 220 }} />
          <span className="skeleton-pill" />
        </div>
        <div className="skeleton-stats">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="skeleton-card skeleton-card--stat">
              <span className="skeleton-line" style={{ width: "50%" }} />
              <span className="skeleton-line skeleton-line--number" />
            </div>
          ))}
        </div>
        <SkeletonCards count={6} />
      </section>
    </main>
  );
}

/**
 * A thin animated line at the top of the screen while fresh data loads in the background.
 * Waits 250ms before appearing so quick refreshes do not flicker.
 */
export function TopProgressBar() {
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => subscribeQueryActivity(setBusy), []);

  useEffect(() => {
    if (!busy) {
      setVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setVisible(true), 250);
    return () => window.clearTimeout(timer);
  }, [busy]);

  return <div className={`top-progress${visible ? " is-visible" : ""}`} aria-hidden="true" />;
}
