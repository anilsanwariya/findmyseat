import { GlassPanel } from "@/components/glass";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const toneText: Record<string, string> = {
  violet: "text-violet",
  cyan: "text-cyan",
  magenta: "text-magenta",
  gold: "text-gold",
  emerald: "text-emerald",
  rose: "text-rose",
};

const toneBg: Record<string, string> = {
  violet: "bg-violet",
  cyan: "bg-cyan",
  magenta: "bg-magenta",
  gold: "bg-gold",
  emerald: "bg-emerald",
  rose: "bg-rose",
};

export function StatCard({
  label,
  value,
  hint,
  tone = "violet",
  progress,
  delta,
  locked,
  className,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  tone?: "violet" | "cyan" | "magenta" | "gold" | "emerald" | "rose";
  /** 0-100; renders a thin bar under the value. */
  progress?: number;
  /** Change vs a previous period, e.g. { pct: 12, label: "vs Aug" }. */
  delta?: { pct: number; label: string; goodWhenUp?: boolean; unit?: string } | null;
  /** The viewer lacks permission to see this figure. */
  locked?: boolean;
  className?: string;
}) {
  if (locked) {
    return (
      <GlassPanel className={cn("p-4 sm:p-5", className)}>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        <div className="mt-2 text-sm font-semibold text-muted-foreground">No access</div>
        <div className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Ask the owner for permission
        </div>
      </GlassPanel>
    );
  }
  const good = delta ? (delta.goodWhenUp ?? true) === delta.pct >= 0 : false;
  return (
    <GlassPanel className={cn("p-4 sm:p-5", className)}>
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <div
        className={cn(
          "mt-2 truncate text-xl font-extrabold tracking-tight sm:text-2xl",
          toneText[tone],
        )}
      >
        {value}
      </div>
      {delta && (
        <div
          className={cn(
            "mt-1 text-[11px] font-medium",
            delta.pct === 0 ? "text-muted-foreground" : good ? "text-emerald" : "text-rose",
          )}
        >
          {delta.pct > 0 ? "▲" : delta.pct < 0 ? "▼" : "•"} {Math.abs(delta.pct)}
          {delta.unit ?? "%"} {delta.label}
        </div>
      )}
      {typeof progress === "number" && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-panel">
          <div
            className={cn("h-full rounded-full", toneBg[tone])}
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      )}
      {hint && <div className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{hint}</div>}
    </GlassPanel>
  );
}
