import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AuroraBackground, GlassPanel } from "@/components/glass";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { studentEmailFromMobile } from "@/lib/student-utils";
import { toast } from "sonner";

// HIDDEN SUFFIX: Must exactly match the suffix in students.functions.ts
const PIN_SUFFIX = "_Lx!9aZ*qW2#vP7$Lex26";

export const Route = createFileRoute("/student-login")({
  component: StudentLogin,
});

function StudentLogin() {
  const navigate = useNavigate();
  const [mobile, setMobile] = useState("");
  const [credential, setCredential] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const email = studentEmailFromMobile(mobile);

    // Attempt 1: Try with the new secure suffix
    let { error } = await supabase.auth.signInWithPassword({
      email,
      password: credential + PIN_SUFFIX,
    });

    // Attempt 2: If it fails, try WITHOUT the suffix (for older legacy students)
    if (error) {
      const legacyAttempt = await supabase.auth.signInWithPassword({
        email,
        password: credential,
      });
      error = legacyAttempt.error;
    }

    setLoading(false);
    if (error) {
      toast.error("Wrong mobile or PIN/DOB");
      return;
    }
    toast.success("Signed in");
    navigate({ to: "/dispatch" });
  }

  return (
    <div className="relative min-h-screen text-foreground">
      <AuroraBackground />
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-6 flex items-center justify-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-violet to-cyan font-black">
              L
            </div>
            <span className="text-lg font-extrabold tracking-tight">LibraryBandhu</span>
          </Link>
          <GlassPanel className="p-6">
            <h1 className="text-xl font-bold">Student sign in</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              First-time? Use your <span className="font-mono">DOB (DDMMYY)</span>. Otherwise use your 6-digit PIN.
            </p>
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="m">Mobile number</Label>
                <Input
                  id="m"
                  required
                  inputMode="numeric"
                  pattern="[0-9]{10}"
                  maxLength={10}
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
                  className="bg-panel border-panel-border font-mono"
                  placeholder="10-digit mobile"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="c">PIN or DOB (DDMMYY)</Label>
                <Input
                  id="c"
                  type="password"
                  required
                  inputMode="numeric"
                  minLength={6}
                  maxLength={6}
                  value={credential}
                  onChange={(e) => setCredential(e.target.value.replace(/\D/g, ""))}
                  className="bg-panel border-panel-border font-mono tracking-widest"
                  placeholder="6 digits"
                />
              </div>
              <Button disabled={loading} className="w-full bg-white text-slate-900 hover:bg-white/90">
                {loading ? "…" : "Sign in"}
              </Button>
            </form>
            <div className="mt-4 text-center">
              <Link to="/forgot-pin" className="text-xs text-violet hover:underline">
                Forgot PIN?
              </Link>
            </div>
            <p className="mt-6 text-center text-xs text-muted-foreground">
              New here? Ask your library owner to add you as a student.
            </p>
          </GlassPanel>
        </div>
      </div>
    </div>
  );
}
