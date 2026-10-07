import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Copy, ExternalLink, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { branchPaymentUrl, hasPaymentDetails, safePaymentLink } from "@/lib/payment-details";
import { paymentQrUrl } from "@/lib/use-payment-details";

export function BranchPaymentDialog({ libraryId, branchName, open, onOpenChange }: {
  libraryId: string; branchName: string; open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [upi, setUpi] = useState("");
  const [payee, setPayee] = useState("");
  const [link, setLink] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removeQr, setRemoveQr] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const settings = useQuery({
    queryKey: ["branch-payment-settings", libraryId], enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("library_payment_settings").select("*").eq("library_id", libraryId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    if (!open || !settings.isSuccess) return;
    setUpi(settings.data?.upi_id ?? ""); setPayee(settings.data?.payee_name ?? ""); setLink(settings.data?.payment_link ?? "");
    setFile(null); setRemoveQr(false);
  }, [open, settings.data, settings.isSuccess]);
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const qr = preview || (!removeQr && settings.data?.qr_path ? paymentQrUrl(settings.data.qr_path) : null);
  const dirty = upi.trim() !== (settings.data?.upi_id ?? "") || payee.trim() !== (settings.data?.payee_name ?? "") || link.trim() !== (settings.data?.payment_link ?? "") || !!file || removeQr;
  const selectFile = async (candidate?: File) => {
    if (!candidate) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(candidate.type) || candidate.size > 5 * 1024 * 1024) {
      toast.error("Choose a PNG, JPG or WebP image up to 5 MB."); return;
    }
    try {
      const bitmap = await createImageBitmap(candidate); bitmap.close();
      setFile(candidate); setRemoveQr(false);
    } catch { toast.error("This image could not be opened. Choose another image."); }
  };
  const save = async () => {
    if (saving) return;
    const upiId = upi.trim(); const payeeName = payee.trim(); const paymentLink = link.trim();
    if (upiId && !/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$/.test(upiId)) { toast.error("Enter a valid UPI ID, such as name@bank."); return; }
    if (paymentLink && !safePaymentLink(paymentLink)) { toast.error("Enter a valid HTTPS payment link without a username or password."); return; }
    if (upiId && !payeeName) { toast.error("Enter the payee name for this UPI ID."); return; }
    setSaving(true);
    let uploaded: string | null = null;
    try {
      let qrPath = removeQr ? null : settings.data?.qr_path ?? null;
      if (file) {
        const ext = file.type === "image/jpeg" ? "jpg" : file.type === "image/webp" ? "webp" : "png";
        uploaded = `${libraryId}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("library-payment-qr").upload(uploaded, file, { contentType: file.type, upsert: false });
        if (error) throw error;
        qrPath = uploaded;
      }
      const { error } = await supabase.from("library_payment_settings").upsert({ library_id: libraryId, upi_id: upiId || null, payee_name: payeeName || null, payment_link: paymentLink || null, qr_path: qrPath });
      if (error) throw error;
      const oldPath = settings.data?.qr_path;
      if (oldPath && oldPath !== qrPath) {
        const { error: cleanupError } = await supabase.storage.from("library-payment-qr").remove([oldPath]);
        if (cleanupError) toast.warning("Details saved, but the previous QR image could not be removed.");
      }
      await Promise.all([qc.invalidateQueries({ queryKey: ["branch-payment-settings", libraryId] }), qc.invalidateQueries({ queryKey: ["library-payment-settings"] }), qc.invalidateQueries({ queryKey: ["public-payment-details", libraryId] })]);
      toast.success("Payment details saved"); onOpenChange(false);
    } catch (error) {
      if (uploaded) await supabase.storage.from("library-payment-qr").remove([uploaded]);
      toast.error(error instanceof Error ? error.message : "Could not save payment details.");
    } finally { setSaving(false); }
  };
  return <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
      <DialogHeader><DialogTitle>Payment details · {branchName}</DialogTitle><DialogDescription>Student fee payments</DialogDescription></DialogHeader>
      {settings.isPending ? <p className="py-8 text-center text-muted-foreground">Loading payment details…</p> : settings.isError ? <div className="space-y-3"><p className="text-rose">Could not load payment details.</p><Button onClick={() => settings.refetch()}>Retry</Button></div> : <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <div className="space-y-2"><Label htmlFor={`upi-${libraryId}`}>UPI ID</Label><Input id={`upi-${libraryId}`} value={upi} onChange={(e) => setUpi(e.target.value)} maxLength={100} placeholder="name@bank" disabled={saving} /></div>
        <div className="space-y-2"><Label htmlFor={`payee-${libraryId}`}>Payee name</Label><Input id={`payee-${libraryId}`} value={payee} onChange={(e) => setPayee(e.target.value)} maxLength={100} disabled={saving} /></div>
        <div className="space-y-2"><Label htmlFor={`link-${libraryId}`}>Payment link (optional)</Label><Input id={`link-${libraryId}`} type="url" value={link} onChange={(e) => setLink(e.target.value)} maxLength={2048} placeholder="https://" disabled={saving} /></div>
        <div className="space-y-3"><Label>Payment QR image</Label>
          {qr && <div className="flex items-start gap-3"><img src={qr} alt={`${branchName} payment QR code`} className="size-44 max-w-full rounded-md border border-panel-border object-contain" /><Button type="button" size="icon" variant="ghost" aria-label="Remove QR image" disabled={saving} onClick={() => { setFile(null); setRemoveQr(!!settings.data?.qr_path); }}><X className="size-4" /></Button></div>}
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Upload payment QR image" className="hidden" disabled={saving} onChange={(e) => { void selectFile(e.target.files?.[0]); e.target.value = ""; }} />
          <Button type="button" variant="outline" disabled={saving} onClick={() => inputRef.current?.click()}><Upload className="mr-2 size-4" />{qr ? "Replace QR image" : "Upload QR image"}</Button>
          <p className="text-xs text-muted-foreground">PNG, JPG or WebP · Up to 5 MB · Shared with students</p>
        </div>
        {hasPaymentDetails(settings.data) && !dirty && <div className="flex flex-wrap gap-2 border-t border-panel-border pt-4"><Button type="button" variant="outline" size="sm" onClick={async () => { try { await navigator.clipboard.writeText(branchPaymentUrl(libraryId, window.location.origin)); toast.success("Payment page link copied"); } catch { toast.error("Could not copy the link."); } }}><Copy className="mr-2 size-4" />Copy payment page link</Button><Button type="button" variant="ghost" size="sm" onClick={() => window.open(branchPaymentUrl(libraryId, window.location.origin), "_blank", "noopener,noreferrer")}><ExternalLink className="mr-2 size-4" />Preview</Button></div>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={saving || !dirty}>{saving && <Loader2 className="mr-2 size-4 animate-spin" />}Save payment details</Button></div>
      </form>}
    </DialogContent>
  </Dialog>;
}