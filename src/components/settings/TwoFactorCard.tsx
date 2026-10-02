import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, Download, KeyRound, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";

type Status = { enabled: boolean; recovery_codes_remaining: number };
type Setup = { secret: string; otpauth_url: string };

function errorText(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

function CodeInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <InputOTP maxLength={6} value={value} onChange={onChange} disabled={disabled}>
      <InputOTPGroup>
        {Array.from({ length: 6 }, (_, i) => <InputOTPSlot key={i} index={i} />)}
      </InputOTPGroup>
    </InputOTP>
  );
}

function RecoveryCodes({ codes }: { codes: string[] }) {
  const { toast } = useToast();
  const text = codes.join("\n");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Recovery codes copied" });
    } catch {
      toast({ title: "Copy failed", description: "Select the codes and copy them manually.", variant: "destructive" });
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([`Zedgerr recovery codes\n\n${text}\n`], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "zedgerr-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/40 p-4 font-mono text-sm tabular-nums select-all">
        {codes.map((c) => <span key={c}>{c}</span>)}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={copy}><Copy /> Copy</Button>
        <Button variant="outline" size="sm" onClick={download}><Download /> Download</Button>
      </div>
    </div>
  );
}

export function TwoFactorCard() {
  const { toast } = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [disableOpen, setDisableOpen] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [password, setPassword] = useState("");

  const load = () => apiRequest<Status>("/api/auth/2fa").then(setStatus).catch(() => setStatus({ enabled: false, recovery_codes_remaining: 0 }));
  useEffect(() => { void load(); }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e: unknown) {
      setCode("");
      toast({ title: "Something went wrong", description: errorText(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const startSetup = () => run(async () => {
    setSetup(await apiRequest<Setup>("/api/auth/2fa/setup", { method: "POST" }));
    setCode("");
  });

  const enable = () => run(async () => {
    const res = await apiRequest<{ recovery_codes: string[] }>("/api/auth/2fa/enable", { method: "POST", body: JSON.stringify({ code }) });
    setSetup(null);
    setCode("");
    setNewCodes(res.recovery_codes);
    await load();
    toast({ title: "Two-factor authentication is on" });
  });

  const disable = () => run(async () => {
    await apiRequest("/api/auth/2fa/disable", { method: "POST", body: JSON.stringify({ password, code }) });
    setDisableOpen(false);
    setPassword("");
    setCode("");
    await load();
    toast({ title: "Two-factor authentication is off" });
  });

  const regenerate = () => run(async () => {
    const res = await apiRequest<{ recovery_codes: string[] }>("/api/auth/2fa/recovery-codes", { method: "POST", body: JSON.stringify({ code }) });
    setRegenOpen(false);
    setCode("");
    setNewCodes(res.recovery_codes);
    await load();
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5 min-w-0 flex-1">
            <CardTitle>Two-factor authentication</CardTitle>
            <CardDescription>Require a code from an authenticator app, such as 1Password, Google Authenticator or Authy, when you sign in.</CardDescription>
          </div>
          {status && (
            <Badge variant="secondary" className={status.enabled ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}>
              {status.enabled ? <ShieldCheck className="mr-1 h-3.5 w-3.5" /> : <ShieldAlert className="mr-1 h-3.5 w-3.5" />}
              {status.enabled ? "On" : "Off"}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {!status && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}

        {newCodes && (
          <div className="space-y-3 rounded-lg border border-amber-400/50 bg-amber-50/50 p-4 dark:bg-amber-950/20">
            <p className="text-sm font-medium">Save these recovery codes</p>
            <p className="text-sm text-muted-foreground">
              Each code works once if you lose access to your authenticator app. They won't be shown again.
            </p>
            <RecoveryCodes codes={newCodes} />
            <Button size="sm" onClick={() => setNewCodes(null)}><Check /> I've saved them</Button>
          </div>
        )}

        {status && !status.enabled && !setup && (
          <Button onClick={startSetup} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <KeyRound />} Set up authenticator app
          </Button>
        )}

        {setup && (
          <div className="grid gap-6 sm:grid-cols-[auto_minmax(0,1fr)]">
            <div className="rounded-xl border bg-white p-3 w-fit">
              <QRCodeSVG value={setup.otpauth_url} size={168} marginSize={0} />
            </div>
            <div className="space-y-4 min-w-0">
              <ol className="list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
                <li>Scan the QR code with your authenticator app.</li>
                <li>Enter the 6-digit code it shows to confirm.</li>
              </ol>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Can't scan? Enter this key manually:</p>
                <code className="block break-all rounded bg-muted px-2 py-1 font-mono text-xs">{setup.secret.match(/.{1,4}/g)?.join(" ")}</code>
              </div>
              <CodeInput value={code} onChange={setCode} disabled={busy} />
              <div className="flex gap-2">
                <Button onClick={enable} disabled={busy || code.length !== 6}>
                  {busy && <Loader2 className="animate-spin" />} Turn on
                </Button>
                <Button variant="ghost" onClick={() => { setSetup(null); setCode(""); }}>Cancel</Button>
              </div>
            </div>
          </div>
        )}

        {status?.enabled && !newCodes && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground mr-auto">
              {status.recovery_codes_remaining} of 8 recovery codes left.
            </p>
            <Button variant="outline" onClick={() => { setCode(""); setRegenOpen(true); }}>New recovery codes</Button>
            <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => { setCode(""); setPassword(""); setDisableOpen(true); }}>
              Turn off
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Turn off two-factor authentication?</DialogTitle>
            <DialogDescription>Confirm with your password and a current code. Your account will be protected by your password only.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="tfa-pw">Password</Label>
              <Input id="tfa-pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Authenticator or recovery code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" autoComplete="one-time-code" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDisableOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={disable} disabled={busy || !password || !code}>
              {busy && <Loader2 className="animate-spin" />} Turn off
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={regenOpen} onOpenChange={setRegenOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create new recovery codes</DialogTitle>
            <DialogDescription>Your old recovery codes stop working. Enter a code from your authenticator app to continue.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-2">
            <CodeInput value={code} onChange={setCode} disabled={busy} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRegenOpen(false)}>Cancel</Button>
            <Button onClick={regenerate} disabled={busy || code.length !== 6}>
              {busy && <Loader2 className="animate-spin" />} Create codes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
