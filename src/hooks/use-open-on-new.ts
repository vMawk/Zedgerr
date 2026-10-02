import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

/** Opens a create dialog when the page is visited with ?new=1 (used by the command palette). */
export function useOpenOnNew(open: (value: boolean) => void) {
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get("new") !== "1") return;
    open(true);
    const next = new URLSearchParams(params);
    next.delete("new");
    setParams(next, { replace: true });
  }, [params, setParams, open]);
}
