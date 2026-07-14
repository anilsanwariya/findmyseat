import { cn } from "@/lib/utils";
import type { ReactNode, HTMLAttributes } from "react";

export function AuroraBackground({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none fixed inset-0 z-0 overflow-hidden", className)} aria-hidden>
      <div className="absolute -top-[15%] -left-[10%] h-[600px] w-[600px] rounded-full bg-violet/25 blur-[140px] animate-drift" />
      <div className="absolute top-[10%] -right-[10%] h-[520px] w-[520px] rounded-full bg-cyan/20 blur-[130px] animate-drift [animation-delay:-8s]" />
      <div className="absolute -bottom-[15%] left-[20%] h-[700px] w-[700px] rounded-full bg-magenta/15 blur-[160px] animate-drift [animation-delay:-14s]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_0%,var(--background)_75%)]" />
    </div>
  );
}

export function GlassPanel({
  className,
  children,
  strong,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { strong?: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        strong ? "glass-strong" : "glass",
        "rounded-xl shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)]",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function Kpi({
  label,
  value,
  delta,
  tone = "violet",
}: {
  label: string;
  value: string;
  delta?: string;
  tone?: "violet" | "cyan" | "magenta" | "gold" | "emerald" | "rose";
}) {
  const toneMap: Record<string, string> = {
    violet: "bg-violet",
    cyan: "bg-cyan",
    magenta: "bg-magenta",
    gold: "bg-gold",
    emerald: "bg-emerald",
    rose: "bg-rose",
  };
  return (
    <GlassPanel className="p-5">
      <div className="flex items-start justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
        {delta && <span className="text-[11px] font-medium text-emerald">{delta}</span>}
      </div>
      <div className="mt-2 text-2xl font-extrabold tracking-tight text-foreground">{value}</div>
      <div className="mt-3 flex h-8 items-end gap-1 opacity-60">
        {[3, 5, 4, 6, 5, 7, 6].map((h, i) => (
          <div key={i} className={cn("flex-1 rounded-t-sm", toneMap[tone])} style={{ height: `${h * 4}px` }} />
        ))}
      </div>
    </GlassPanel>
  );
}

export function SectionHeader({ title, hint, right }: { title: string; hint?: string; right?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-extrabold tracking-tight text-foreground">{title}</h1>
        {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      </div>
      {right}
    </div>
  );
}
