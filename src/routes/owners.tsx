import { createFileRoute, Link } from "@tanstack/react-router";
import { AuroraBackground, GlassPanel } from "@/components/glass";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { Grid3x3, Sparkles, Megaphone, ReceiptText, ArrowRight, Building2, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/owners")({
  head: () => ({
    meta: [
      { title: "Partner with LibraryBandhu — Library & Study Space SaaS" },
      {
        name: "description",
        content:
          "Fill every desk and automate your library operations. Visual layout builder, lead generation, notice board, and expense ledger — built for library owners.",
      },
      { property: "og:title", content: "Partner with LibraryBandhu — Library & Study Space SaaS" },
      {
        property: "og:description",
        content: "Fill every desk and automate your library operations. Built for library owners.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OwnersLandingPage,
});

const FEATURES = [
  {
    icon: Grid3x3,
    title: "Visual Layout Builder",
    desc: "Design your library floor with a drag-and-drop 15×15 grid. Section-based seating, real-time occupancy, and one-tap allocation.",
    tone: "from-violet/30 to-cyan/10",
  },
  {
    icon: Sparkles,
    title: "Automated Lead Generation",
    desc: "Get discovered on the LibraryBandhu student marketplace. Seat requests flow straight to your dashboard with contact details.",
    tone: "from-gold/30 to-magenta/10",
  },
  {
    icon: Megaphone,
    title: "Notice Board & Tickets",
    desc: "Publish notices to your students in real time. Handle complaints and requests through a built-in ticketing system.",
    tone: "from-cyan/30 to-emerald/10",
  },
  {
    icon: ReceiptText,
    title: "Expense Ledger",
    desc: "Track every rupee — rent, utilities, salaries. Payment collection and expense reconciliation, all in one place.",
    tone: "from-magenta/30 to-rose/10",
  },
];

function OwnersLandingPage() {
  return (
    <div className="relative min-h-screen text-foreground">
      <AuroraBackground />
      <div className="relative z-10">
        <header className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <Logo size={32} />
            <span className="text-lg font-extrabold tracking-tight">LibraryBandhu</span>
            <span className="hidden sm:inline text-xs font-mono uppercase tracking-widest text-muted-foreground ml-2">
              for Owners
            </span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link to="/">
              <Button variant="ghost" size="sm">
                Student site
              </Button>
            </Link>
            <Link to="/owner-login">
              <Button size="sm" className="bg-white text-slate-900 hover:bg-white/90">
                Sign in
              </Button>
            </Link>
          </nav>
        </header>

        {/* Hero */}
        <section className="mx-auto max-w-5xl px-4 pt-10 pb-16 text-center sm:px-6 sm:pt-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-panel-border bg-panel px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <Building2 className="size-3 text-gold" /> Library SaaS · Trusted by owners
          </div>
          <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-6xl">
            Fill Every Desk.
            <br />
            <span className="text-gradient-violet-cyan">Automate Your Library.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
            LibraryBandhu is the all-in-one management platform for library and study-space owners. Manage branches,
            seats, students, allocations, and payments — while a built-in marketplace sends new students your way.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/owner-login">
              <Button
                size="lg"
                className="h-12 px-6 bg-gradient-to-r from-gold to-magenta text-slate-950 hover:opacity-90 shadow-[0_0_30px_-6px_rgba(236,72,153,0.6)]"
              >
                Register Your Library <ArrowRight className="ml-2 size-4" />
              </Button>
            </Link>
            <Link to="/owner-login">
              <Button size="lg" variant="ghost" className="h-12 px-6">
                I already have an account
              </Button>
            </Link>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            {["Free 14-day trial", "No credit card required", "Cancel anytime"].map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-emerald" /> {t}
              </span>
            ))}
          </div>
        </section>

        {/* Feature Grid */}
        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
              Everything you need. Nothing you don't.
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">Purpose-built for library owners who want to grow.</p>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <GlassPanel key={f.title} className="group p-6 transition-transform hover:-translate-y-1">
                <div
                  className={`mb-4 inline-grid size-11 place-items-center rounded-xl bg-gradient-to-br ${f.tone} ring-1 ring-panel-border`}
                >
                  <f.icon className="size-5" />
                </div>
                <h3 className="text-base font-bold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </GlassPanel>
            ))}
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="mx-auto max-w-4xl px-4 pb-20 sm:px-6">
          <GlassPanel strong className="relative overflow-hidden p-10 text-center sm:p-14">
            <div className="pointer-events-none absolute -top-32 left-1/2 h-64 w-[600px] -translate-x-1/2 rounded-full bg-gradient-to-br from-violet/40 via-magenta/30 to-gold/40 blur-3xl opacity-60" />
            <div className="relative">
              <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Ready to digitalize your space?</h2>
              <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
                Join hundreds of library owners already using LibraryBandhu to run their business — and get free student
                leads from day one.
              </p>
              <Link to="/owner-login" className="mt-6 inline-block">
                <Button size="lg" className="h-12 px-8 bg-white text-slate-900 hover:bg-white/90">
                  Get Started for Free <ArrowRight className="ml-2 size-4" />
                </Button>
              </Link>
            </div>
          </GlassPanel>
        </section>

        <footer className="border-t border-panel-border/50 px-4 py-8 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} LibraryBandhu · Built for library owners
        </footer>
      </div>
    </div>
  );
}
