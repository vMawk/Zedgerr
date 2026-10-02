import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiRequest, setStoredToken } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useToast } from "../hooks/use-toast";

interface InviteInfo {
  email: string;
  role: string;
  org_name: string;
  expires_at: string;
}

export default function InviteAccept() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const token = searchParams.get("token") ?? "";

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    apiRequest<InviteInfo>(`/api/org/invite/info?token=${encodeURIComponent(token)}`)
      .then((data) => { setInfo(data); setLoading(false); })
      .catch(() => { setError("Uitnodiging niet gevonden of verlopen."); setLoading(false); });
  }, [token]);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      const result = await apiRequest<{ token: string; user: { email: string } }>("/api/org/invite/accept", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setStoredToken(result.token);
      toast({ title: `Welkom! Je bent nu lid van de organisatie.` });
      navigate("/", { replace: true });
      window.location.reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAccepting(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen"><p className="text-muted-foreground">Uitnodiging laden…</p></div>;

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Uitnodiging accepteren</CardTitle>
          {info && (
            <CardDescription>
              Je bent uitgenodigd voor <strong>{info.org_name}</strong> als <strong>{info.role}</strong>.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {info && (
            <>
              <div className="grid gap-1.5">
                <Label>Email</Label>
                <Input value={info.email} disabled />
              </div>
              <div className="grid gap-1.5">
                <Label>Wachtwoord</Label>
                <Input
                  type="password"
                  placeholder="Kies een wachtwoord (als je nog geen account hebt)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAccept()}
                />
                <p className="text-xs text-muted-foreground">Heb je al een account? Laat dit veld leeg.</p>
              </div>
              <Button className="w-full" onClick={handleAccept} disabled={accepting}>
                {accepting ? "Bezig…" : "Uitnodiging accepteren"}
              </Button>
            </>
          )}
          {!info && !error && <p className="text-sm text-muted-foreground text-center">Geen geldige uitnodiging.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
