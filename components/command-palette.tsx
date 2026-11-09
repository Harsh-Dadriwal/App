"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { NavIcon } from "@/components/nav-icon";
import { getRoleNavGroups } from "@/lib/navigation";
import type { AppRole } from "@mahalaxmi/core/types/domain";

type Command = {
  id: string;
  label: string;
  hint: string;
  keywords?: string;
  icon?: React.ComponentProps<typeof NavIcon>["name"];
  run: () => void;
};

/**
 * Ctrl/⌘ + K (or "/") opens a search over every page and action for the signed-in role, so
 * any screen is two keystrokes away.
 */
export function CommandPalette({
  role,
  onToggleTheme,
  onSignOut
}: {
  role: AppRole;
  onToggleTheme: () => void;
  onSignOut: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const commands = useMemo<Command[]>(() => {
    const pages = getRoleNavGroups(role).flatMap((section) =>
      section.items.map<Command>((item) => ({
        id: item.href,
        label: item.label,
        hint: section.group,
        keywords: item.shortLabel,
        icon: item.icon,
        run: () => router.push(item.href)
      }))
    );
    return [
      ...pages,
      { id: "account", label: "Account & privacy", hint: "Account", keywords: "profile delete privacy", run: () => router.push(`/${role}/account`) },
      { id: "theme", label: "Toggle light / dark mode", hint: "Action", keywords: "theme appearance", run: onToggleTheme },
      { id: "logout", label: "Log out", hint: "Action", keywords: "sign out", run: onSignOut }
    ];
  }, [role, router, onToggleTheme, onSignOut]);

  const results = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return commands;
    return commands.filter((command) => {
      const haystack = `${command.label} ${command.hint} ${command.keywords ?? ""}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [commands, query]);

  function close() {
    setOpen(false);
    setQuery("");
    setActive(0);
    returnFocusRef.current?.focus?.();
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const typing = (event.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable]");
      const wantsOpen = ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") || (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey);
      if (wantsOpen) {
        event.preventDefault();
        returnFocusRef.current = document.activeElement as HTMLElement | null;
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => setActive(0), [query]);

  if (!open) return null;

  function choose(command: Command | undefined) {
    if (!command) return;
    close();
    command.run();
  }

  return (
    <div className="palette-backdrop" onMouseDown={close}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Quick search" onMouseDown={(event) => event.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Search pages and actions…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search pages and actions"
          onKeyDown={(event) => {
            if (event.key === "Escape") close();
            else if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((index) => Math.min(index + 1, results.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault();
              choose(results[active]);
            }
          }}
        />
        <ul className="palette-list" role="listbox">
          {results.length ? (
            results.map((command, index) => (
              <li key={command.id} role="option" aria-selected={index === active}>
                <button
                  type="button"
                  className={index === active ? "palette-item is-active" : "palette-item"}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(command)}
                >
                  {command.icon ? <NavIcon name={command.icon} size={16} /> : <span className="palette-dot" aria-hidden="true" />}
                  <span className="palette-label">{command.label}</span>
                  <span className="palette-hint">{command.hint}</span>
                </button>
              </li>
            ))
          ) : (
            <li className="palette-empty">Nothing matches “{query}”.</li>
          )}
        </ul>
        <div className="palette-foot"><kbd>↑</kbd><kbd>↓</kbd> to move <kbd>Enter</kbd> to open <kbd>Esc</kbd> to close</div>
      </div>
    </div>
  );
}
