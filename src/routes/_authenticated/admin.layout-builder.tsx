import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { useLibraries } from "@/lib/data";
import { GlassPanel, SectionHeader } from "@/components/glass";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, DoorOpen, Droplets, Waves, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/layout-builder")({
  component: LayoutBuilderPage,
});

type Cell =
  | { kind: "seat"; id: string; seat_number: string; facing: "north" | "south" | "east" | "west"; is_corner: boolean; occupied?: boolean; alloc?: any }
  | { kind: "object"; id: string; object_type: string }
  | { kind: "empty" };

const DIR_ICON = { north: ArrowUp, south: ArrowDown, east: ArrowRight, west: ArrowLeft };
const OBJ_META: Record<string, { icon: any; label: string; color: string }> = {
  aisle: { icon: null, label: "Aisle", color: "bg-transparent" },
  entry_gate: { icon: DoorOpen, label: "Entry", color: "bg-slate-800/60 text-slate-300" },
  washroom: { icon: Waves, label: "W/C", color: "bg-magenta/10 text-magenta border-magenta/30" },
  water_cooler: { icon: Droplets, label: "H₂O", color: "bg-cyan/10 text-cyan border-cyan/30" },
  reception: { icon: null, label: "Rcpt", color: "bg-panel-strong text-muted-foreground" },
};

