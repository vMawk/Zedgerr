import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

const MAX_BYTES = 2 * 1024 * 1024;

export function LogoUpload({ compact = false }: { compact?: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const blob = await api.getLogoBlob().catch(() => null);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return blob ? URL.createObjectURL(blob) : null;
    });
  };

  useEffect(() => {
    void load();
    return () => setPreview((old) => { if (old) URL.revokeObjectURL(old); return null; });
  }, []);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      toast({ title: "Use a PNG or JPEG image", variant: "destructive" });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({ title: "Logo must be 2 MB or smaller", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await api.uploadLogo(file);
      await load();
      await queryClient.invalidateQueries({ queryKey: ["business-settings"] });
      toast({ title: "Logo updated" });
    } catch (e: unknown) {
      toast({ title: "Upload failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteLogo();
      await load();
      await queryClient.invalidateQueries({ queryKey: ["business-settings"] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); void upload(e.dataTransfer.files[0]); }}
        className={`flex shrink-0 items-center justify-center rounded-lg border border-dashed bg-muted/40 transition-colors hover:bg-muted ${compact ? "h-16 w-32" : "h-20 w-40"}`}
        aria-label={preview ? "Replace logo" : "Upload logo"}
      >
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : preview ? (
          <img src={preview} alt="Business logo" className="max-h-full max-w-full object-contain p-2" />
        ) : (
          <ImagePlus className="h-6 w-6 text-muted-foreground" />
        )}
      </button>
      <div className="space-y-2 min-w-0">
        <p className="text-xs text-muted-foreground">PNG or JPEG, up to 2 MB. Shown at the top of invoices and quotes.</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()} disabled={busy}>
            <Upload /> {preview ? "Replace" : "Upload logo"}
          </Button>
          {preview && (
            <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={busy} className="text-muted-foreground">
              <Trash2 /> Remove
            </Button>
          )}
        </div>
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
    </div>
  );
}
