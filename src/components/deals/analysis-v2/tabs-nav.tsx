"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type TabDef = { id: string; label: string };

const TABS: TabDef[] = [
  { id: "decision", label: "Décision" },
  { id: "these", label: "Thèse" },
  { id: "signaux", label: "Signaux" },
  { id: "preuves", label: "Preuves" },
  { id: "memo", label: "Mémo" },
];

export function TabsNav({ rightSlot }: { rightSlot?: ReactNode }) {
  const [active, setActive] = useState<string>(TABS[0].id);
  const refs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

  const scrollTo = useCallback((id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    const offset = 160;
    const top = target.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
          }
        }
      },
      { rootMargin: "-180px 0px -55% 0px", threshold: 0 },
    );
    for (const t of TABS) {
      const el = document.getElementById(t.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  const indexById = useMemo(() => Object.fromEntries(TABS.map((t, i) => [t.id, i])), []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
      event.preventDefault();
      const currentIdx = indexById[active] ?? 0;
      let next = currentIdx;
      if (event.key === "ArrowLeft") next = Math.max(0, currentIdx - 1);
      if (event.key === "ArrowRight") next = Math.min(TABS.length - 1, currentIdx + 1);
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = TABS.length - 1;
      const nextTab = TABS[next];
      setActive(nextTab.id);
      refs.current.get(nextTab.id)?.focus();
      scrollTo(nextTab.id);
    },
    [active, indexById, scrollTo],
  );

  return (
    <div
      role="tablist"
      aria-label="Sections de l'analyse"
      onKeyDown={onKeyDown}
      className="sticky z-30 flex flex-wrap gap-1.5 rounded-xl border p-1.5"
      style={{
        top: 8,
        background: "rgba(255, 255, 255, 0.85)",
        borderColor: "var(--av-line)",
        boxShadow: "var(--av-shadow-soft)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      {TABS.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current.set(t.id, el);
            }}
            role="tab"
            aria-selected={isActive}
            aria-controls={t.id}
            id={`tab-${t.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => {
              setActive(t.id);
              scrollTo(t.id);
            }}
            className="av-transition min-h-11 rounded-lg px-4 text-[14px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--av-info)]"
            style={{
              background: isActive ? "var(--av-ink)" : "transparent",
              color: isActive ? "#ffffff" : "var(--av-muted)",
            }}
          >
            {t.label}
          </button>
        );
      })}
      {rightSlot ? (
        <div className="ml-auto flex items-center" onKeyDown={(e) => e.stopPropagation()}>
          {rightSlot}
        </div>
      ) : null}
    </div>
  );
}