function LayoutBuilderPage() {
  const { data: session } = useSession();
  const orgId = session?.orgId;
  const { data: libs } = useLibraries();
  const [libraryId, setLibraryId] = useState<string | undefined>();
  const [sectionId, setSectionId] = useState<string | undefined>();
  const [selectedSeat, setSelectedSeat] = useState<string | null>(null);
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [addSeatOpen, setAddSeatOpen] = useState(false);
  const [addSeatPos, setAddSeatPos] = useState<{ row: number; col: number } | null>(null);
  const qc = useQueryClient();

  // Auto-pick first library / section
  const currentLibId = libraryId ?? libs?.[0]?.id;

  const sectionsQ = useQuery({
    queryKey: ["sections", currentLibId],
    enabled: !!currentLibId,
    queryFn: async () => {
      const { data } = await supabase.from("sections").select("*").eq("library_id", currentLibId!).order("created_at");
      return data ?? [];
    },
  });
  const currentSectionId = sectionId ?? sectionsQ.data?.[0]?.id;
  const currentSection = sectionsQ.data?.find((s: any) => s.id === currentSectionId);

  const seatsQ = useQuery({
    queryKey: ["seats", currentSectionId],
    enabled: !!currentSectionId,
    queryFn: async () => {
      const [seats, objs, allocs] = await Promise.all([
        supabase.from("seats").select("*").eq("section_id", currentSectionId!),
        supabase.from("layout_objects").select("*").eq("section_id", currentSectionId!),
        supabase.from("allocations").select("id, seat_id, student_id, next_due_date, status, monthly_fee, students(full_name, mobile_number), shifts(name)").eq("is_active", true),
      ]);
      return { seats: seats.data ?? [], objs: objs.data ?? [], allocs: allocs.data ?? [] };
    },
  });

  const grid = useMemo(() => {
    if (!currentSection) return null;
    const rows = currentSection.grid_rows;
    const cols = currentSection.grid_cols;
    const g: Cell[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ kind: "empty" } as Cell)));
    for (const s of seatsQ.data?.seats ?? []) {
      const alloc = (seatsQ.data?.allocs ?? []).find((a: any) => a.seat_id === s.id);
      g[s.row_position]?.[s.column_position] && (g[s.row_position][s.column_position] = {
        kind: "seat", id: s.id, seat_number: s.seat_number, facing: s.facing_direction, is_corner: s.is_corner,
        occupied: !!alloc, alloc,
      });
    }
    for (const o of seatsQ.data?.objs ?? []) {
      g[o.row_position]?.[o.column_position] && (g[o.row_position][o.column_position] = { kind: "object", id: o.id, object_type: o.object_type });
    }
    return g;
  }, [currentSection, seatsQ.data]);

  const selectedSeatObj = useMemo(() => {
    if (!selectedSeat || !seatsQ.data) return null;
    const s = seatsQ.data.seats.find((x: any) => x.id === selectedSeat);
    if (!s) return null;
    const a = seatsQ.data.allocs.find((x: any) => x.seat_id === s.id);
    return { seat: s, alloc: a };
  }, [selectedSeat, seatsQ.data]);

  async function handleCellClick(row: number, col: number) {
    if (!grid) return;
    const cell = grid[row][col];
    if (cell.kind === "seat") { setSelectedSeat(cell.id); return; }
    if (cell.kind === "object") return;
    setAddSeatPos({ row, col });
    setAddSeatOpen(true);
  }

  const deleteObject = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("layout_objects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["seats", currentSectionId] }),
  });

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Layout builder"
        hint="Click empty cells to place seats or objects. Click a seat to inspect."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={currentLibId ?? ""} onValueChange={(v) => { setLibraryId(v); setSectionId(undefined); setSelectedSeat(null); }}>
              <SelectTrigger className="w-52 bg-panel border-panel-border"><SelectValue placeholder="Branch" /></SelectTrigger>
              <SelectContent>{(libs ?? []).map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={currentSectionId ?? ""} onValueChange={(v) => { setSectionId(v); setSelectedSeat(null); }}>
              <SelectTrigger className="w-52 bg-panel border-panel-border"><SelectValue placeholder="Section" /></SelectTrigger>
              <SelectContent>{(sectionsQ.data ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
            <AddSectionDialog
              open={addSectionOpen}
              onOpenChange={setAddSectionOpen}
              libraryId={currentLibId}
              orgId={orgId}
              onCreated={(id) => { qc.invalidateQueries({ queryKey: ["sections", currentLibId] }); setSectionId(id); }}
            />
          </div>
        }
      />

      {!libs?.length ? (
        <GlassPanel className="p-10 text-center">
          <p className="text-sm text-muted-foreground">Create a branch first in <span className="text-foreground">Settings</span>.</p>
        </GlassPanel>
      ) : !currentSectionId ? (
        <GlassPanel className="p-10 text-center">
          <p className="text-sm text-muted-foreground">No sections yet.</p>
          <Button onClick={() => setAddSectionOpen(true)} className="mt-4 bg-white text-slate-900 hover:bg-white/90"><Plus className="mr-1 size-4" /> New section</Button>
        </GlassPanel>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <GlassPanel className="p-4">
            <div className="mb-3 flex items-center justify-between px-2">
              <div>
                <div className="text-sm font-bold">{currentSection?.name}</div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {currentSection?.grid_rows} × {currentSection?.grid_cols} · {seatsQ.data?.seats.length ?? 0} seats · {seatsQ.data?.allocs.filter((a: any) => (seatsQ.data?.seats ?? []).some((s: any) => s.id === a.seat_id)).length ?? 0} occupied
                </div>
              </div>
              <BulkSeatDialog sectionId={currentSectionId} orgId={orgId!} libraryId={currentLibId!} onDone={() => qc.invalidateQueries({ queryKey: ["seats", currentSectionId] })} />
            </div>
            <div className="max-h-[70vh] overflow-auto rounded-lg bg-black/30 p-4 ring-1 ring-panel-border">
              {grid && (
                <div className="mx-auto grid gap-1.5" style={{ gridTemplateColumns: `repeat(${currentSection?.grid_cols ?? 15}, minmax(0, 1fr))`, maxWidth: "min(100%, 900px)" }}>
                  {grid.map((row, r) => row.map((cell, c) => (
                    <CellView key={`${r}-${c}`} row={r} col={c} cell={cell} onClick={() => handleCellClick(r, c)} onDeleteObject={(id) => deleteObject.mutate(id)} />
                  )))}
                </div>
              )}
            </div>
          </GlassPanel>

          <InspectorPanel
            selected={selectedSeatObj}
            onDelete={async () => {
              if (!selectedSeatObj) return;
              const { error } = await supabase.from("seats").delete().eq("id", selectedSeatObj.seat.id);
              if (error) { toast.error(error.message); return; }
              toast.success("Seat removed");
              setSelectedSeat(null);
              qc.invalidateQueries({ queryKey: ["seats", currentSectionId] });
            }}
          />
        </div>
      )}

      <AddSeatDialog
        open={addSeatOpen} onOpenChange={setAddSeatOpen}
        pos={addSeatPos}
        section={currentSection}
        orgId={orgId!} libraryId={currentLibId!}
        onDone={() => qc.invalidateQueries({ queryKey: ["seats", currentSectionId] })}
      />
    </div>
  );
}

