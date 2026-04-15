import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

function todayIso(): string {
  return new Date().toISOString().split("T")[0]!;
}

export default function Notes() {
  const { toast } = useToast();
  const [date, setDate] = useState(todayIso());
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const saveTimer = useRef<number | null>(null);

  const loadNote = async (d: string) => {
    const note = await api.getDailyNote(d);
    setContent(note.content ?? "");
    setDirty(false);
  };

  useEffect(() => {
    loadNote(date).catch((e: unknown) =>
      toast({ title: "Fout", description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const persist = async (d: string, text: string) => {
    setSaving(true);
    try {
      await api.putDailyNote(d, text);
      setDirty(false);
    } catch (e: unknown) {
      toast({ title: "Opslaan mislukt", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const queueSave = (d: string, text: string) => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void persist(d, text);
    }, 500);
  };

  useEffect(() => {
    if (!dirty) return;
    queueSave(date, content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  useEffect(() => {
    const flush = () => {
      if (!dirty) return;
      void persist(date, content);
    };

    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const onBeforeUnload = () => flush();

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, date, content]);

  const onDateChange = async (nextDate: string) => {
    if (!nextDate) return;
    if (dirty) await persist(date, content);
    setDate(nextDate);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Notities</h1>
      <Card>
        <CardHeader>
          <CardTitle>Dagnotitie</CardTitle>
          <CardDescription>
            Typen is genoeg: notities worden automatisch gesynchroniseerd.
            {saving ? " Opslaan..." : dirty ? " Wijzigingen in wachtrij..." : " Opgeslagen."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 max-w-xs">
            <Label htmlFor="note-date">Datum</Label>
            <Input id="note-date" type="date" value={date} onChange={(e) => void onDateChange(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="note-content">Notitie</Label>
            <Textarea
              id="note-content"
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setDirty(true);
              }}
              placeholder="Schrijf hier je notities voor deze dag..."
              className="min-h-[360px]"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
