import { Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { whatsappLink } from "@/lib/dashboard-metrics";

/**
 * A student's starting PIN, shown to the owner once after adding the student or
 * resetting their PIN. The student signs in with it and then sets their own PIN.
 */
export function StartingPinCard({
  name,
  mobile,
  pin,
}: {
  name: string;
  mobile: string;
  pin: string;
}) {
  const loginUrl =
    typeof window !== "undefined" ? `${window.location.origin}/student-login` : "/student-login";
  const message = `Hi ${name}, your LibraryBandhu login:\nMobile: ${mobile}\nStarting PIN: ${pin}\n\nSign in at ${loginUrl} and choose your own PIN.`;
  const wa = whatsappLink(mobile, message);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pin);
      toast.success("PIN copied");
    } catch {
      toast.error("Couldn't copy — please note the PIN down");
    }
  };

  return (
    <div className="rounded-lg border border-cyan/40 bg-cyan/5 p-4">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Starting PIN for {name}
      </div>
      <div className="mt-1 font-mono text-3xl font-bold tracking-[0.3em] text-cyan">{pin}</div>
      <p className="mt-2 text-xs text-muted-foreground">
        Shown only now. Send it to the student; they sign in with their mobile number and this PIN,
        then choose their own.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          className="bg-panel border-panel-border"
          onClick={copy}
        >
          <Copy className="mr-1 size-4" /> Copy PIN
        </Button>
        {wa && (
          <Button asChild className="bg-emerald text-slate-950 hover:bg-emerald/90">
            <a href={wa} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="mr-1 size-4" /> Send on WhatsApp
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
