import { Link } from "@tanstack/react-router";
import { GlassPanel } from "@/components/glass";
import { fmtDate, inr } from "@/lib/format";
import { whatsappLink } from "@/lib/dashboard-metrics";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CalendarClock,
  HandCoins,
  IndianRupee,
  LifeBuoy,
  MessageCircle,
  ReceiptText,
  UserPlus,
} from "lucide-react";
import { useState, type ReactNode } from "react";

export interface ActionStudent {
  allocationId: string;
  studentId: string;
  name: string;
  mobile?: string | null;
  branch: string;
  seat: string;
  amount: number;
  paid?: number;
  fee?: number;
  days?: number;
  dueDate?: string | null;
  startDate?: string | null;
}

/** How many rows each group shows before "Show all". */
const PREVIEW = 5;

function Group({
  icon,
  title,
  tone,
  count,
  link,
  children,
}: {
  icon: ReactNode;
  title: string;
  tone: string;
  count: number;
  link?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-panel-border bg-panel/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("grid size-7 shrink-0 place-items-center rounded-md", tone)}>
            {icon}
          </span>
          <span className="truncate text-sm font-semibold">{title}</span>
        </div>
        <span className="shrink-0 font-mono text-sm font-bold">{count}</span>
      </div>
      {children}
      {link && <div className="mt-2 text-[11px] text-cyan">{link}</div>}
    </div>
  );
}

