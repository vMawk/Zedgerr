import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Building2, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ZedgerrIcon } from "@/components/ZedgerrLogo";

type TourStep = {
  target?: string;
  route?: string;
  title: string;
  body: string;
};

const STEPS: TourStep[] = [
  {
    title: "Let's take a quick look around",
    body: "Nine stops, about a minute. Use the arrow keys or the buttons below, and press Esc to leave at any time.",
  },
  {
    target: "nav-dashboard", route: "/", title: "Dashboard",
    body: "Your home base: revenue received, outstanding invoices, bank balance and the tax you owe this quarter.",
  },
  {
    target: "nav-invoices", route: "/invoices", title: "Invoices",
    body: "Create invoices from logged hours or products, export them as PDF and follow them from Draft to Sent to Paid.",
  },
  {
    target: "nav-companies", route: "/companies", title: "Companies",
    body: "Your clients, with contact details, default hourly rate and optional access to the client portal.",
  },
  {
    target: "nav-time", route: "/time", title: "Time",
    body: "Log hours per client. Unbilled hours can be turned into an invoice with one click.",
  },
  {
    target: "nav-expenses", route: "/expenses", title: "Expenses",
    body: "Record purchases and attach receipts. The tax you paid is deducted from what you owe automatically.",
  },
  {
    target: "nav-bank", route: "/bank", title: "Bank",
    body: "Import a CSV export from your bank and match each transaction to an invoice or expense.",
  },
  {
    target: "nav-reports", route: "/reports", title: "Reports",
    body: "Hours and revenue per client and period, ready to export.",
  },
  {
    target: "nav-more", title: "More",
    body: "Accounting, financial statements, quotes, your tax summary, subscriptions, leads, products, mileage and notes.",
  },
  {
    target: "nav-settings", route: "/settings", title: "Settings",
    body: "Business details, tax, team members and email setup. Configure SMTP under Notifications so invite emails go out automatically. Restart this tour any time from your profile menu.",
  },
  {
    title: "You're all set",
    body: "Most people start by adding a client and sending their first invoice.",
  },
];

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 6;
const CARD_W = 340;

export function SpotlightTour({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;

  useEffect(() => {
    if (step.route) navigate(step.route);
  }, [index, step.route, navigate]);

  // Nav items change width when they become active, so keep measuring every frame.
  useEffect(() => {
    let frame = 0;
    let last = "";
    const measure = () => {
      const el = step.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null;
      const r = el?.getBoundingClientRect();
      const next = r && r.width > 0 ? { top: r.top, left: r.left, width: r.width, height: r.height } : null;
      const key = JSON.stringify(next);
      if (key !== last) {
        last = key;
        setRect(next);
      }
      frame = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(frame);
  }, [step.target]);

  const next = useCallback(() => {
    if (isLast) onClose();
    else setIndex((i) => i + 1);
  }, [isLast, onClose]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, back, onClose]);

  const finish = (to: string) => {
    onClose();
    navigate(to);
  };

  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const cardLeft = rect
    ? Math.min(Math.max(rect.left + rect.width / 2 - CARD_W / 2, 16), vw - CARD_W - 16)
    : undefined;
  const arrowLeft = rect && cardLeft !== undefined
    ? Math.min(Math.max(rect.left + rect.width / 2 - cardLeft - 7, 20), CARD_W - 34)
    : 0;

  return (
    <motion.div
      className="fixed inset-0 z-[60]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      role="dialog"
      aria-modal="true"
      aria-label="Product tour"
    >
      {/* Blocks clicks on the app underneath */}
      <div className="absolute inset-0" />

      {rect ? (
        <motion.div
          className="absolute rounded-lg pointer-events-none ring-2 ring-[#39FF14]"
          style={{ boxShadow: "0 0 0 9999px rgba(0, 20, 14, 0.62), 0 0 24px 2px rgba(57, 255, 20, 0.45)" }}
          initial={false}
          animate={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
          }}
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
        />
      ) : (
        <div className="absolute inset-0 bg-[rgba(0,20,14,0.62)] backdrop-blur-[2px]" />
      )}

      <motion.div
          key={index}
          className={
            rect
              ? "absolute"
              : "absolute inset-0 flex items-center justify-center p-4 pointer-events-none"
          }
          style={rect ? { top: rect.top + rect.height + PAD + 14, left: cardLeft, width: CARD_W } : undefined}
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          <div
            className={`relative pointer-events-auto bg-card text-card-foreground border border-border rounded-xl shadow-2xl ${
              rect ? "w-full" : "w-full max-w-md"
            }`}
          >
            {rect && (
              <span
                className="absolute -top-[7px] h-3.5 w-3.5 rotate-45 bg-card border-l border-t border-border"
                style={{ left: arrowLeft }}
              />
            )}

            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  {!rect && <ZedgerrIcon className="h-9 w-9" />}
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground tabular-nums">
                      {index === 0 ? "Tour" : isLast ? "Done" : `Step ${index} of ${STEPS.length - 2}`}
                    </p>
                    <h3 className="text-base font-bold tracking-tight">{step.title}</h3>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-1 -m-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  aria-label="Close tour"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{step.body}</p>

              {isLast ? (
                <div className="mt-5 grid gap-2">
                  <Button onClick={() => finish("/companies")} className="justify-start">
                    <Building2 /> Add your first client
                  </Button>
                  <Button variant="outline" onClick={() => finish("/invoices")} className="justify-start">
                    <FileText /> Create an invoice
                  </Button>
                  <Button variant="ghost" onClick={() => finish("/")}>Explore on my own</Button>
                </div>
              ) : (
                <div className="mt-5 flex items-center justify-between gap-3">
                  <div className="flex gap-1">
                    {STEPS.slice(1, -1).map((_, i) => (
                      <span
                        key={i}
                        className={`h-1.5 rounded-full transition-all duration-300 ${
                          i + 1 === index ? "w-4 bg-[#39FF14]" : i + 1 < index ? "w-1.5 bg-primary/60" : "w-1.5 bg-muted"
                        }`}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    {index > 0 && (
                      <Button variant="ghost" size="sm" onClick={back} aria-label="Previous step">
                        <ArrowLeft />
                      </Button>
                    )}
                    <Button size="sm" onClick={next}>
                      {index === 0 ? "Start" : "Next"} <ArrowRight />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
    </motion.div>
  );
}
