import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuroraBackground, GlassPanel } from "@/components/glass";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { enforceLoginPortal } from "@/lib/auth";
import { toast } from "sonner";
import { Building2 } from "lucide-react";

export const Route = createFileRoute("/owner-login")({
  head: () => ({
    meta: [
      { title: "Library Owner Sign in — LibraryBandhu" },
      {
        name: "description",
        content: "Sign in or register your library on LibraryBandhu — the all-in-one library management SaaS.",
      },
    ],
  }),
  component: OwnerLoginPage,
});

function OwnerLoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dispatch" });
    });
  }, [navigate]);

  async function signIn(email: string, password: string) {
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

  async function signUp(email: string, password: string) {
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/onboarding` },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data.session) {
      toast.success("Account created");
      navigate({ to: "/onboarding" });
    } else {
      toast.success("Check your email to confirm your account");
    }
  }

  return (
    <div className="relative min-h-screen text-foreground">
      <AuroraBackground />
      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-5 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-violet to-cyan font-black">
              L
            </div>
            <span className="text-lg font-extrabold tracking-tight">LibraryBandhu</span>
          </Link>
        </header>
        <div className="flex flex-1 items-center justify-center px-4 pb-16">
          <div className="w-full max-w-md">
            <div className="mb-6 flex items-center justify-center gap-2">
              <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-gold to-magenta shadow-[0_0_24px_-6px_rgba(236,72,153,0.6)]">
                <Building2 className="size-4 text-slate-950" />
              </div>
              <span className="text-lg font-extrabold tracking-tight">
                LibraryBandhu <span className="text-muted-foreground font-normal">for Owners</span>
              </span>
            </div>
            <GlassPanel className="p-6">
              <h1 className="text-xl font-bold">Business Account</h1>
              <p className="mt-1 text-sm text-muted-foreground">Sign in or register your library workspace.</p>
              <Tabs defaultValue="signin" className="mt-6">
                <TabsList className="grid w-full grid-cols-2 bg-panel">
                  <TabsTrigger value="signin">Sign in</TabsTrigger>
                  <TabsTrigger value="signup">Register library</TabsTrigger>
                </TabsList>
                <TabsContent value="signin">
                  <AuthForm loading={loading} onSubmit={signIn} submitLabel="Sign in" />
                </TabsContent>
                <TabsContent value="signup">
                  <AuthForm loading={loading} onSubmit={signUp} submitLabel="Create account" />
                </TabsContent>
              </Tabs>
              <p className="mt-6 text-center text-xs text-muted-foreground">
                Manage your library workspace with confidence.
              </p>
            </GlassPanel>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              New here?{" "}
              <Link to="/owners" className="text-cyan hover:underline">
                Learn how LibraryBandhu grows your library →
              </Link>
            </p>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Are you an employee?{" "}
              <Link to="/staff-login" className="text-cyan hover:underline">
                Staff sign in →
              </Link>
            </p>

          </div>
        </div>
      </div>
    </div>
  );
}

function AuthForm({
  onSubmit,
  submitLabel,
  loading,
}: {
  onSubmit: (email: string, pw: string) => Promise<void>;
  submitLabel: string;
  loading: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(email, password);
      }}
      className="mt-4 space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="email">Business email</Label>
        <Input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="bg-panel border-panel-border"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pw">Password</Label>
        <Input
          id="pw"
          type="password"
          required
          minLength={6}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="bg-panel border-panel-border"
        />
      </div>
      <Button disabled={loading} type="submit" className="w-full bg-white text-slate-900 hover:bg-white/90">
        {loading ? "…" : submitLabel}
      </Button>
    </form>
  );
}
