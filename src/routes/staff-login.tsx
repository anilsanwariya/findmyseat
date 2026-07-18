import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuroraBackground, GlassPanel } from "@/components/glass";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UserCog } from "lucide-react";

export const Route = createFileRoute("/staff-login")({
  head: () => ({
    meta: [
      { title: "Staff sign in — LibraryBandhu" },
      { name: "description", content: "Sign in to your LibraryBandhu staff workspace." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: StaffLoginPage,
});

function StaffLoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dispatch" });
    });
  }, [navigate]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Welcome back");
    navigate({ to: "/dispatch" });
  }

  return (
    <div className="relative min-h-screen text-foreground">
      <AuroraBackground />
      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-5 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-violet to-cyan font-black">L</div>
            <span className="text-lg font-extrabold tracking-tight">LibraryBandhu</span>
          </Link>
        </header>
        <div className="flex flex-1 items-center justify-center px-4 pb-16">
          <div className="w-full max-w-md">
            <GlassPanel className="p-6">
              <div className="flex items-center gap-2">
                <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-cyan to-violet shadow-[0_0_24px_-6px_rgba(34,211,238,0.6)]">
                  <UserCog className="size-4 text-slate-950" />
                </div>
                <div>
                  <h1 className="text-xl font-bold">Staff sign in</h1>
                  <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Employees only</p>
                </div>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                Use the credentials your library owner shared with you.
              </p>
              <form onSubmit={signIn} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Work email</Label>
                  <Input id="email" type="email" required autoComplete="email" value={email}
                    onChange={(e) => setEmail(e.target.value)} className="bg-panel border-panel-border" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pw">Password</Label>
                  <Input id="pw" type="password" required minLength={6} autoComplete="current-password"
                    value={password} onChange={(e) => setPassword(e.target.value)} className="bg-panel border-panel-border" />
                </div>
                <Button disabled={loading} type="submit" className="w-full bg-white text-slate-900 hover:bg-white/90">
                  {loading ? "…" : "Sign in"}
                </Button>
              </form>
            </GlassPanel>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Are you the library owner?{" "}
              <Link to="/owner-login" className="text-cyan hover:underline">Owner sign in →</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
