import { Link } from "@tanstack/react-router";
import { GlassPanel } from "@/components/glass";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AlertTriangle, CalendarClock, HandCoins, LifeBuoy, UserPlus } from "lucide-react";
import type { ReactNode } from "react";

export interface ActionStudent {
  allocationId: string;
  studentId: string;
  name: string;
  branch: string;
  seat: string;
  amount: number;
  paid?: number;
  fee?: number;
  days?: number;
  dueDate?: string | null;
}

function Group({
  icon,
  title,
  tone,
  count,
  link,
  linkLabel,
  children,
}: {
  icon: ReactNode;
  title: string;
  tone: string;
  count: number;
  link?: ReactNode;
  linkLabel?: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-panel-border bg-panel/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("grid size-7 shrink-0 place-items-center rounded-md", tone)}>{icon}</span>
          <span className="truncate text-sm font-semibold">{title}</span>
        </div>
        <span className="shrink-0 font-mono text-sm font-bold">{count}</span>
      </div>
      {children}
      {link && <div className="mt-2 text-[11px] text-cyan">{link ?? linkLabel}</div>}
    </div>
  );
}

function Rows({
  rows,
  onOpen,
  render,
}: {
  rows: ActionStudent[];
  onOpen: (id: string) => void;
  render: (r: ActionStudent) => ReactNode;
}) {
  if (rows.length === 0)
    return <p className="mt-2 text-[11px] text-muted-foreground">Nothing here right now.</p>;
  return (
    <div className="mt-2 divide-y divide-panel-border/60">
      {rows.map((r) => (
        <button
          key={r.allocationId}
          type="button"
          onClick={() => onOpen(r.studentId)}
          className="flex w-full items-center justify-between gap-3 py-2 text-left hover:opacity-80"
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{r.name}</div>
            <div className="truncate text-[11px] text-muted-foreground">
              {r.branch}
              {r.seat ? ` · Seat ${r.seat}` : ""}
            </div>
          </div>
          <div className="shrink-0 text-right">{render(r)}</div>
        </button>
      ))}
    </div>
  );
}

export function ActionList({
  overdue,
  partial,
  upcoming,
  pendingLeads,
  openTickets,
  onOpenStudent,
}: {
  overdue: ActionStudent[];
  partial: ActionStudent[];
  upcoming: ActionStudent[];
  pendingLeads: number;
  openTickets: number;
  onOpenStudent: (studentId: string) => void;
}) {
  return (
    <GlassPanel className="p-4 sm:p-5">
      <h3 className="mb-4 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Needs attention</h3>
      <div className="space-y-3">
        <Group
          icon={<AlertTriangle className="size-4 text-rose" />}
          tone="bg-rose/15"
          title="Overdue students"
          count={overdue.length}
          link={
            <Link to="/admin/allocations" className="hover:underline">
              View all allocations →
            </Link>
          }
        >
          <Rows
            rows={overdue.slice(0, 8)}
            onOpen={onOpenStudent}
            render={(r) => (
              <>
                <div className="font-mono text-sm font-semibold text-rose">{inr(r.amount)}</div>
                <div className="text-[11px] text-muted-foreground">{r.days} days late</div>
              </>
            )}
          />
        </Group>

        <Group
          icon={<HandCoins className="size-4 text-gold" />}
          tone="bg-gold/15"
          title="Part-paid students"
          count={partial.length}
        >
          <Rows
            rows={partial.slice(0, 6)}
            onOpen={onOpenStudent}
            render={(r) => (
              <>
                <div className="font-mono text-sm font-semibold text-gold">{inr(r.amount)} left</div>
                <div className="text-[11px] text-muted-foreground">
                  {inr(r.paid ?? 0)} of {inr(r.fee ?? 0)}
                </div>
              </>
            )}
          />
        </Group>

        <Group
          icon={<CalendarClock className="size-4 text-cyan" />}
          tone="bg-cyan/15"
          title="Due in next 7 days"
          count={upcoming.length}
        >
          <Rows
            rows={upcoming.slice(0, 6)}
            onOpen={onOpenStudent}
            render={(r) => (
              <>
                <div className="font-mono text-sm font-semibold text-cyan">{inr(r.amount)}</div>
                <div className="text-[11px] text-muted-foreground">in {r.days} days</div>
              </>
            )}
          />
        </Group>

        <div className="grid gap-3 sm:grid-cols-2">
          <Group
            icon={<UserPlus className="size-4 text-violet" />}
            tone="bg-violet/15"
            title="Pending leads"
            count={pendingLeads}
            link={
              <Link to="/admin/leads" className="hover:underline">
                Open leads →
              </Link>
            }
          />
          <Group
            icon={<LifeBuoy className="size-4 text-magenta" />}
            tone="bg-magenta/15"
            title="Open tickets"
            count={openTickets}
            link={
              <Link to="/admin/tickets" className="hover:underline">
                Open tickets →
              </Link>
            }
          />
        </div>
      </div>
    </GlassPanel>
  );
}
