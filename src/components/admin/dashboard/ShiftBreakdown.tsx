import { GlassPanel } from "@/components/glass";
import { inr } from "@/lib/format";
import { Users } from "lucide-react";

export interface ShiftRow {
  name: string;
  students: number;
  revenue: number;
}

export function ShiftBreakdown({ rows, totalStudents }: { rows: ShiftRow[]; totalStudents: number }) {
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const max = Math.max(1, ...rows.map((r) => r.students));

  return (
    <GlassPanel className="p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          <Users className="size-3.5 text-cyan" /> Students by shift
        </h3>
        <span className="text-xs text-muted-foreground">
          {totalStudents} active students · {inr(totalRevenue)} / month
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No active seat allocations yet.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.name} className="rounded-xl border border-panel-border bg-panel/40 p-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-medium">{r.name}</span>
                <span className="shrink-0 font-mono text-sm font-semibold text-cyan">{inr(r.revenue)}</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-panel">
                <div className="h-full rounded-full bg-cyan" style={{ width: `${(r.students / max) * 100}%` }} />
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">
                {r.students} student{r.students === 1 ? "" : "s"} · monthly fees
              </div>
            </div>
          ))}
        </div>
      )}
    </GlassPanel>
  );
}
