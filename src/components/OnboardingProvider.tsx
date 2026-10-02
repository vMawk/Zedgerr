import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Compass, Wrench } from "lucide-react";
import { api } from "@/lib/api";
import { SpotlightTour } from "@/lib/tour";
import { OnboardingWizard } from "@/components/OnboardingWizard";

const ONBOARDED_KEY = "zedgerr_onboarded";

function readOnboarded() {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeOnboarded(done: boolean) {
  try {
    if (done) localStorage.setItem(ONBOARDED_KEY, "1");
    else localStorage.removeItem(ONBOARDED_KEY);
  } catch {
    // storage unavailable: onboarding falls back to the business-settings check
  }
}

const OnboardingContext = createContext<{ startTour: () => void; openSetup: () => void }>({
  startTour: () => {},
  openSetup: () => {},
});

export function useOnboarding() {
  return useContext(OnboardingContext);
}

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [setupOpen, setSetupOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);

  useEffect(() => {
    if (readOnboarded()) return;
    api.getBusinessSettings()
      .then((s) => {
        if (s?.company_name) writeOnboarded(true);
        else setSetupOpen(true);
      })
      .catch(() => {});
  }, []);

  const startTour = useCallback(() => {
    setSetupOpen(false);
    setTourOpen(true);
  }, []);
  const openSetup = useCallback(() => {
    setTourOpen(false);
    setSetupOpen(true);
  }, []);

  const finishSetup = (withTour: boolean) => {
    writeOnboarded(true);
    setSetupOpen(false);
    if (withTour) setTourOpen(true);
  };

  return (
    <OnboardingContext.Provider value={{ startTour, openSetup }}>
      {children}
      {setupOpen && <OnboardingWizard onFinish={finishSetup} onClose={() => setSetupOpen(false)} />}
      <AnimatePresence>{tourOpen && <SpotlightTour onClose={() => setTourOpen(false)} />}</AnimatePresence>
      {import.meta.env.DEV && <DevToolbar onSetup={openSetup} onTour={startTour} />}
    </OnboardingContext.Provider>
  );
}

function DevToolbar({ onSetup, onTour }: { onSetup: () => void; onTour: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="fixed bottom-4 left-4 z-[70] flex flex-col items-start gap-2">
      {open && (
        <div className="rounded-lg border border-border bg-card shadow-lg p-1.5 w-52">
          <p className="px-2 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Dev tools</p>
          <button
            onClick={() => { setOpen(false); onSetup(); }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors"
          >
            <Wrench className="h-4 w-4" /> Run setup wizard
          </button>
          <button
            onClick={() => { setOpen(false); onTour(); }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors"
          >
            <Compass className="h-4 w-4" /> Start tour
          </button>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-full bg-[#004030] text-[#39FF14] text-[11px] font-bold tracking-wider px-3 py-1.5 shadow-lg ring-1 ring-[#39FF14]/40 hover:ring-[#39FF14] transition"
        aria-expanded={open}
      >
        DEV
      </button>
    </div>
  );
}
