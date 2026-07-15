import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Grid3x3, Users, Ticket, IndianRupee, ReceiptText, Megaphone, LifeBuoy, Settings, LogOut, Sparkles, ShieldCheck } from "lucide-react";
import { AuroraBackground, GlassPanel } from "@/components/glass";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ReactNode } from "react";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };
const NAV: NavItem[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/layout-builder", label: "Layout Builder", icon: Grid3x3 },
  { to: "/admin/students", label: "Students", icon: Users },
  { to: "/admin/allocations", label: "Allocations", icon: Ticket },
  { to: "/admin/payments", label: "Payments", icon: IndianRupee },
  { to: "/admin/expenses", label: "Expenses", icon: ReceiptText },
  { to: "/admin/leads", label: "Leads", icon: Sparkles },
  { to: "/admin/notices", label: "Notices", icon: Megaphone },
  { to: "/admin/tickets", label: "Tickets", icon: LifeBuoy },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: session } = useSession();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="relative min-h-screen text-foreground">
      <AuroraBackground />
      <div className="relative z-10 flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-panel-border bg-panel/60 backdrop-blur-xl md:flex md:flex-col">
          <div className="p-6">
            <Link to="/admin" className="flex items-center gap-2">
              <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-violet to-cyan font-black">L</div>
              <span className="text-lg font-extrabold tracking-tight">LEXICON</span>
            </Link>
            <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-panel-border bg-panel px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <span className="size-1.5 rounded-full bg-emerald" /> Owner workspace
            </div>
          </div>
          <nav className="flex-1 space-y-1 px-3">
            {NAV.map((n) => {
              const active = n.exact ? pathname === n.to : pathname === n.to || pathname.startsWith(n.to + "/");
              return (
                <Link key={n.to} to={n.to}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    active ? "bg-panel-strong text-foreground" : "text-muted-foreground hover:bg-panel hover:text-foreground",
                  )}
                >
                  <n.icon className="size-4" />
                  <span>{n.label}</span>
                </Link>
              );
            })}
            {session?.role === "super_admin" && (
              <Link to="/super-admin"
                className={cn(
                  "mt-4 flex items-center gap-3 rounded-lg border border-gold/30 bg-gradient-to-r from-gold/10 to-magenta/10 px-3 py-2 text-sm text-gold shadow-[0_0_20px_-8px_rgba(236,72,153,0.5)] transition-colors hover:from-gold/20 hover:to-magenta/20",
                )}
              >
                <ShieldCheck className="size-4" />
                <span className="font-semibold">Master Admin</span>
              </Link>
            )}
          </nav>
          <div className="border-t border-panel-border p-4">
            <div className="flex items-center gap-3">
              <div className="size-8 shrink-0 rounded-full bg-gradient-to-br from-violet/40 to-cyan/40 ring-1 ring-panel-border" />
              <div className="min-w-0 flex-1 text-xs">
                <p className="truncate font-bold">{session?.email ?? "—"}</p>
                <p className="truncate text-muted-foreground">Organization admin</p>
              </div>
              <button onClick={signOut} className="rounded-md p-1.5 text-muted-foreground hover:bg-panel hover:text-foreground" title="Sign out">
                <LogOut className="size-4" />
              </button>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-panel-border bg-background/50 px-6 backdrop-blur-xl md:hidden">
            <Link to="/admin" className="flex items-center gap-2">
              <div className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-violet to-cyan text-xs font-black">L</div>
              <span className="text-sm font-extrabold">LEXICON</span>
            </Link>
            <button onClick={signOut} className="text-xs text-muted-foreground">Sign out</button>
          </header>
          <div className="mx-auto max-w-7xl px-6 py-6 md:py-8">{children}</div>
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
