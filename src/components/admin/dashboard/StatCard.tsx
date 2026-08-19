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
  className,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  tone?: "violet" | "cyan" | "magenta" | "gold" | "emerald" | "rose";
  /** 0-100; renders a thin bar under the value. */
  progress?: number;
  className?: string;
}) {
  return (
    <GlassPanel className={cn("p-4 sm:p-5", className)}>
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <div className={cn("mt-2 truncate text-xl font-extrabold tracking-tight sm:text-2xl", toneText[tone])}>{value}</div>
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
