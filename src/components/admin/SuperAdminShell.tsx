import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { LayoutDashboard, Building2, CreditCard, LogOut, ShieldCheck, Menu, X } from "lucide-react";
import { AuroraBackground } from "@/components/glass";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };
const NAV: NavItem[] = [
  { to: "/super-admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/super-admin/organizations", label: "Organizations", icon: Building2 },
  { to: "/super-admin/billing", label: "Billing & Plans", icon: CreditCard },
];

export function SuperAdminShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/auth", replace: true });
  }

  function NavList({ onClick }: { onClick?: () => void }) {
    return (
      <>
        {NAV.map((n) => {
          const active = n.exact ? pathname === n.to : pathname === n.to || pathname.startsWith(n.to + "/");
          return (
            <Link key={n.to} to={n.to} onClick={onClick}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-gradient-to-r from-gold/20 to-magenta/10 text-gold border border-gold/30"
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
        <aside className="hidden w-64 shrink-0 border-r border-panel-border bg-gradient-to-b from-background/80 via-panel/40 to-background/80 backdrop-blur-xl md:flex md:flex-col">
          <div className="p-6">
            <Link to="/super-admin" className="flex items-center gap-2">
              <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-gold to-magenta shadow-[0_0_24px_-4px_rgba(236,72,153,0.6)]">
                <ShieldCheck className="size-4 text-slate-950" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black tracking-tight">LEXICON</p>
                <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-gold">Master Control</p>
              </div>
            </Link>
            <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-gold">
              <span className="size-1.5 rounded-full bg-gold animate-pulse" /> Platform admin
            </div>
          </div>
          <nav className="flex-1 space-y-1 px-3"><NavList /></nav>
          <div className="border-t border-panel-border p-4">
            <button onClick={signOut} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-muted-foreground hover:bg-panel hover:text-foreground">
              <LogOut className="size-4" /> Sign out
            </button>
          </div>
        </aside>

        {mobileOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
            <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-panel-border bg-background/95 backdrop-blur-xl">
              <div className="flex items-center justify-between p-5">
                <Link to="/super-admin" onClick={() => setMobileOpen(false)} className="flex items-center gap-2">
                  <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-gold to-magenta"><ShieldCheck className="size-4 text-slate-950" /></div>
                  <span className="text-sm font-extrabold">Master Control</span>
                </Link>
                <button onClick={() => setMobileOpen(false)} className="rounded-md p-1.5 text-muted-foreground hover:bg-panel"><X className="size-4" /></button>
              </div>
              <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4"><NavList onClick={() => setMobileOpen(false)} /></nav>
              <button onClick={signOut} className="flex items-center gap-2 border-t border-panel-border px-5 py-3 text-sm text-muted-foreground hover:text-foreground">
                <LogOut className="size-4" /> Sign out
              </button>
            </aside>
          </div>
        )}

        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-panel-border bg-background/70 px-4 backdrop-blur-xl md:hidden">
            <button onClick={() => setMobileOpen(true)} className="rounded-md p-1.5 text-muted-foreground hover:bg-panel" aria-label="Open menu">
              <Menu className="size-5" />
            </button>
            <Link to="/super-admin" className="flex items-center gap-2">
              <div className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-gold to-magenta"><ShieldCheck className="size-3.5 text-slate-950" /></div>
              <span className="text-sm font-extrabold">Master Control</span>
            </Link>
            <button onClick={signOut} className="text-xs text-muted-foreground">Sign out</button>
          </header>
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 md:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
