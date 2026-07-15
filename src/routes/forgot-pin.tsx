import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AuroraBackground, GlassPanel } from "@/components/glass";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { requestPinReset, verifyPinReset } from "@/lib/students.functions";
import { KeyRound, Mail } from "lucide-react";

export const Route = createFileRoute("/forgot-pin")({
  component: ForgotPinPage,
});

function ForgotPinPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "verify">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);

  const startFn = useServerFn(requestPinReset);
  const verifyFn = useServerFn(verifyPinReset);

  const start = useMutation({
    mutationFn: async () => startFn({ data: { email } }),
    onSuccess: (res) => {
      toast.success("If that email is registered, a 6-digit code has been sent.");
      setDevCode(res.dev_code);
      setStep("verify");
    },
    onError: (e: any) => toast.error(e.message ?? "Unable to start reset"),
  });

  const verify = useMutation({
    mutationFn: async () => {
      if (pin !== confirm) throw new Error("PINs don't match");
      return verifyFn({ data: { email, code, new_pin: pin } });
    },
    onSuccess: () => {
      toast.success("PIN updated. Please sign in.");
      navigate({ to: "/student-login" });
    },
    onError: (e: any) => toast.error(e.message ?? "Verification failed"),
  });

  return (
    <div className="relative min-h-screen text-foreground">
      <AuroraBackground />
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-6 flex items-center justify-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-violet to-cyan font-black">L</div>
            <span className="text-lg font-extrabold tracking-tight">LEXICON</span>
          </Link>
          <GlassPanel className="p-6">
            <div className="mb-4 inline-flex size-10 items-center justify-center rounded-lg bg-violet/15 text-violet"><KeyRound className="size-5" /></div>
            <h1 className="text-xl font-bold">Reset your PIN</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {step === "email"
                ? "Enter the email you registered with your library. We'll send a 6-digit verification code."
                : "Enter the 6-digit code and choose a new PIN."}
            </p>

            {step === "email" ? (
              <form className="mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); start.mutate(); }}>
                <div className="space-y-2">
                  <Label htmlFor="email">Registered email</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="bg-panel border-panel-border pl-9" placeholder="you@example.com" />
                  </div>
                </div>
                <Button disabled={start.isPending} className="w-full bg-white text-slate-900 hover:bg-white/90">
                  {start.isPending ? "Sending…" : "Send verification code"}
                </Button>
              </form>
            ) : (
              <form className="mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); verify.mutate(); }}>
                {devCode && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                    <span className="font-semibold">Dev preview code:</span> <span className="font-mono">{devCode}</span> — hook up Lovable Emails to send this by mail.
                  </div>
                )}
                <div className="space-y-2">
                  <Label>6-digit code</Label>
                  <Input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="bg-panel border-panel-border font-mono tracking-widest" />
                </div>
                <div className="space-y-2">
                  <Label>New 6-digit PIN</Label>
                  <Input required type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} minLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} className="bg-panel border-panel-border font-mono tracking-widest" />
                </div>
                <div className="space-y-2">
                  <Label>Confirm PIN</Label>
                  <Input required type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))} className="bg-panel border-panel-border font-mono tracking-widest" />
                </div>
                <Button disabled={verify.isPending} className="w-full bg-white text-slate-900 hover:bg-white/90">
                  {verify.isPending ? "Verifying…" : "Reset PIN"}
                </Button>
                <button type="button" onClick={() => { setStep("email"); setCode(""); setPin(""); setConfirm(""); }} className="w-full text-center text-xs text-muted-foreground hover:text-foreground">
                  ← Use a different email
                </button>
              </form>
            )}

            <p className="mt-6 text-center text-xs text-muted-foreground">
              <Link to="/student-login" className="text-violet hover:underline">Back to sign in</Link>
            </p>
          </GlassPanel>
        </div>
      </div>
    </div>
  );
}