function CellView({ row, col, cell, onClick, onDeleteObject }: { row: number; col: number; cell: Cell; onClick: () => void; onDeleteObject: (id: string) => void }) {
  if (cell.kind === "seat") {
    const Icon = DIR_ICON[cell.facing];
    const occ = cell.occupied;
    return (
      <button
        onClick={onClick}
        title={`Seat ${cell.seat_number}${occ ? " · occupied" : " · vacant"}`}
        className={cn(
          "group flex aspect-square min-w-0 flex-col items-center justify-center rounded border text-[9px] font-mono transition-all hover:scale-[1.06]",
          cell.is_corner
            ? "border-2 border-gold/60 bg-gold/10 text-gold glow-gold"
            : occ
              ? "border border-rose/30 bg-rose/15 text-rose"
              : "border border-panel-border bg-panel text-muted-foreground hover:border-cyan/40 hover:text-cyan",
        )}
      >
        <Icon className="mb-0.5 size-2.5 opacity-70" />
        <span className="truncate">{cell.seat_number}</span>
      </button>
    );
  }
  if (cell.kind === "object") {
    const meta = OBJ_META[cell.object_type] ?? OBJ_META.reception;
    const Icon = meta.icon;
    return (
      <button
        onClick={() => onDeleteObject(cell.id)}
        title={`${meta.label} (click to remove)`}
        className={cn("flex aspect-square min-w-0 flex-col items-center justify-center rounded border text-[8px] font-mono", meta.color)}
      >
        {Icon && <Icon className="size-3" />}
        <span className="mt-0.5 truncate">{meta.label}</span>
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      title={`Row ${row + 1}, Col ${col + 1}`}
      className="aspect-square min-w-0 rounded border border-panel-border/30 bg-white/[0.02] transition-colors hover:border-panel-border hover:bg-panel"
    />
  );
}

function InspectorPanel({ selected, onDelete }: { selected: any; onDelete: () => void }) {
  if (!selected) {
    return (
      <GlassPanel className="p-5">
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Inspector</div>
        <p className="mt-4 text-sm text-muted-foreground">Click a seat to see details, or click an empty cell to add.</p>
        <div className="mt-6 space-y-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2"><span className="inline-block size-3 rounded border-2 border-gold/60 bg-gold/10" /> Corner (premium)</div>
          <div className="flex items-center gap-2"><span className="inline-block size-3 rounded border border-rose/30 bg-rose/15" /> Occupied</div>
          <div className="flex items-center gap-2"><span className="inline-block size-3 rounded border border-panel-border bg-panel" /> Vacant</div>
        </div>
      </GlassPanel>
    );
  }
  const s = selected.seat;
  const a = selected.alloc;
  return (
    <GlassPanel className="p-5">
      <div className="font-mono text-[10px] uppercase tracking-widest text-cyan">Selected seat</div>
      <div className="mt-1 text-2xl font-extrabold">{s.seat_number}</div>
      <div className="mt-1 text-xs text-muted-foreground">Row {s.row_position + 1} · Col {s.column_position + 1} · Facing {s.facing_direction}{s.is_corner ? " · Corner" : ""}</div>
      {a ? (
        <div className="mt-5 space-y-3">
          <InfoRow label="Student" value={a.students?.full_name ?? "—"} />
          <InfoRow label="Mobile" value={a.students?.mobile_number ?? "—"} mono />
          <InfoRow label="Shift" value={a.shifts?.name ?? "Full day"} />
          <InfoRow label="Fee / month" value={`₹${a.monthly_fee}`} mono />
          <InfoRow label="Next due" value={a.next_due_date} mono />
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">Vacant seat.</p>
      )}
      <button onClick={onDelete} className="mt-6 w-full rounded-md border border-panel-border py-2 text-xs text-muted-foreground hover:bg-panel">Remove seat</button>
    </GlassPanel>
  );
}
function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg bg-panel p-3">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 text-sm", mono && "font-mono")}>{value}</div>
    </div>
  );
}

