import { GlassPanel } from "@/components/glass";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { inr } from "@/lib/format";
import type { ShiftOccupancy } from "@/lib/dashboard-metrics";
import { ChevronDown, Users } from "lucide-react";

export interface ShiftRow {
  name: string;
  students: number;
  revenue: number;
}

export function ShiftBreakdown({
  rows,
  occupancy,
  seatedStudents,
}: {
  rows: ShiftRow[];
  /** Seats taken / available per shift name; omitted while seat data loads. */
  occupancy?: ShiftOccupancy[];
  /** Distinct students holding a seat allocation. */
  seatedStudents: number;
}) {
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const occByName = new Map((occupancy ?? []).map((o) => [o.name, o]));

  // Show every shift that has students or seats to sell. "Full day" is only shown
  // when someone books it; whole-seat availability is on the Seats filled card.
  const names = [
    ...new Set([
      ...rows.map((r) => r.name),
      ...(occupancy ?? []).map((o) => o.name).filter((n) => n !== "Full day"),
    ]),
  ];
  const rowByName = new Map(rows.map((r) => [r.name, r]));
  const merged = names
    .map((name) => ({
      name,
      students: rowByName.get(name)?.students ?? 0,
      revenue: rowByName.get(name)?.revenue ?? 0,
      occ: occByName.get(name),
    }))
    .sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));

  return (
    <GlassPanel className="p-4 sm:p-5">
      <Collapsible defaultOpen={false}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="group h-auto min-h-11 w-full justify-between gap-3 whitespace-normal px-0 py-1 text-left hover:bg-transparent"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                <Users className="size-3.5 text-cyan" /> Students &amp; seats by shift
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                {seatedStudents} student{seatedStudents === 1 ? "" : "s"} with seats · {inr(totalRevenue)}{" "}
                / month
              </span>
            </span>
            <ChevronDown className="shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-4">

      {merged.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No active seat allocations yet.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {merged.map((r) => {
            const pct =
              r.occ && r.occ.capacity > 0 ? Math.round((r.occ.taken / r.occ.capacity) * 100) : 0;
            const free = r.occ ? Math.max(0, r.occ.capacity - r.occ.taken) : null;
            return (
              <div key={r.name} className="rounded-xl border border-panel-border bg-panel/40 p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium">{r.name}</span>
                  <span className="shrink-0 font-mono text-sm font-semibold text-cyan">
                    {inr(r.revenue)}
                  </span>
                </div>
                {r.occ && (
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-panel">
                    <div
                      className={
                        pct >= 90 ? "h-full rounded-full bg-emerald" : "h-full rounded-full bg-cyan"
                      }
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
                <div className="mt-2 flex flex-wrap justify-between gap-x-3 text-[11px] text-muted-foreground">
                  <span>
                    {r.students} student{r.students === 1 ? "" : "s"}
                  </span>
                  {r.occ && (
                    <span>
                      {r.occ.taken}/{r.occ.capacity} seats taken ·{" "}
                      <span className={free ? "font-semibold text-foreground" : ""}>
                        {free} free
                      </span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
        </CollapsibleContent>
      </Collapsible>
    </GlassPanel>
  );
}
