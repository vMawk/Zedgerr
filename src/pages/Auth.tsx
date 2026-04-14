import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

type RegistrationStatus = {
  canRegister: boolean;
  needsSetupCode: boolean;
  reason: string;
  message?: string;
};

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [regStatus, setRegStatus] = useState<RegistrationStatus | null>(null);
  const { signIn, signUp } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    fetch(apiUrl("/api/auth/registration-status"))
      .then((r) => r.json() as Promise<RegistrationStatus>)
      .then(setRegStatus)
      .catch(() => setRegStatus(null));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        await signIn(email, password);
      } else {
        if (regStatus?.needsSetupCode && !setupCode.trim()) {
          throw new Error("Vul de setupcode in voor het eerste account.");
        }
        await signUp(email, password, !isLogin ? setupCode : undefined);
        toast({ title: "Account aangemaakt", description: "Je bent ingelogd." });
      }
    } catch (error: any) {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto mb-3 flex justify-center">
            <img src="/gibby-logo.png" alt="gibby.it" className="h-10 w-auto max-w-[200px] object-contain" />
          </div>
          <CardTitle className="text-2xl font-semibold">
            {isLogin ? "Welkom terug" : "Account aanmaken"}
          </CardTitle>
          <CardDescription>
            {isLogin
              ? "Log in om verder te gaan"
              : regStatus?.needsSetupCode
                ? "Eerste gebruiker: dit maakt het beheerdersaccount aan (niet hetzelfde als inloggen met een bestaand account)."
                : "Maak een nieuw account aan"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {regStatus?.reason === "server_not_configured" && (
            <p className="text-sm text-destructive mb-4">{regStatus.message}</p>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mailadres</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="naam@voorbeeld.nl" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Wachtwoord</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
            </div>
            {!isLogin && regStatus?.needsSetupCode && (
              <div className="space-y-2">
                <Label htmlFor="setupCode">Setupcode (eerste account)</Label>
                <Input
                  id="setupCode"
                  type="password"
                  autoComplete="off"
                  value={setupCode}
                  onChange={(e) => setSetupCode(e.target.value)}
                  placeholder="Uit serverconfig (FIRST_REGISTRATION_SECRET)"
                  required
                />
              </div>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={loading || (!isLogin && regStatus !== null && !regStatus.canRegister)}
            >
              {loading ? "Laden..." : isLogin ? "Inloggen" : "Registreren"}
            </Button>
          </form>
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setSetupCode("");
              }}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
              disabled={isLogin && regStatus !== null && !regStatus.canRegister}
            >
              {isLogin ? "Nog geen account? Registreer hier" : "Al een account? Log hier in"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
