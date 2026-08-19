import { GlassPanel } from "@/components/glass";
import { inr } from "@/lib/format";
import { ViewToggle, useDataView } from "@/components/admin/ViewToggle";
import { cn } from "@/lib/utils";
import { useState } from "react";

export interface BranchRow {
  id: string;
  name: string;
  students: number;
  seats: number;
  occupied: number;
  collected: number;
  dues: number;
  expenses: number;
}

type SortKey = "collected" | "dues" | "occupancy" | "name";

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

export function BranchComparison({ rows }: { rows: BranchRow[] }) {
  const [view, setView] = useDataView("dashboard-branches", "table");
  const [sort, setSort] = useState<SortKey>("collected");

  const sorted = [...rows].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "occupancy") return pct(b.occupied, b.seats) - pct(a.occupied, a.seats);
    return Number(b[sort]) - Number(a[sort]);
  });

  return (
    <GlassPanel className="p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Branch comparison</h3>
        <div className="flex items-center gap-2">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-8 rounded-lg border border-panel-border bg-panel px-2 text-xs"
            aria-label="Sort branches"
          >
            <option value="collected">Sort: collected</option>
            <option value="dues">Sort: dues</option>
            <option value="occupancy">Sort: occupancy</option>
            <option value="name">Sort: name</option>
          </select>
          <ViewToggle value={view} onChange={setView} />
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No branches yet.</p>
      ) : view === "cards" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {sorted.map((b) => (
            <div key={b.id} className="rounded-lg border border-panel-border bg-panel/50 p-3">
              <div className="flex items-start justify-between gap-2">
                <span className="truncate text-sm font-semibold">{b.name}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest",
                    pct(b.occupied, b.seats) >= 75 ? "bg-emerald/15 text-emerald" : "bg-cyan/15 text-cyan",
                  )}
                >
                  {pct(b.occupied, b.seats)}% full
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <Cell label="Students" value={String(b.students)} />
                <Cell label="Seats" value={`${b.occupied}/${b.seats}`} />
                <Cell label="Collected" value={inr(b.collected)} tone="text-emerald" />
                <Cell label="Dues" value={inr(b.dues)} tone="text-rose" />
                <Cell label="Expenses" value={inr(b.expenses)} tone="text-magenta" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr className="border-b border-panel-border">
                <th className="py-2 pr-3">Branch</th>
                <th className="py-2 pr-3">Students</th>
                <th className="py-2 pr-3">Occupancy</th>
                <th className="py-2 pr-3 text-right">Collected</th>
                <th className="py-2 pr-3 text-right">Dues</th>
                <th className="py-2 text-right">Expenses</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((b) => (
                <tr key={b.id} className="border-b border-panel-border/50">
                  <td className="py-3 pr-3 font-medium">{b.name}</td>
                  <td className="py-3 pr-3">{b.students}</td>
                  <td className="py-3 pr-3">
                    <span className="text-xs text-muted-foreground">
                      {b.occupied}/{b.seats} · {pct(b.occupied, b.seats)}%
                    </span>
                  </td>
                  <td className="py-3 pr-3 text-right font-mono text-emerald">{inr(b.collected)}</td>
                  <td className="py-3 pr-3 text-right font-mono text-rose">{inr(b.dues)}</td>
                  <td className="py-3 text-right font-mono text-magenta">{inr(b.expenses)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GlassPanel>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 font-mono text-sm font-semibold", tone)}>{value}</div>
    </div>
  );
}
