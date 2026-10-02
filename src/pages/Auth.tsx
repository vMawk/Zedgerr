import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Check, FileText, Globe2, Loader2, ShieldCheck, Timer } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { apiUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { ZedgerrIcon, ZedgerrLogo } from "@/components/ZedgerrLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useToast } from "@/hooks/use-toast";

type Mode = "signin" | "signup" | "2fa";

const HIGHLIGHTS = [
  { icon: FileText, text: "Invoices, quotes and credit notes in your own currency" },
  { icon: Globe2, text: "Tax presets for 40+ countries, including EU reverse charge" },
  { icon: Timer, text: "Time tracking, expenses, mileage and bank imports" },
  { icon: ShieldCheck, text: "Self-hosted on your own server, with two-factor sign-in" },
];

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function Auth() {
  const { signIn, signUp } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("signin");
  const [canRegister, setCanRegister] = useState(false);
  const [firstUser, setFirstUser] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(apiUrl("/api/auth/registration-status"))
      .then((r) => r.json() as Promise<{ canRegister: boolean; reason: string }>)
      .then((s) => {
        setCanRegister(s.canRegister);
        setFirstUser(s.reason === "first_user");
        if (s.reason === "first_user") setMode("signup");
      })
      .catch(() => {});
  }, []);

  const submitCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        await signUp(email, password);
      } else {
        const result = await signIn(email, password);
        if (result.requires2fa) {
          setCode("");
          setMode("2fa");
        }
      }
    } catch (error: unknown) {
      toast({ title: mode === "signup" ? "Could not create account" : "Could not sign in", description: errorMessage(error, "Please try again."), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const submitCode = async (value = code) => {
    if (!value.trim()) return;
    setLoading(true);
    try {
      await signIn(email, password, value);
    } catch (error: unknown) {
      setCode("");
      toast({ title: "Could not verify", description: errorMessage(error, "Please try again."), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] bg-background">
      <aside className="hidden lg:flex flex-col justify-between overflow-hidden bg-[#004030] p-12 text-white">
        <div className="relative flex items-center gap-3">
          <ZedgerrIcon className="h-9 w-9" />
          <span className="text-2xl font-extrabold tracking-tight">Zedgerr</span>
        </div>

        <div className="relative space-y-8 max-w-md">
          <motion.h1
            className="text-4xl font-extrabold leading-tight tracking-tight text-balance"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            Flexible bookkeeping, <span className="text-[#39FF14]">your way.</span>
          </motion.h1>
          <ul className="space-y-4">
            {HIGHLIGHTS.map(({ icon: Icon, text }, i) => (
              <motion.li
                key={text}
                className="flex items-start gap-3 text-white/85"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.08, duration: 0.3 }}
              >
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <Icon className="h-4 w-4 text-[#39FF14]" />
                </span>
                {text}
              </motion.li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-white/50">Bookkeeping for freelancers and small businesses.</p>
      </aside>

      <main className="relative flex items-center justify-center px-4 py-12 sm:px-8">
        <ThemeToggle className="absolute right-4 top-4" />
        <div className="w-full max-w-sm space-y-8">
          <div className="lg:hidden flex justify-center">
            <ZedgerrLogo size="lg" />
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {mode !== "2fa" ? (
              <motion.div
                key="credentials"
                className="space-y-6"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                <div className="space-y-1.5">
                  <h2 className="text-2xl font-bold tracking-tight">
                    {mode === "signup" ? (firstUser ? "Create the admin account" : "Create your account") : "Welcome back"}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {mode === "signup"
                      ? firstUser
                        ? "This is a new installation. The first account becomes the administrator."
                        : "Start invoicing in a couple of minutes."
                      : "Sign in to your Zedgerr workspace."}
                  </p>
                </div>

                {canRegister && !firstUser && (
                  <div className="grid grid-cols-2 rounded-lg bg-muted p-1 text-sm" role="tablist">
                    {(["signin", "signup"] as const).map((m) => (
                      <button
                        key={m}
                        role="tab"
                        aria-selected={mode === m}
                        onClick={() => setMode(m)}
                        className={`relative rounded-md py-1.5 font-medium transition-colors ${mode === m ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        {mode === m && (
                          <motion.span layoutId="auth-tab" className="absolute inset-0 rounded-md bg-background shadow-sm" transition={{ type: "spring", stiffness: 500, damping: 35 }} />
                        )}
                        <span className="relative">{m === "signin" ? "Sign in" : "Create account"}</span>
                      </button>
                    ))}
                  </div>
                )}

                <form onSubmit={submitCredentials} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"}
                      required
                      minLength={mode === "signup" ? 8 : 1}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="animate-spin" />}
                    {mode === "signup" ? "Create account" : "Sign in"}
                  </Button>
                </form>

                {!canRegister && (
                  <p className="text-center text-xs text-muted-foreground">
                    Need an account? Ask your workspace administrator for an invitation.
                  </p>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="2fa"
                className="space-y-6"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                <button
                  onClick={() => { setMode("signin"); setPassword(""); setUseRecovery(false); }}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <div className="space-y-1.5">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <ShieldCheck className="h-6 w-6" />
                  </span>
                  <h2 className="text-2xl font-bold tracking-tight pt-2">Two-factor authentication</h2>
                  <p className="text-sm text-muted-foreground">
                    {useRecovery
                      ? "Enter one of the recovery codes you saved when you turned on two-factor authentication."
                      : "Enter the 6-digit code from your authenticator app."}
                  </p>
                </div>

                <form onSubmit={(e) => { e.preventDefault(); void submitCode(); }} className="space-y-4">
                  {useRecovery ? (
                    <Input autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="xxxxx-xxxxx" className="font-mono tracking-wider" autoComplete="one-time-code" />
                  ) : (
                    <div className="flex justify-center">
                      <InputOTP
                        maxLength={6}
                        value={code}
                        onChange={(v) => { setCode(v); if (v.length === 6) void submitCode(v); }}
                        autoFocus
                        disabled={loading}
                      >
                        <InputOTPGroup>
                          {Array.from({ length: 6 }, (_, i) => <InputOTPSlot key={i} index={i} className="h-12 w-11 text-lg" />)}
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                  )}
                  <Button type="submit" className="w-full" disabled={loading || !code}>
                    {loading ? <Loader2 className="animate-spin" /> : <Check />}
                    Verify
                  </Button>
                </form>
                <button
                  onClick={() => { setUseRecovery((v) => !v); setCode(""); }}
                  className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {useRecovery ? "Use authenticator app instead" : "Lost your phone? Use a recovery code"}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
