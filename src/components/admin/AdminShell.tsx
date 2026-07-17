import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  LayoutDashboard,
  Grid3x3,
  Users,
  Ticket,
  IndianRupee,
  ReceiptText,
  Megaphone,
  LifeBuoy,
  Building2,
  LogOut,
  Sparkles,
  Menu,
  X,
  CreditCard,
  Crown,
} from "lucide-react";
import { AuroraBackground, GlassPanel } from "@/components/glass";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useSession } from "@/lib/auth";
import { getOwnerBilling } from "@/lib/billing.functions";
import type { ReactNode } from "react";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };
const NAV: NavItem[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/settings", label: "Branches", icon: Building2 },
  { to: "/admin/layout-builder", label: "Layout Builder", icon: Grid3x3 },
  { to: "/admin/students", label: "Students", icon: Users },
  { to: "/admin/allocations", label: "Allocations", icon: Ticket },
  { to: "/admin/payments", label: "Payments", icon: IndianRupee },
  { to: "/admin/expenses", label: "Expenses", icon: ReceiptText },
  { to: "/admin/leads", label: "Leads", icon: Sparkles },
  { to: "/admin/notices", label: "Notices", icon: Megaphone },
  { to: "/admin/tickets", label: "Tickets", icon: LifeBuoy },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);

  // FIX: Fetch the session data so we can display the email in the sidebar
  const { data: session } = useSession();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    toast.success("Signed out");
    // Redirect to the new dedicated owner login page instead of the generic auth
    navigate({ to: "/owner-login", replace: true });
  }

  function NavList({ onClick }: { onClick?: () => void }) {
    return (
      <>
        {NAV.map((n) => {
          const active = n.exact ? pathname === n.to : pathname === n.to || pathname.startsWith(n.to + "/");
          return (
            <Link
              key={n.to}
              to={n.to}
              onClick={onClick}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-panel-strong text-foreground"
                  : "text-muted-foreground hover:bg-panel hover:text-foreground",
              )}
            >
              <n.icon className="size-4" />
              <span>{n.label}</span>
            </Link>
          );
        })}
      </>
    );
  }

  return (
    <div className="relative min-h-screen text-foreground">
      <AuroraBackground />
      <div className="relative z-10 flex min-h-screen">
        {/* Desktop sidebar */}
        <aside className="hidden w-64 shrink-0 border-r border-panel-border bg-panel/60 backdrop-blur-xl md:flex md:flex-col">
          <div className="p-6">
            <Link to="/admin" className="flex items-center gap-2">
              <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-violet to-cyan font-black">
                L
              </div>
              <span className="text-lg font-medium tracking-tight">LibraryBandhu</span>
            </Link>
            <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-panel-border bg-panel px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <span className="size-1.5 rounded-full bg-emerald" /> Owner workspace
            </div>
          </div>
          <nav className="flex-1 space-y-1 px-3">
            <NavList />
          </nav>
          <div className="px-3 pb-3">
            <SubscriptionCard />
          </div>
          <div className="border-t border-panel-border p-4">
            <div className="flex items-center gap-3">
              <div className="size-8 shrink-0 rounded-full bg-gradient-to-br from-violet/40 to-cyan/40 ring-1 ring-panel-border" />
              <div className="min-w-0 flex-1 text-xs">
                <p className="truncate font-bold">{session?.email ?? "—"}</p>
                <p className="truncate text-muted-foreground">Organization admin</p>
              </div>
              <button
                onClick={signOut}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-panel hover:text-foreground"
                title="Sign out"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
            <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-panel-border bg-background/95 backdrop-blur-xl">
              <div className="flex items-center justify-between p-5">
                <Link to="/admin" onClick={() => setMobileOpen(false)} className="flex items-center gap-2">
                  <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-violet to-cyan font-black">
                    L
                  </div>
                  <span className="text-lg font-medium tracking-tight">LibraryBandhu</span>
                </Link>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-panel"
                >
                  <X className="size-4" />
                </button>
              </div>
              <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
                <NavList onClick={() => setMobileOpen(false)} />
                <div className="pt-3">
                  <SubscriptionCard onClick={() => setMobileOpen(false)} />
                </div>
              </nav>
              <button
                onClick={signOut}
                className="flex items-center gap-2 border-t border-panel-border px-5 py-3 text-sm text-muted-foreground hover:text-foreground"
              >
                <LogOut className="size-4" /> Sign out
              </button>
            </aside>
          </div>
        )}

        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-panel-border bg-background/70 px-4 backdrop-blur-xl md:hidden">
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-panel"
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </button>
            <Link to="/admin" className="flex items-center gap-2">
              <div className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-violet to-cyan text-xs font-black">
                L
              </div>
              <span className="text-sm font-extrabold">LibraryBandhu</span>
            </Link>
            <button onClick={signOut} className="text-xs text-muted-foreground">
              Sign out
            </button>
          </header>
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 md:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <GlassPanel className="p-10 text-center">
      <h3 className="text-base font-semibold">{title}</h3>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </GlassPanel>
  );
}

function SubscriptionCard({ onClick }: { onClick?: () => void }) {
  const fetchBilling = useServerFn(getOwnerBilling);
  const { data } = useQuery({
    queryKey: ["owner-billing-sidebar"],
    queryFn: () => fetchBilling({}),
    staleTime: 60_000,
  });

  const sub = data?.subscription as any;
  const plan = data?.plan as any;
  const status = sub?.status as string | undefined;
  const isActive = status === "active" || status === "authenticated";
  const dueDate = sub?.current_period_end ? new Date(sub.current_period_end) : null;
  const dueLabel = dueDate
    ? dueDate.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })
    : null;

  return (
    <Link
      to="/admin/subscription"
      onClick={onClick}
      className="group relative block overflow-hidden rounded-xl border border-amber-300/40 bg-gradient-to-br from-amber-400/20 via-yellow-500/10 to-amber-600/20 p-3 shadow-[0_0_24px_-6px_rgba(251,191,36,0.55)] transition-all hover:from-amber-400/30 hover:to-amber-600/30 hover:shadow-[0_0_32px_-4px_rgba(251,191,36,0.75)]"
    >
      <div className="pointer-events-none absolute -right-6 -top-6 size-20 rounded-full bg-amber-300/25 blur-2xl" />
      <div className="relative flex items-center gap-2">
        <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-amber-300 to-amber-600 text-black shadow-inner">
          <Crown className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-mono uppercase tracking-widest text-amber-200/80">Subscription</p>
          <p className="truncate text-sm font-semibold text-amber-50">
            {plan?.name ?? (sub ? "Active plan" : "No plan")}
          </p>
        </div>
      </div>
      <div className="relative mt-2 flex items-center justify-between text-[11px]">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium",
            isActive
              ? "bg-emerald/20 text-emerald-300 ring-1 ring-emerald-400/40"
              : "bg-panel text-muted-foreground ring-1 ring-panel-border",
          )}
        >
          <span className={cn("size-1.5 rounded-full", isActive ? "bg-emerald-300" : "bg-muted-foreground")} />
          {status ? status.charAt(0).toUpperCase() + status.slice(1) : "Inactive"}
        </span>
        {dueLabel ? (
          <span className="text-amber-100/90">Due {dueLabel}</span>
        ) : (
          <span className="text-amber-100/70 group-hover:text-amber-50">Upgrade →</span>
        )}
      </div>
    </Link>
  );
}
