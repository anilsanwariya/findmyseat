import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { StarRating } from "@/components/RatingStars";
import { toast } from "sonner";
import { Star } from "lucide-react";

const PARAMS = [
  { key: "param_peace", label: "Peace & Quiet" },
  { key: "param_comfort", label: "Seating Comfort" },
  { key: "param_internet", label: "Internet & Power" },
  { key: "param_hygiene", label: "Cleanliness & Hygiene" },
  { key: "param_amenities", label: "Amenities & Lighting" },
] as const;

type ParamKey = (typeof PARAMS)[number]["key"];

export function RateBranchDialog({
  open,
  onOpenChange,
  libraryId,
  libraryName,
  studentId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  libraryId: string;
  libraryName?: string;
  studentId: string;
}) {
  const qc = useQueryClient();
  const [scores, setScores] = useState<Record<ParamKey, number>>({
    param_peace: 0,
    param_comfort: 0,
    param_internet: 0,
    param_hygiene: 0,
    param_amenities: 0,
  });
  const [review, setReview] = useState("");
  const [anon, setAnon] = useState(true);

  const existing = useQuery({
    queryKey: ["my-rating", libraryId, studentId],
    enabled: open && !!libraryId && !!studentId,
    queryFn: async () =>
      (
        await supabase
          .from("library_ratings")
          .select("*")
          .eq("library_id", libraryId)
          .eq("student_id", studentId)
          .maybeSingle()
      ).data,
  });

  useEffect(() => {
    if (existing.data) {
      setScores({
        param_peace: existing.data.param_peace,
        param_comfort: existing.data.param_comfort,
        param_internet: existing.data.param_internet,
        param_hygiene: existing.data.param_hygiene,
        param_amenities: existing.data.param_amenities,
      });
      setReview(existing.data.review_text ?? "");
      setAnon(existing.data.is_anonymous ?? true);
    }
  }, [existing.data]);

  const filled = Object.values(scores).filter((v) => v > 0).length;
  const overall = filled === 5 ? Object.values(scores).reduce((a, b) => a + b, 0) / 5 : 0;

  const save = useMutation({
    mutationFn: async () => {
      const overall_rating = Math.round((Object.values(scores).reduce((a, b) => a + b, 0) / 5) * 100) / 100;
      const payload = {
        library_id: libraryId,
        student_id: studentId,
        ...scores,
        overall_rating,
        review_text: review.trim() || null,
        is_anonymous: anon,
      };
      const { error } = await supabase
        .from("library_ratings")
        .upsert(payload, { onConflict: "library_id,student_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Thanks! Your rating has been saved.");
      qc.invalidateQueries({ queryKey: ["my-rating", libraryId, studentId] });
      qc.invalidateQueries({ queryKey: ["marketplace"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save rating"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong border-panel-border max-w-lg w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="size-4 text-gold fill-gold" /> Rate {libraryName || "your branch"}
          </DialogTitle>
          <DialogDescription>Your honest feedback helps others discover great study spaces.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {PARAMS.map((p) => (
            <div key={p.key} className="flex items-center justify-between gap-3 rounded-lg border border-panel-border bg-panel p-3">
              <span className="text-sm font-medium">{p.label}</span>
              <StarRating
                value={scores[p.key]}
                onChange={(v) => setScores((s) => ({ ...s, [p.key]: v }))}
              />
            </div>
          ))}

          <div className="rounded-lg border border-gold/30 bg-gradient-to-br from-gold/10 to-transparent p-3 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Your overall rating
            </span>
            <span className="text-2xl font-extrabold text-gold">
              {overall > 0 ? overall.toFixed(1) : "—"}
              <span className="text-xs text-muted-foreground ml-1">/ 5</span>
            </span>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">
              Any specific feedback? (optional)
            </Label>
            <Textarea
              value={review}
              onChange={(e) => setReview(e.target.value)}
              placeholder="Share what stood out, or what could be improved..."
              className="bg-panel border-panel-border min-h-[80px]"
              maxLength={1000}
            />
          </div>

          <div className="flex items-start justify-between gap-3 rounded-lg border border-panel-border bg-panel p-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">Post anonymously</div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {anon
                  ? "Your name will be hidden. The owner sees “Anonymous Student”."
                  : "Your full name will be visible to the library owner."}
              </p>
            </div>
            <Switch checked={anon} onCheckedChange={setAnon} />
          </div>

          <Button
            onClick={() => save.mutate()}
            disabled={filled < 5 || save.isPending}
            className="w-full h-11 bg-white text-slate-900 hover:bg-white/90"
          >
            {save.isPending ? "Saving..." : existing.data ? "Update Rating" : "Submit Rating"}
          </Button>
          {filled < 5 && (
            <p className="text-center text-xs text-muted-foreground">Rate all 5 parameters to submit.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
