import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Camera, Upload, X } from "lucide-react";

export function useSignedDoc(path?: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!path) {
      setUrl(null);
      return;
    }
    supabase.storage
      .from("student-documents")
      .createSignedUrl(path, 600)
      .then(({ data }) => {
        if (alive) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      alive = false;
    };
  }, [path]);
  return url;
}

/**
 * Photo / ID-card picker with direct camera capture.
 * `value` is the locally selected File (not yet uploaded); `existingPath`
 * is the storage path already saved on the student row.
 */
export function StudentDocInput({
  label,
  hint,
  value,
  existingPath,
  onChange,
  onClearExisting,
}: {
  label: string;
  hint?: string;
  value: File | null;
  existingPath?: string | null;
  onChange: (f: File | null) => void;
  onClearExisting?: () => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const signed = useSignedDoc(value ? null : existingPath);
  const [localUrl, setLocalUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!value) {
      setLocalUrl(null);
      return;
    }
    const u = URL.createObjectURL(value);
    setLocalUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [value]);

  const preview = localUrl ?? signed;

  function pick(f: File | null) {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) return;
    onChange(f);
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-start gap-3">
        <div className="size-20 shrink-0 overflow-hidden rounded-lg border border-panel-border bg-panel">
          {preview ? (
            <img src={preview} alt={label} className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-[10px] text-muted-foreground">
              No image
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-panel-border bg-panel"
              onClick={() => cameraRef.current?.click()}
            >
              <Camera className="mr-1 size-3" /> Camera
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-panel-border bg-panel"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="mr-1 size-3" /> Upload
            </Button>
            {(value || existingPath) && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-rose"
                onClick={() => {
                  onChange(null);
                  if (cameraRef.current) cameraRef.current.value = "";
                  if (fileRef.current) fileRef.current.value = "";
                  if (!value) onClearExisting?.();
                }}
              >
                <X className="mr-1 size-3" /> Remove
              </Button>
            )}
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {hint ?? "JPG/PNG, max 5MB."}
          </p>
        </div>
      </div>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0] ?? null)}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

export async function uploadStudentDoc(orgId: string, kind: "photo" | "id-card", file: File) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${orgId}/${kind}-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("student-documents")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw new Error(error.message);
  return path;
}
