import { createFileRoute, Link } from "@tanstack/react-router";
import { AuroraBackground, GlassPanel } from "@/components/glass";
import { Button } from "@/components/ui/button";
import { ArrowRight, MapPin, Sparkles, Users2, LineChart } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="relative min-h-screen text-foreground">
      <AuroraBackground />
      <div className="relative z-10">
        <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-violet to-cyan font-black">L</div>
            <span className="text-lg font-extrabold tracking-tight">LEXICON</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link to="/student-login"><Button variant="ghost" size="sm">Student sign in</Button></Link>
            <Link to="/auth"><Button size="sm" className="bg-white text-slate-900 hover:bg-white/90">Owner sign in</Button></Link>
          </nav>
        </header>

        <main className="mx-auto max-w-7xl px-6 py-16">
          <section className="grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-panel-border bg-panel px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                <Sparkles className="size-3 text-gold" /> Study space management, reimagined
              </div>
              <h1 className="mt-6 text-5xl font-extrabold tracking-tight md:text-6xl">
                Run your <span className="text-gradient-violet-cyan">library</span> like a modern SaaS.
              </h1>
              <p className="mt-4 max-w-xl text-muted-foreground">
                Layout builder for seats and sections. Shift-aware allocations. Payments, dues,
                expenditures, notices, tickets — and a discovery marketplace that brings you leads.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/auth"><Button size="lg" className="bg-white text-slate-900 hover:bg-white/90">Open owner dashboard <ArrowRight className="ml-1 size-4" /></Button></Link>
                <Link to="/student-login"><Button size="lg" variant="outline" className="border-panel-border bg-panel">I'm a student</Button></Link>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <GlassPanel className="p-5">
                <MapPin className="size-5 text-violet" />
                <div className="mt-3 text-sm font-semibold">Zone-based discovery</div>
                <p className="mt-1 text-xs text-muted-foreground">Aspirants find spaces by area and target exam.</p>
              </GlassPanel>
              <GlassPanel className="p-5">
                <Users2 className="size-5 text-cyan" />
                <div className="mt-3 text-sm font-semibold">Multi-tenant by design</div>
                <p className="mt-1 text-xs text-muted-foreground">Every branch is isolated. Row-level security enforced.</p>
              </GlassPanel>
              <GlassPanel className="p-5">
                <LineChart className="size-5 text-emerald" />
                <div className="mt-3 text-sm font-semibold">Financial clarity</div>
                <p className="mt-1 text-xs text-muted-foreground">Revenue, dues, expenditures, net profit — always live.</p>
              </GlassPanel>
              <GlassPanel className="p-5 relative overflow-hidden">
                <div className="absolute -right-6 -top-6 size-16 rounded-full bg-gold/20 blur-2xl" />
                <Sparkles className="size-5 text-gold" />
                <div className="mt-3 text-sm font-semibold">Featured placements</div>
                <p className="mt-1 text-xs text-muted-foreground">Bid to pin your branch in your zone.</p>
              </GlassPanel>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
