import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { duplicateSection } from "@/lib/layout-ops";

export function DuplicateSectionDialog({
  open,
  onOpenChange,
  section,
  orgId,
  libraries,
  currentLibraryId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  section: any;
  orgId: string;
  libraries: { id: string; name: string }[];
  currentLibraryId: string;
  onCreated: (id: string, libraryId: string) => void;
}) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState(currentLibraryId);
  const [includeSeats, setIncludeSeats] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setName(`${section?.name ?? "Section"} (copy)`);
      setTarget(currentLibraryId);
    }
  }, [open, section?.name, currentLibraryId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong border-panel-border">
        <DialogHeader>
          <DialogTitle>Duplicate section</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!section) return;
            setLoading(true);
            try {
              const id = await duplicateSection({
                section,
                targetLibraryId: target,
                orgId,
                name: name.trim() || `${section.name} (copy)`,
                includeSeats,
              });
              toast.success("Section duplicated");
              onOpenChange(false);
              onCreated(id, target);
            } catch (err: any) {
              toast.error(err?.message ?? "Could not duplicate section");
            } finally {
              setLoading(false);
            }
          }}
        >
          <p className="text-sm text-muted-foreground">
            Copies the grid size, shifts and fees{includeSeats ? ", seats and area cells" : ""}. Student allocations are
            never copied.
          </p>
          <div className="space-y-2">
            <Label>New section name</Label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} className="bg-panel border-panel-border" />
          </div>
          <div className="space-y-2">
            <Label>Create in branch</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger className="bg-panel border-panel-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {libraries.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeSeats} onChange={(e) => setIncludeSeats(e.target.checked)} /> Copy seats
            and area cells
          </label>
          <Button disabled={loading} type="submit" className="w-full bg-white text-slate-900 hover:bg-white/90">
            {loading ? "Duplicating…" : "Duplicate"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