function AddSectionDialog({ open, onOpenChange, libraryId, orgId, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; libraryId?: string; orgId?: string | null; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [rows, setRows] = useState(15);
  const [cols, setCols] = useState(15);
  const [hasShifts, setHasShifts] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild><Button variant="outline" size="sm" className="border-panel-border bg-panel"><Plus className="mr-1 size-4" /> Section</Button></DialogTrigger>
      <DialogContent className="glass-strong border-panel-border">
        <DialogHeader><DialogTitle>New section</DialogTitle></DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!libraryId || !orgId) return;
            const { data, error } = await supabase.from("sections").insert({
              library_id: libraryId, org_id: orgId, name, grid_rows: rows, grid_cols: cols, has_shifts: hasShifts, is_premium_section: isPremium,
            }).select("id").single();
            if (error) { toast.error(error.message); return; }
            toast.success("Section created");
            onCreated(data.id);
            onOpenChange(false);
            setName("");
          }}
          className="space-y-4"
        >
          <div className="space-y-2"><Label>Name</Label><Input required value={name} onChange={(e) => setName(e.target.value)} className="bg-panel border-panel-border" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Grid rows</Label><Input type="number" min={5} max={30} value={rows} onChange={(e) => setRows(Number(e.target.value))} className="bg-panel border-panel-border" /></div>
            <div className="space-y-2"><Label>Grid cols</Label><Input type="number" min={5} max={30} value={cols} onChange={(e) => setCols(Number(e.target.value))} className="bg-panel border-panel-border" /></div>
          </div>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={hasShifts} onChange={(e) => setHasShifts(e.target.checked)} /> Has shifts</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={isPremium} onChange={(e) => setIsPremium(e.target.checked)} /> Premium</label>
          </div>
          <Button type="submit" className="w-full bg-white text-slate-900 hover:bg-white/90">Create section</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddSeatDialog({ open, onOpenChange, pos, section, orgId, libraryId, onDone }: any) {
  const [mode, setMode] = useState<"seat" | "object">("seat");
  const [seatNumber, setSeatNumber] = useState("");
  const [facing, setFacing] = useState<"north" | "south" | "east" | "west">("north");
  const [isCorner, setIsCorner] = useState(false);
  const [objectType, setObjectType] = useState("aisle");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong border-panel-border">
        <DialogHeader><DialogTitle>Place at Row {pos?.row + 1}, Col {pos?.col + 1}</DialogTitle></DialogHeader>
        <div className="flex gap-2">
          <Button size="sm" variant={mode === "seat" ? "default" : "outline"} onClick={() => setMode("seat")} className={cn(mode === "seat" && "bg-white text-slate-900")}>Seat</Button>
          <Button size="sm" variant={mode === "object" ? "default" : "outline"} onClick={() => setMode("object")} className={cn(mode === "object" && "bg-white text-slate-900")}>Object</Button>
        </div>
        {mode === "seat" ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!pos || !section) return;
              const { error } = await supabase.from("seats").insert({
                section_id: section.id, library_id: libraryId, org_id: orgId,
                seat_number: seatNumber, row_position: pos.row, column_position: pos.col,
                facing_direction: facing, is_corner: isCorner,
              });
              if (error) { toast.error(error.message); return; }
              toast.success("Seat added");
              onOpenChange(false); onDone(); setSeatNumber("");
            }}
            className="space-y-3"
          >
            <div className="space-y-2"><Label>Seat number</Label><Input required autoFocus value={seatNumber} onChange={(e) => setSeatNumber(e.target.value)} className="bg-panel border-panel-border font-mono" placeholder="A01" /></div>
            <div className="space-y-2">
              <Label>Facing</Label>
              <Select value={facing} onValueChange={(v: any) => setFacing(v)}>
                <SelectTrigger className="bg-panel border-panel-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="north">North ↑</SelectItem>
                  <SelectItem value="south">South ↓</SelectItem>
                  <SelectItem value="east">East →</SelectItem>
                  <SelectItem value="west">West ←</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isCorner} onChange={(e) => setIsCorner(e.target.checked)} /> Corner seat (premium)</label>
            <Button type="submit" className="w-full bg-white text-slate-900 hover:bg-white/90">Add seat</Button>
          </form>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!pos || !section) return;
              const { error } = await supabase.from("layout_objects").insert({
                section_id: section.id, org_id: orgId, object_type: objectType, row_position: pos.row, column_position: pos.col,
              });
              if (error) { toast.error(error.message); return; }
              toast.success("Object placed");
              onOpenChange(false); onDone();
            }}
            className="space-y-3"
          >
            <div className="space-y-2">
              <Label>Object type</Label>
              <Select value={objectType} onValueChange={setObjectType}>
                <SelectTrigger className="bg-panel border-panel-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aisle">Aisle</SelectItem>
                  <SelectItem value="entry_gate">Entry gate</SelectItem>
                  <SelectItem value="washroom">Washroom</SelectItem>
                  <SelectItem value="water_cooler">Water cooler</SelectItem>
                  <SelectItem value="reception">Reception</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full bg-white text-slate-900 hover:bg-white/90">Place</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function BulkSeatDialog({ sectionId, orgId, libraryId, onDone }: { sectionId: string; orgId: string; libraryId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [prefix, setPrefix] = useState("A");
  const [start, setStart] = useState(1);
  const [end, setEnd] = useState(20);
  const [startRow, setStartRow] = useState(0);
  const [startCol, setStartCol] = useState(0);
  const [perRow, setPerRow] = useState(10);
  const [facing, setFacing] = useState<"north" | "south" | "east" | "west">("north");
  const [loading, setLoading] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline" className="border-panel-border bg-panel">Bulk generate</Button></DialogTrigger>
      <DialogContent className="glass-strong border-panel-border">
        <DialogHeader><DialogTitle>Bulk generate seats</DialogTitle></DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            const rows: any[] = [];
            for (let n = start, i = 0; n <= end; n++, i++) {
              const r = startRow + Math.floor(i / perRow);
              const c = startCol + (i % perRow);
              rows.push({
                section_id: sectionId, library_id: libraryId, org_id: orgId,
                seat_number: `${prefix}${String(n).padStart(2, "0")}`,
                row_position: r, column_position: c,
                facing_direction: facing, is_corner: false,
              });
            }
            const { error } = await supabase.from("seats").insert(rows);
            setLoading(false);
            if (error) { toast.error(error.message); return; }
            toast.success(`${rows.length} seats generated`);
            setOpen(false); onDone();
          }}
          className="grid grid-cols-2 gap-3"
        >
          <div className="col-span-2 space-y-2"><Label>Prefix</Label><Input required value={prefix} onChange={(e) => setPrefix(e.target.value)} className="bg-panel border-panel-border" /></div>
          <div className="space-y-2"><Label>Start #</Label><Input type="number" min={1} value={start} onChange={(e) => setStart(Number(e.target.value))} className="bg-panel border-panel-border" /></div>
          <div className="space-y-2"><Label>End #</Label><Input type="number" min={1} value={end} onChange={(e) => setEnd(Number(e.target.value))} className="bg-panel border-panel-border" /></div>
          <div className="space-y-2"><Label>Start row</Label><Input type="number" min={0} value={startRow} onChange={(e) => setStartRow(Number(e.target.value))} className="bg-panel border-panel-border" /></div>
          <div className="space-y-2"><Label>Start col</Label><Input type="number" min={0} value={startCol} onChange={(e) => setStartCol(Number(e.target.value))} className="bg-panel border-panel-border" /></div>
          <div className="space-y-2"><Label>Seats per row</Label><Input type="number" min={1} value={perRow} onChange={(e) => setPerRow(Number(e.target.value))} className="bg-panel border-panel-border" /></div>
          <div className="space-y-2">
            <Label>Facing</Label>
            <Select value={facing} onValueChange={(v: any) => setFacing(v)}>
              <SelectTrigger className="bg-panel border-panel-border"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="north">North</SelectItem>
                <SelectItem value="south">South</SelectItem>
                <SelectItem value="east">East</SelectItem>
                <SelectItem value="west">West</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2"><Button disabled={loading} type="submit" className="w-full bg-white text-slate-900 hover:bg-white/90">{loading ? "Generating…" : "Generate"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
