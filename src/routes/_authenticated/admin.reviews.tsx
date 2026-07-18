import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLibraries } from "@/lib/data";
import { GlassPanel, SectionHeader, Kpi } from "@/components/glass";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtDate } from "@/lib/format";
import { Star, MessageSquare } from "lucide-react";
import { StarRating, StarBar } from "@/components/RatingStars";

export const Route = createFileRoute("/_authenticated/admin/reviews")({
  component: ReviewsPage,
  errorComponent: ({ error }) => <div className="p-6 text-rose">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">Not found</div>,
});

function ReviewsPage() {
  const { data: libs } = useLibraries();
  const [libraryId, setLibraryId] = useState<string>("all");

  const libIds = useMemo(() => (libs ?? []).map((l) => l.id), [libs]);
  const targetIds = libraryId === "all" ? libIds : [libraryId];

  const reviews = useQuery({
    queryKey: ["admin-reviews", targetIds],
    enabled: targetIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("library_ratings")
        .select(
          "id, library_id, student_id, param_peace, param_comfort, param_internet, param_hygiene, param_amenities, overall_rating, review_text, is_anonymous, created_at, students(full_name), libraries(name)",
        )
        .in("library_id", targetIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const list = reviews.data ?? [];
  const total = list.length;
  const avg =
    total > 0
      ? Math.round((list.reduce((a: number, r: any) => a + Number(r.overall_rating || 0), 0) / total) * 10) / 10
      : 0;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <SectionHeader
        title="Student Reviews"
        hint="Feedback from your students across all 5 experience parameters."
        right={
          <Select value={libraryId} onValueChange={setLibraryId}>
            <SelectTrigger className="w-[220px] bg-panel border-panel-border">
              <SelectValue placeholder="All Branches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {(libs ?? []).map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Kpi label="Average Rating" value={total > 0 ? `${avg.toFixed(1)} ★` : "—"} tone="gold" />
        <Kpi label="Total Reviews" value={String(total)} tone="cyan" />
        <Kpi
          label="With Written Feedback"
          value={String(list.filter((r: any) => r.review_text?.trim()).length)}
          tone="violet"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {list.map((r: any) => {
          const name = r.is_anonymous ? "Anonymous Student" : r.students?.full_name ?? "Student";
          return (
            <GlassPanel key={r.id} className="p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {r.libraries?.name} · {fmtDate(r.created_at)}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-sm font-bold text-gold shrink-0">
                  <Star className="size-3.5 fill-gold" />
                  {Number(r.overall_rating).toFixed(1)}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 pt-1">
                <StarBar label="Peace" value={r.param_peace} />
                <StarBar label="Comfort" value={r.param_comfort} />
                <StarBar label="Internet" value={r.param_internet} />
                <StarBar label="Hygiene" value={r.param_hygiene} />
                <StarBar label="Amenities" value={r.param_amenities} />
              </div>

              {r.review_text && (
                <div className="mt-2 rounded-lg border border-panel-border bg-panel p-3">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                    <MessageSquare className="size-3" /> Feedback
                  </div>
                  <p className="text-sm text-slate-200 whitespace-pre-wrap">{r.review_text}</p>
                </div>
              )}
            </GlassPanel>
          );
        })}
        {reviews.isSuccess && list.length === 0 && (
          <GlassPanel className="p-8 text-center md:col-span-2">
            <Star className="size-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No reviews yet for this selection.</p>
          </GlassPanel>
        )}
      </div>

      {/* Legend usage of StarRating to satisfy import for future filters */}
      <div className="hidden">
        <StarRating value={0} readOnly />
      </div>
    </div>
  );
}
