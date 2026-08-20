import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { STATUS_META, type OccupantInfo } from "@/lib/layout-types";

export function SeatOccupancyDialog({
  open,
  onOpenChange,
  seatNumber,
  occupants,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  seatNumber: string | null;
  occupants: OccupantInfo[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong border-panel-border max-w-md">
        <DialogHeader>
          <DialogTitle>Seat {seatNumber}</DialogTitle>
        </DialogHeader>
        {!occupants.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">This seat is vacant.</p>
        ) : (
          <div className="space-y-3">
            {occupants.map((o) => (
              <div key={o.allocationId} className="rounded-lg border border-panel-border bg-panel p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{o.name}</div>
                    <div className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {o.shift ?? "Full day"}
                    </div>
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5 rounded px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <span className={cn("size-2 rounded-full", STATUS_META[o.status].dot)} />
                    {STATUS_META[o.status].label}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>
                    Fee <span className="font-medium text-foreground">₹{Number(o.fee ?? 0).toLocaleString("en-IN")}</span>
                  </div>
                  <div>
                    Due <span className="font-medium text-foreground">{o.dueDate ?? "—"}</span>
                  </div>
                </div>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground">
              Seat assignments and payments are managed from the Allocations screen.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
