import { useEffect, useState } from "react";
import { LayoutGrid, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type DataView = "table" | "cards";

/** Remembers the chosen view per screen so owners don't re-toggle every visit. */
export function useDataView(storageKey: string, fallback: DataView = "table") {
  const [view, setView] = useState<DataView>(fallback);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(`view:${storageKey}`);
      if (saved === "table" || saved === "cards") setView(saved);
      else if (window.innerWidth < 768) setView("cards");
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  const update = (v: DataView) => {
    setView(v);
    try {
      window.localStorage.setItem(`view:${storageKey}`, v);
    } catch {
      /* ignore */
    }
  };

  return [view, update] as const;
}

export function ViewToggle({ value, onChange }: { value: DataView; onChange: (v: DataView) => void }) {
  const btn = (v: DataView, Icon: typeof Table2, label: string) => (
    <button
      type="button"
      onClick={() => onChange(v)}
      aria-pressed={value === v}
      title={label}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded px-2.5 font-mono text-[10px] uppercase tracking-widest transition-colors",
        value === v ? "bg-panel-strong text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );

  return (
    <div className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-panel-border bg-panel p-1">
      {btn("cards", LayoutGrid, "Cards")}
      {btn("table", Table2, "Table")}
    </div>
  );
}
