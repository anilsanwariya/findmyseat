import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertOrgAdminForLibrary(ctx: { supabase: any; userId: string }, library_id: string) {
  const { data: adminRow } = await ctx.supabase
    .from("user_roles")
    .select("org_id")
    .eq("user_id", ctx.userId)
    .eq("role", "org_admin")
    .maybeSingle();
  if (!adminRow?.org_id) throw new Error("Not an organization admin");
  const { data: lib } = await ctx.supabase
    .from("libraries")
    .select("id, org_id")
    .eq("id", library_id)
    .maybeSingle();
  if (!lib || lib.org_id !== adminRow.org_id) throw new Error("Library not in your organization");
  return { orgId: adminRow.org_id as string };
}

const UploadPhotoSchema = z.object({
  library_id: z.string().uuid(),
  section_name: z.string().trim().min(1).max(80),
  // Base64 data URL (image/jpeg or image/png). Kept < ~5MB via client-side check.
  file_data_url: z.string().min(50).max(8_500_000),
  content_type: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

export const uploadLibraryPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UploadPhotoSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertOrgAdminForLibrary(context, data.library_id);

    const commaIdx = data.file_data_url.indexOf(",");
    if (commaIdx === -1) throw new Error("Invalid image data");
    const b64 = data.file_data_url.slice(commaIdx + 1);
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    if (bytes.byteLength > 5 * 1024 * 1024) throw new Error("Image too large (max 5MB)");

    const ext = data.content_type === "image/png" ? "png" : data.content_type === "image/webp" ? "webp" : "jpg";
    const path = `${data.library_id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin.storage
      .from("library-photos")
      .upload(path, bytes, { contentType: data.content_type, upsert: false });
    if (upErr) throw new Error(upErr.message);

    const { data: pub } = supabaseAdmin.storage.from("library-photos").getPublicUrl(path);
    const image_url = pub.publicUrl;

    // Determine display_order (append at end).
    const { data: existing } = await supabaseAdmin
      .from("library_photos")
      .select("display_order")
      .eq("library_id", data.library_id)
      .order("display_order", { ascending: false })
      .limit(1);
    const nextOrder = existing?.[0]?.display_order != null ? existing[0].display_order + 1 : 0;

    const { data: row, error: insErr } = await supabaseAdmin
      .from("library_photos")
      .insert({
        library_id: data.library_id,
        image_url,
        section_name: data.section_name,
        display_order: nextOrder,
      })
      .select("id, image_url, section_name, display_order")
      .single();
    if (insErr) {
      await supabaseAdmin.storage.from("library-photos").remove([path]).catch(() => {});
      throw new Error(insErr.message);
    }
    // New photos require super-admin re-approval before appearing in the marketplace.
    await supabaseAdmin
      .from("libraries")
      .update({ approval_status: "pending", rejection_reason: null, reviewed_at: null, reviewed_by: null })
      .eq("id", data.library_id);
    return row;
  });

const ReorderPhotosSchema = z.object({
  library_id: z.string().uuid(),
  photo_ids: z.array(z.string().uuid()).min(1).max(50),
});
export const reorderLibraryPhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ReorderPhotosSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertOrgAdminForLibrary(context, data.library_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("library_photos")
      .select("id")
      .eq("library_id", data.library_id);
    const existingIds = new Set((existing ?? []).map((r: any) => r.id));
    if (data.photo_ids.length !== existingIds.size || !data.photo_ids.every((id) => existingIds.has(id))) {
      throw new Error("Photo list mismatch");
    }
    for (let i = 0; i < data.photo_ids.length; i++) {
      const { error } = await supabaseAdmin
        .from("library_photos")
        .update({ display_order: i })
        .eq("id", data.photo_ids[i])
        .eq("library_id", data.library_id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

const DeletePhotoSchema = z.object({ photo_id: z.string().uuid() });
export const deleteLibraryPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DeletePhotoSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: photo } = await supabaseAdmin
      .from("library_photos")
      .select("id, library_id, image_url")
      .eq("id", data.photo_id)
      .maybeSingle();
    if (!photo) throw new Error("Photo not found");
    await assertOrgAdminForLibrary(context, photo.library_id);

    // Extract storage path after '/library-photos/'
    const marker = "/library-photos/";
    const idx = photo.image_url.indexOf(marker);
    if (idx !== -1) {
      const path = photo.image_url.slice(idx + marker.length);
      await supabaseAdmin.storage.from("library-photos").remove([path]).catch(() => {});
    }
    const { error } = await supabaseAdmin.from("library_photos").delete().eq("id", photo.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