function Rows({
  rows,
  onOpen,
  onLogPayment,
  reminder,
  render,
}: {
  rows: ActionStudent[];
  onOpen: (id: string) => void;
  onLogPayment?: (allocationId: string) => void;
  /** WhatsApp reminder text for a row; omit to hide the button. */
  reminder?: (r: ActionStudent) => string;
  render: (r: ActionStudent) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  if (rows.length === 0)
    return <p className="mt-2 text-[11px] text-muted-foreground">Nothing here right now.</p>;
  const visible = expanded ? rows : rows.slice(0, PREVIEW);
  return (
    <>
      <div className="mt-2 divide-y divide-panel-border/60">
        {visible.map((r) => {
          const wa = reminder ? whatsappLink(r.mobile, reminder(r)) : null;
          return (
            <div key={r.allocationId} className="flex items-center justify-between gap-2 py-2">
              <button
                type="button"
                onClick={() => onOpen(r.studentId)}
                className="min-w-0 flex-1 text-left hover:opacity-80"
              >
                <div className="truncate text-sm font-medium">{r.name}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {r.branch}
                  {r.seat ? ` · Seat ${r.seat}` : ""}
                </div>
              </button>
              <div className="shrink-0 text-right">{render(r)}</div>
              {(wa || onLogPayment) && (
                <div className="flex shrink-0 items-center gap-1">
                  {wa && (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Send WhatsApp reminder"
                      aria-label={`Send WhatsApp reminder to ${r.name}`}
                      className="grid size-8 place-items-center rounded-md border border-panel-border text-emerald hover:bg-emerald/10"
                    >
                      <MessageCircle className="size-4" />
                    </a>
                  )}
                  {onLogPayment && (
                    <button
                      type="button"
                      onClick={() => onLogPayment(r.allocationId)}
                      title="Log payment"
                      aria-label={`Log payment for ${r.name}`}
                      className="grid size-8 place-items-center rounded-md border border-panel-border text-cyan hover:bg-cyan/10"
                    >
                      <IndianRupee className="size-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {rows.length > PREVIEW && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-[11px] text-cyan hover:underline"
        >
          {expanded ? "Show less" : `Show all (${rows.length})`}
        </button>
      )}
    </>
  );
}

const seatText = (r: ActionStudent) =>
  r.seat && r.seat !== "Unassigned" ? ` (seat ${r.seat})` : "";

export function ActionList({
  awaitingFirstPayment,
  overdue,
  partial,
  upcoming,
  pendingLeads,
  openTickets,
  onOpenStudent,
  onLogPayment,
}: {
  /** null hides the group (viewer cannot see payments). */
  awaitingFirstPayment: ActionStudent[] | null;
  overdue: ActionStudent[];
  partial: ActionStudent[] | null;
  upcoming: ActionStudent[];
  /** null when the viewer cannot see leads / tickets. */
  pendingLeads: number | null;
  openTickets: number | null;
  onOpenStudent: (studentId: string) => void;
  /** Omit to hide the "Log payment" buttons. */
  onLogPayment?: (allocationId: string) => void;
}) {
  return (
    <GlassPanel className="p-4 sm:p-5">
      <h3 className="mb-4 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        Needs attention
      </h3>
      <div className="space-y-3">
        {awaitingFirstPayment && (
          <Group
            icon={<ReceiptText className="size-4 text-amber" />}
            tone="bg-amber/15"
            title="Awaiting first payment"
            count={awaitingFirstPayment.length}
          >
            <Rows
              rows={awaitingFirstPayment}
              onOpen={onOpenStudent}
              onLogPayment={onLogPayment}
              reminder={(r) =>
                `Hi ${r.name}, welcome to ${r.branch}! Your library fee of ${inr(r.amount)}${seatText(r)} is pending. Please pay at the earliest. Thank you!`
              }
              render={(r) => (
                <>
                  <div className="font-mono text-sm font-semibold text-amber">{inr(r.amount)}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {r.startDate ? `Allocated ${fmtDate(r.startDate)}` : "Payment not logged"}
                  </div>
                </>
              )}
            />
          </Group>
        )}

        <Group
          icon={<AlertTriangle className="size-4 text-rose" />}
          tone="bg-rose/15"
          title="Overdue students"
          count={overdue.length}
          link={
            <Link
              to="/admin/allocations"
              search={{ newStudentId: undefined, newStudentName: undefined }}
              className="hover:underline"
            >
              View all allocations →
            </Link>
          }
        >
          <Rows
            rows={overdue}
            onOpen={onOpenStudent}
            onLogPayment={onLogPayment}
            reminder={(r) =>
              `Hi ${r.name}, your library fee of ${inr(r.amount)} at ${r.branch}${seatText(r)} was due on ${fmtDate(r.dueDate)}. Please pay at the earliest. Thank you!`
            }
            render={(r) => (
              <>
                <div className="font-mono text-sm font-semibold text-rose">{inr(r.amount)}</div>
                <div className="text-[11px] text-muted-foreground">
                  {r.days === 1 ? "1 day late" : `${r.days} days late`}
                </div>
              </>
            )}
          />
        </Group>

        {partial && (
          <Group
            icon={<HandCoins className="size-4 text-gold" />}
            tone="bg-gold/15"
            title="Part-paid students"
            count={partial.length}
          >
            <Rows
              rows={partial}
              onOpen={onOpenStudent}
              onLogPayment={onLogPayment}
              reminder={(r) =>
                `Hi ${r.name}, ${inr(r.amount)} of your library fee at ${r.branch}${seatText(r)} is still pending. Please clear it at the earliest. Thank you!`
              }
              render={(r) => (
                <>
                  <div className="font-mono text-sm font-semibold text-gold">
                    {inr(r.amount)} left
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {inr(r.paid ?? 0)} of {inr(r.fee ?? 0)}
                  </div>
                </>
              )}
            />
          </Group>
        )}

        <Group
          icon={<CalendarClock className="size-4 text-cyan" />}
          tone="bg-cyan/15"
          title="Due in next 7 days"
          count={upcoming.length}
        >
          <Rows
            rows={upcoming}
            onOpen={onOpenStudent}
            onLogPayment={onLogPayment}
            reminder={(r) =>
              `Hi ${r.name}, a reminder that your library fee of ${inr(r.amount)} at ${r.branch}${seatText(r)} is due on ${fmtDate(r.dueDate)}. Thank you!`
            }
            render={(r) => (
              <>
                <div className="font-mono text-sm font-semibold text-cyan">{inr(r.amount)}</div>
                <div className="text-[11px] text-muted-foreground">
                  {r.days === 0 ? "due today" : r.days === 1 ? "in 1 day" : `in ${r.days} days`}
                </div>
              </>
            )}
          />
        </Group>

        {(pendingLeads !== null || openTickets !== null) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {pendingLeads !== null && (
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
            )}
            {openTickets !== null && (
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
            )}
          </div>
        )}
      </div>
    </GlassPanel>
  );
}
