import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AuroraBackground, GlassPanel } from "@/components/glass";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { enforceLoginPortal } from "@/lib/auth";
import { sendOwnerSignupOtp, verifyOwnerSignupOtp } from "@/lib/owner-signup.functions";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";
import { Building2 } from "lucide-react";

export const Route = createFileRoute("/owner-login")({
  head: () => ({
    meta: [
      { title: "Library Owner Sign in — LibraryBandhu" },
      {
        name: "description",
        content: "Sign in or register your organisation on LibraryBandhu — the all-in-one library management SaaS.",
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
    if (error) {
      setLoading(false);
      toast.error(error.message);
      return;
    }
    const gate = await enforceLoginPortal("owner");
    setLoading(false);
    if (gate) {
      toast.error(gate);
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
            <Logo size={32} />
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
              <p className="mt-1 text-sm text-muted-foreground">Sign in or register your organisation.</p>
              <Tabs defaultValue="signin" className="mt-6">
                <TabsList className="grid w-full grid-cols-2 bg-panel">
                  <TabsTrigger value="signin">Sign in</TabsTrigger>
                  <TabsTrigger value="signup">Register organisation</TabsTrigger>
                </TabsList>
                <TabsContent value="signin">
                  <SignInForm loading={loading} onSubmit={signIn} />
                </TabsContent>
                <TabsContent value="signup">
                  <SignUpWithOtp onSignedUp={() => navigate({ to: "/onboarding" })} />
                </TabsContent>
              </Tabs>
              <p className="mt-6 text-center text-xs text-muted-foreground">
                Manage your organisation with confidence.
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

function SignInForm({
  onSubmit,
  loading,
}: {
  onSubmit: (email: string, pw: string) => Promise<void>;
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
        {loading ? "…" : "Sign in"}
      </Button>
    </form>
  );
}

function SignUpWithOtp({ onSignedUp }: { onSignedUp: () => void }) {
  const [step, setStep] = useState<"details" | "otp">("details");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);

  const sendOtp = useServerFn(sendOwnerSignupOtp);
  const verifyOtp = useServerFn(verifyOwnerSignupOtp);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const res = await sendOtp({ data: { email: email.trim() } });
      setDevCode(res.dev_code ?? null);
      setStep("otp");
      toast.success(res.sent ? "Verification code sent to your email" : "Code generated (email pending)");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to send code");
    } finally {
      setLoading(false);
    }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await verifyOtp({ data: { email: email.trim().toLowerCase(), otp, password } });
      // Sign in with the freshly-created account.
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) throw error;
      toast.success("Organisation account created");
      onSignedUp();
    } catch (err: any) {
      toast.error(err?.message ?? "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setLoading(true);
    try {
      const res = await sendOtp({ data: { email: email.trim() } });
      setDevCode(res.dev_code ?? null);
      toast.success(res.sent ? "New code sent" : "New code generated");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to resend");
    } finally {
      setLoading(false);
    }
  }

  if (step === "details") {
    return (
      <form onSubmit={requestCode} className="mt-4 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="su-email">Business email</Label>
          <Input
            id="su-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-panel border-panel-border"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="su-pw">Password</Label>
          <Input
            id="su-pw"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-panel border-panel-border"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="su-pw2">Confirm password</Label>
          <Input
            id="su-pw2"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="bg-panel border-panel-border"
          />
          {confirmPassword && password !== confirmPassword ? (
            <p className="text-xs text-rose">Passwords do not match</p>
          ) : null}
        </div>
        <Button disabled={loading} type="submit" className="w-full bg-white text-slate-900 hover:bg-white/90">
          {loading ? "Sending code…" : "Send verification code"}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={confirm} className="mt-4 space-y-4">
      <p className="text-sm text-muted-foreground">
        We emailed a 6-digit code to <span className="font-mono text-foreground">{email}</span>. It expires in 10 minutes.
      </p>
      {devCode ? (
        <div className="rounded-lg border border-panel-border bg-panel p-3 text-xs text-muted-foreground">
          Email delivery pending — use this code: <span className="font-mono text-foreground">{devCode}</span>
        </div>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="otp">Verification code</Label>
        <Input
          id="otp"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
          className="bg-panel border-panel-border font-mono tracking-[0.4em] text-center text-lg"
        />
      </div>
      <Button disabled={loading || otp.length !== 6} type="submit" className="w-full bg-white text-slate-900 hover:bg-white/90">
        {loading ? "Verifying…" : "Verify & create account"}
      </Button>
      <div className="flex items-center justify-between text-xs">
        <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setStep("details")}>
          ← Change details
        </button>
        <button type="button" className="text-cyan hover:underline disabled:opacity-50" disabled={loading} onClick={resend}>
          Resend code
        </button>
      </div>
    </form>
  );
}
