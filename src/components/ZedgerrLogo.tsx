import { cn } from "@/lib/utils";

export function ZedgerrIcon({ className }: { className?: string }) {
  return <img src="/zedgerr-icon.png" alt="Zedgerr" className={className} draggable={false} />;
}

const SIZES = {
  sm: { h: "h-6", text: "text-lg" },
  md: { h: "h-8", text: "text-xl" },
  lg: { h: "h-11", text: "text-3xl" },
} as const;

export function ZedgerrLogo({ collapsed = false, size = "md" }: { collapsed?: boolean; size?: keyof typeof SIZES }) {
  const s = SIZES[size];
  if (collapsed) return <ZedgerrIcon className={cn(s.h, "w-auto")} />;

  return (
    <>
      <img src="/zedgerr-logo.png" alt="Zedgerr" className={cn(s.h, "w-auto dark:hidden")} draggable={false} />
      {/* The wordmark artwork has dark text, so dark mode pairs the icon with live text. */}
      <span className="hidden dark:flex items-center gap-2 select-none">
        <ZedgerrIcon className={cn(s.h, "w-auto")} />
        <span className={cn(s.text, "font-extrabold tracking-tight text-white")}>Zedgerr</span>
      </span>
    </>
  );
}
