import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Public marketplace: uses supabaseAdmin to aggregate safe, pre-filtered data.
export const marketplaceSearch = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        query: z.string().trim().max(120).optional().nullable(),
        zone: z.string().trim().max(120).optional().nullable(),
        exam_id: z.string().uuid().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Only include libraries whose owner org is active/trial (not suspended).
    const { data: orgs } = await supabaseAdmin.from("organizations").select("id, subscription_status");
    const activeOrgIds = new Set(
      (orgs ?? []).filter((o: any) => o.subscription_status !== "suspended").map((o: any) => o.id),
    );

    let q = supabaseAdmin
      .from("libraries")
      // Added our new columns to the select query
      .select(
        "id, org_id, name, zone_area, city, address, google_maps_url, opening_hours, shifts, closed_on, amenities, cover_photo_url, description, show_public_availability, targeted_exam_ids, is_active",
      )
      .eq("is_active", true)
      .eq("approval_status", "approved");

    if (data.zone) q = q.ilike("zone_area", `%${data.zone}%`);
    if (data.query) q = q.or(`name.ilike.%${data.query}%,city.ilike.%${data.query}%,zone_area.ilike.%${data.query}%`);
    if (data.exam_id) q = q.contains("targeted_exam_ids", [data.exam_id]);
    const { data: libs } = await q.order("name");
    const libraries = (libs ?? []).filter((l: any) => activeOrgIds.has(l.org_id));
    if (!libraries.length) return { libraries: [] as any[] };

    const libIds = libraries.map((l: any) => l.id);
    const [seatsRes, allocsRes, examsRes, photosRes] = await Promise.all([
      supabaseAdmin.from("seats").select("id, library_id").in("library_id", libIds).eq("is_active", true),
      supabaseAdmin
        .from("allocations")
        .select("library_id, seat_id, student_id")
        .eq("is_active", true)
        .in("library_id", libIds),
      supabaseAdmin.from("master_exams").select("id, name"),
      supabaseAdmin
        .from("library_photos")
        .select("library_id, image_url, display_order")
        .in("library_id", libIds)
        .order("display_order", { ascending: true }),
    ]);
    const seats = seatsRes.data ?? [];
    const allocs = allocsRes.data ?? [];
    const examMap = new Map((examsRes.data ?? []).map((e: any) => [e.id, e.name]));

    const studentIds = Array.from(new Set(allocs.map((a: any) => a.student_id)));
    let studentExam = new Map<string, string | null>();
    if (studentIds.length) {
      const { data: st } = await supabaseAdmin.from("students").select("id, target_exam_id").in("id", studentIds);
      studentExam = new Map((st ?? []).map((s: any) => [s.id, s.target_exam_id]));
    }

    return {
      libraries: libraries.map((l: any) => {
        const libSeats = seats.filter((s: any) => s.library_id === l.id);
        const libAllocs = allocs.filter((a: any) => a.library_id === l.id);
        const total = libSeats.length;
        const occupied = libAllocs.length;
        const vacant = Math.max(0, total - occupied);
        // Exam ratio among occupied seats
        const examCounts = new Map<string, number>();
        for (const a of libAllocs) {
          const ex = studentExam.get(a.student_id);
          if (ex) examCounts.set(ex, (examCounts.get(ex) ?? 0) + 1);
        }
        let socialProof: { exam_name: string; pct: number } | null = null;
        if (occupied >= 5) {
          for (const [ex, count] of examCounts) {
            const pct = (count / occupied) * 100;
            if (pct >= 40) {
              const name = examMap.get(ex);
              if (name) {
                socialProof = { exam_name: name, pct: Math.round(pct) };
                break;
              }
            }
          }
        }
        return {
          id: l.id,
          name: l.name,
          zone_area: l.zone_area,
          city: l.city,
          address: l.address,
          google_maps_url: l.google_maps_url,
          opening_hours: l.opening_hours,
          shifts: l.shifts,
          closed_on: l.closed_on,
          amenities: l.amenities ?? {},
          cover_photo_url: l.cover_photo_url,
          description: l.description,
          show_public_availability: l.show_public_availability,
          vacant_count: l.show_public_availability ? vacant : null,
          targeted_exam_names: (l.targeted_exam_ids ?? []).map((id: string) => examMap.get(id)).filter(Boolean),
          social_proof: socialProof,
        };
      }),
    };
  });

export const listPublicExams = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("master_exams")
    .select("id, name, category")
    .eq("is_active", true)
    .order("name");
  return data ?? [];
});

export const listPublicZones = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("libraries")
    .select("zone_area")
    .eq("is_active", true)
    .eq("approval_status", "approved")
    .not("zone_area", "is", null);
  const zones = Array.from(new Set((data ?? []).map((r: any) => r.zone_area).filter(Boolean))).sort();
  return zones as string[];
});

export const submitSeatRequest = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        library_id: z.string().uuid(),
        student_name: z.string().trim().min(2).max(120),
        mobile_number: z.string().regex(/^[0-9]{10}$/),
        target_exam_id: z.string().uuid().optional().nullable(),
        message: z.string().trim().max(1000).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: lib } = await supabaseAdmin
      .from("libraries")
      .select("id, org_id, is_active")
      .eq("id", data.library_id)
      .maybeSingle();
    if (!lib || !lib.is_active) throw new Error("Library not available");
    const { error } = await supabaseAdmin.from("seat_requests").insert({
      library_id: lib.id,
      org_id: lib.org_id,
      student_name: data.student_name,
      mobile_number: data.mobile_number,
      target_exam_id: data.target_exam_id ?? null,
      message: data.message ?? null,
      status: "pending",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
