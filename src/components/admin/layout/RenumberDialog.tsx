import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { orderCells, type LayoutAction, type SeatOrder } from "@/lib/layout-history";
import { renumberSeats, type SeatRow } from "@/lib/layout-ops";

export function RenumberDialog({
  open,
  onOpenChange,
  cells,
  allSeats,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cells: { r: number; c: number }[];
  allSeats: SeatRow[];
  onDone: (action: LayoutAction) => void;
}) {
  const [prefix, setPrefix] = useState("A");
  const [start, setStart] = useState(1);
  const [pad, setPad] = useState(2);
  const [order, setOrder] = useState<SeatOrder>("rows_ltr");
  const [descending, setDescending] = useState(false);
  const [loading, setLoading] = useState(false);

  const selectedSeats = useMemo(() => {
    const keys = new Set(cells.map((c) => `${c.r}:${c.c}`));
    return allSeats.filter((s) => keys.has(`${s.row_position}:${s.column_position}`));
  }, [cells, allSeats]);

  const preview = useMemo(() => {
    const ordered = orderCells(
      selectedSeats.map((s) => ({ r: s.row_position, c: s.column_position, seat: s })),
      order,
      descending,
    );
    return ordered.slice(0, 4).map((o, i) => `${(o as any).seat.seat_number} → ${prefix}${String(start + i).padStart(pad, "0")}`);
  }, [selectedSeats, order, descending, prefix, start, pad]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong border-panel-border">
        <DialogHeader>
          <DialogTitle>Renumber {selectedSeats.length} seat(s)</DialogTitle>
        </DialogHeader>
        {selectedSeats.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No seats in your selection.</p>
        ) : (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setLoading(true);
              try {
                const action = await renumberSeats({
                  seats: selectedSeats,
                  order,
                  descending,
                  prefix,
                  start,
                  pad,
                  allSeats,
                });
                toast.success(`Renumbered ${selectedSeats.length} seat(s)`);
                onOpenChange(false);
                onDone(action);
              } catch (err: any) {
                toast.error(err?.message ?? "Could not renumber");
              } finally {
                setLoading(false);
              }
            }}
          >
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Prefix</Label>
                <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} className="bg-panel border-panel-border" />
              </div>
              <div className="space-y-2">
                <Label>Start #</Label>
                <Input
                  type="number"
                  min={0}
                  value={start}
                  onChange={(e) => setStart(Number(e.target.value))}
                  className="bg-panel border-panel-border"
                />
              </div>
              <div className="space-y-2">
                <Label>Digits</Label>
                <Input
                  type="number"
                  min={1}
                  max={4}
                  value={pad}
                  onChange={(e) => setPad(Number(e.target.value))}
                  className="bg-panel border-panel-border"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Order</Label>
              <Select value={order} onValueChange={(v: any) => setOrder(v)}>
                <SelectTrigger className="bg-panel border-panel-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rows_ltr">Row by row · left → right</SelectItem>
                  <SelectItem value="rows_rtl">Row by row · right → left</SelectItem>
                  <SelectItem value="cols_ttb">Column by column · top → bottom</SelectItem>
                  <SelectItem value="cols_btt">Column by column · bottom → top</SelectItem>
                </SelectContent>
              </Select>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={descending} onChange={(e) => setDescending(e.target.checked)} /> Reverse
                order
              </label>
            </div>
            <div className="rounded-lg border border-panel-border bg-panel p-3 font-mono text-[11px] text-muted-foreground">
              {preview.join(" · ")}
              {selectedSeats.length > 4 && " …"}
            </div>
            <Button disabled={loading} type="submit" className="w-full bg-white text-slate-900 hover:bg-white/90">
              {loading ? "Renumbering…" : "Apply numbering"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
