import { useEffect, useRef, useState } from "react";
import { api, getStoredToken } from "@/lib/api";
import type { Attachment } from "@/lib/db-types";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { FileText, Image, Loader2, Paperclip, Trash2, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function fileIcon(contentType: string | null) {
  if (contentType?.startsWith("image/")) return <Image className="h-4 w-4 shrink-0 text-blue-500" />;
  return <FileText className="h-4 w-4 shrink-0 text-red-500" />;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  entityType: string;
  entityId: string;
}

export function AttachmentSection({ entityType, entityId }: Props) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Attachment | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    api.getAttachments(entityType, entityId).then(setAttachments).catch(() => {});
  };

  useEffect(() => { load(); }, [entityType, entityId]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await api.uploadAttachment(entityType, entityId, file);
      }
      toast({ title: `${files.length === 1 ? "Attachment" : "Attachments"} uploaded` });
      load();
    } catch (e: unknown) {
      toast({ title: "Upload failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteAttachment(deleteTarget.id);
      setDeleteTarget(null);
      load();
      toast({ title: "Attachment deleted" });
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Attachments</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="h-7 text-xs"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Paperclip className="h-3.5 w-3.5 mr-1" />}
          {uploading ? "Working…" : "Add"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,.pdf"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {attachments.length === 0 && !uploading && (
        <p className="text-xs text-muted-foreground">No attachments yet. Add receipts, photos or PDFs.</p>
      )}

      {attachments.length > 0 && (
        <ul className="space-y-1">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              {fileIcon(a.content_type)}
              <span className="flex-1 truncate">{a.filename}</span>
              {a.size_bytes && <span className="text-xs text-muted-foreground tabular-nums shrink-0">{formatBytes(a.size_bytes)}</span>}
              <button
                type="button"
                title="Open"
                className="shrink-0 text-muted-foreground hover:text-foreground"
                onClick={async () => {
                  try {
                    const token = getStoredToken();
                    const res = await fetch(api.downloadAttachmentUrl(a.id), {
                      headers: token ? { Authorization: `Bearer ${token}` } : {},
                    });
                    if (!res.ok) throw new Error("Download failed");
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    window.open(url, "_blank");
                    setTimeout(() => URL.revokeObjectURL(url), 60000);
                  } catch {
                    toast({ title: "Could not open file", variant: "destructive" });
                  }
                }}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setDeleteTarget(a)}
                title="Delete"
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete attachment?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">{deleteTarget?.filename}</span> will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Working…" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
