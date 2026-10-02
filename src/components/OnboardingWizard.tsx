import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { SORTED_PRESETS, OTHER_PRESET, presetFor, rateOptions, bankAccountLabel } from "@/lib/tax-presets";
import { SUPPORTED_CURRENCIES } from "@/lib/tax";
import { ZedgerrIcon } from "./ZedgerrLogo";
import { LogoUpload } from "./settings/LogoUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ArrowRight, Building2, Compass, FileText, Globe2, Info, X } from "lucide-react";

const STEPS = ["welcome", "country", "business", "invoicing"] as const;
type Step = (typeof STEPS)[number];

const EMPTY_FORM = {
  country_code: "",
  tax_name: "",
  default_tax_rate: "",
  currency: "EUR",
  distance_unit: "km",
  company_name: "",
  contact_person: "",
  email: "",
  phone: "",
  street: "",
  postal_code: "",
  city: "",
  kvk_number: "",
  btw_number: "",
  iban: "",
};
type Form = typeof EMPTY_FORM;

type Props = {
  onFinish: (withTour: boolean) => void;
  onClose: () => void;
};

function Field({
  id, label, required, hint, ...input
}: { id: string; label: string; required?: boolean; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="grid gap-1.5 min-w-0">
      <Label htmlFor={id}>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <Input id={id} {...input} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function StepHeader({ step, title, description }: { step: number; title: string; description: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Step {step} of 3</p>
      <h2 className="text-xl font-bold tracking-tight text-[#004030] dark:text-white">{title}</h2>
      <p className="text-sm text-muted-foreground mt-1">{description}</p>
    </div>
  );
}

export function OnboardingWizard({ onFinish, onClose }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("welcome");
  const [direction, setDirection] = useState(1);
  const [saving, setSaving] = useState(false);
  const [region, setRegion] = useState("");
  const [form, setForm] = useState<Form>(EMPTY_FORM);

  useEffect(() => {
    api.getBusinessSettings().then((s) => {
      if (!s) return;
      setForm((f) => {
        const next = { ...f };
        for (const key of Object.keys(EMPTY_FORM) as (keyof Form)[]) {
          const value = s[key as keyof typeof s];
          if (value != null && value !== "") next[key] = String(value);
        }
        return next;
      });
    }).catch(() => {});
  }, []);

  const preset = presetFor(form.country_code);
  const bank = bankAccountLabel(form.country_code);
  const stepIndex = STEPS.indexOf(step);

  const go = (to: Step) => {
    setDirection(STEPS.indexOf(to) > stepIndex ? 1 : -1);
    setStep(to);
  };

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const chooseCountry = (code: string) => {
    const p = presetFor(code);
    setRegion("");
    setForm((f) => ({
      ...f,
      country_code: code,
      tax_name: p.taxName,
      default_tax_rate: String(p.standardRate),
      currency: p.currency,
      distance_unit: p.distanceUnit,
    }));
  };

  const chooseRegion = (name: string) => {
    const r = preset.regions?.find((x) => x.name === name);
    setRegion(name);
    if (r) setForm((f) => ({ ...f, tax_name: r.taxName, default_tax_rate: String(r.rate) }));
  };

  const next = () => {
    if (step === "country" && !form.country_code) {
      toast({ title: "Choose the country your business is based in", variant: "destructive" });
      return;
    }
    if (step === "business" && !form.company_name.trim()) {
      toast({ title: "Business name is required", variant: "destructive" });
      return;
    }
    go(STEPS[stepIndex + 1]);
  };

  const finish = async (withTour: boolean) => {
    setSaving(true);
    try {
      const trimmed = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, typeof v === "string" ? v.trim() || null : v]),
      );
      await api.putBusinessSettings({
        ...trimmed,
        country: form.country_code === OTHER_PRESET.code ? null : preset.name,
        tax_name: form.tax_name.trim() || preset.taxName,
        default_tax_rate: Number(form.default_tax_rate) || 0,
        currency: form.currency,
        distance_unit: form.distance_unit,
      });
      await queryClient.invalidateQueries({ queryKey: ["business-settings"] });
      onFinish(withTour);
    } catch (err: unknown) {
      toast({ title: "Could not save settings", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const nav = (
    <div className="flex gap-3 pt-2">
      <Button type="button" variant="ghost" onClick={() => go(STEPS[stepIndex - 1])} disabled={saving}>
        <ArrowLeft /> Back
      </Button>
      <Button type="submit" className="flex-1">Next <ArrowRight /></Button>
    </div>
  );

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,20,14,0.62)] backdrop-blur-sm p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="relative w-full max-w-xl max-h-[calc(100vh-2rem)] overflow-y-auto bg-card text-card-foreground rounded-2xl shadow-2xl border border-border"
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
        role="dialog"
        aria-modal="true"
        aria-label="Set up Zedgerr"
      >
        <div className="sticky top-0 z-10 h-1 bg-muted">
          <motion.div
            className="h-full bg-[#39FF14]"
            animate={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>
        <button
          onClick={onClose}
          className="absolute right-3 top-4 z-10 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Set up later"
          title="Set up later"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative p-6 sm:p-8 overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 24 * direction }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 * direction }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {step === "welcome" && (
                <div className="text-center space-y-6">
                  <motion.div
                    initial={{ scale: 0.6, rotate: -12, opacity: 0 }}
                    animate={{ scale: 1, rotate: 0, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.1 }}
                  >
                    <ZedgerrIcon className="h-16 w-16 mx-auto" />
                  </motion.div>
                  <div>
                    <h1 className="text-2xl font-extrabold tracking-tight text-[#004030] dark:text-white">Welcome to Zedgerr</h1>
                    <p className="mt-2 text-muted-foreground">
                      Fill in your details once and every invoice and quote is ready to send. It takes about two minutes.
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    {[
                      { icon: Globe2, label: "Country & tax" },
                      { icon: Building2, label: "Your business" },
                      { icon: FileText, label: "Invoice details" },
                    ].map(({ icon: Icon, label }, i) => (
                      <motion.div
                        key={label}
                        className="flex flex-col items-center gap-2 p-3 rounded-xl bg-muted/50"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 + i * 0.07, duration: 0.25 }}
                      >
                        <Icon className="h-5 w-5 text-[#004030] dark:text-[#39FF14]" />
                        <span className="text-muted-foreground">{label}</span>
                      </motion.div>
                    ))}
                  </div>
                  <Button className="w-full" size="lg" onClick={() => go("country")}>
                    Get started <ArrowRight />
                  </Button>
                </div>
              )}

              {step === "country" && (
                <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); next(); }}>
                  <StepHeader
                    step={1}
                    title="Country & tax"
                    description="We fill in the usual tax, currency and labels for your country. Everything can be changed later."
                  />
                  <div className="space-y-3">
                    <div className="grid gap-1.5">
                      <Label>Country <span className="text-destructive">*</span></Label>
                      <Select value={form.country_code} onValueChange={chooseCountry}>
                        <SelectTrigger><SelectValue placeholder="Where is your business based?" /></SelectTrigger>
                        <SelectContent className="max-h-72">
                          {SORTED_PRESETS.map((p) => <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>)}
                          <SelectItem value={OTHER_PRESET.code}>{OTHER_PRESET.name}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {preset.regions && form.country_code && (
                      <div className="grid gap-1.5">
                        <Label>Province or territory</Label>
                        <Select value={region} onValueChange={chooseRegion}>
                          <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                          <SelectContent className="max-h-72">
                            {preset.regions.map((r) => (
                              <SelectItem key={r.name} value={r.name}>{r.name} ({r.taxName} {r.rate}%)</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {form.country_code && (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <Field id="tn" label="Tax name" value={form.tax_name} onChange={set("tax_name")} />
                          <Field id="rate" label="Default rate (%)" type="number" min="0" max="100" step="0.001" value={form.default_tax_rate} onChange={set("default_tax_rate")} />
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {rateOptions(preset, Number(form.default_tax_rate)).map((r) => (
                            <button
                              key={r}
                              type="button"
                              onClick={() => setForm((f) => ({ ...f, default_tax_rate: String(r) }))}
                              className={`rounded-full border px-2.5 py-0.5 text-xs tabular-nums transition-colors ${
                                Number(form.default_tax_rate) === r ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                              }`}
                            >
                              {r}%
                            </button>
                          ))}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="grid gap-1.5">
                            <Label>Currency</Label>
                            <Select value={form.currency} onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent className="max-h-72">
                                {SUPPORTED_CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid gap-1.5">
                            <Label>Distance unit</Label>
                            <Select value={form.distance_unit} onValueChange={(v) => setForm((f) => ({ ...f, distance_unit: v }))}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="km">Kilometres</SelectItem>
                                <SelectItem value="mi">Miles</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        {preset.note && (
                          <p className="flex gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
                            <Info className="h-4 w-4 shrink-0 mt-px" /> {preset.note}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                  {nav}
                </form>
              )}

              {step === "business" && (
                <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); next(); }}>
                  <StepHeader step={2} title="Your business" description="Shown at the top of every invoice and quote." />
                  <div className="space-y-3">
                    <Field id="co" label="Business name" required autoFocus placeholder="Acme Studio" value={form.company_name} onChange={set("company_name")} />
                    <div className="grid sm:grid-cols-2 gap-3">
                      <Field id="cp" label="Contact person" placeholder="Jane Doe" value={form.contact_person} onChange={set("contact_person")} />
                      <Field id="ph" label="Phone" type="tel" placeholder="+44 20 7946 0000" value={form.phone} onChange={set("phone")} />
                    </div>
                    <Field id="em" label="Email for invoices" type="email" placeholder="billing@acme.com" value={form.email} onChange={set("email")} />
                    <Field id="st" label="Street and number" placeholder="221B Baker Street" value={form.street} onChange={set("street")} />
                    <div className="grid grid-cols-[1fr_2fr] gap-3">
                      <Field id="pc" label="Postal code" placeholder="NW1 6XE" value={form.postal_code} onChange={set("postal_code")} />
                      <Field id="ci" label="City" placeholder="London" value={form.city} onChange={set("city")} />
                    </div>
                  </div>
                  {nav}
                </form>
              )}

              {step === "invoicing" && (
                <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); finish(true); }}>
                  <StepHeader
                    step={3}
                    title="Invoice & payment details"
                    description="Registration and bank details that clients need to pay you. Leave anything you don't have empty."
                  />
                  <div className="space-y-3">
                    <div className="grid sm:grid-cols-2 gap-3">
                      <Field id="reg" label={preset.companyIdLabel} value={form.kvk_number} onChange={set("kvk_number")} />
                      <Field id="tax" label={preset.taxIdLabel} value={form.btw_number} onChange={set("btw_number")} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Logo <span className="font-normal text-muted-foreground">(optional)</span></Label>
                      <LogoUpload compact />
                    </div>
                    <Field
                      id="bank"
                      label={bank.label}
                      placeholder={bank.placeholder}
                      value={form.iban}
                      onChange={set("iban")}
                      hint="Printed on invoices with the invoice number as payment reference."
                    />
                  </div>
                  <div className="space-y-2 pt-2">
                    <div className="flex gap-3">
                      <Button type="button" variant="ghost" onClick={() => go("business")} disabled={saving}>
                        <ArrowLeft /> Back
                      </Button>
                      <Button type="submit" className="flex-1" disabled={saving}>
                        {saving ? "Saving…" : <>Finish & take the tour <Compass /></>}
                      </Button>
                    </div>
                    <button
                      type="button"
                      onClick={() => finish(false)}
                      disabled={saving}
                      className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                    >
                      Finish without the tour
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
