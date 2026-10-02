import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export interface TaxSettings {
  taxName: string;
  defaultRate: number;
  currency: string;
  currencySymbol: string;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: "€", USD: "$", GBP: "£", AUD: "A$", CAD: "C$", NZD: "NZ$",
  CHF: "CHF", SEK: "kr", NOK: "kr", DKK: "kr", JPY: "¥", INR: "₹",
  BRL: "R$", MXN: "$", SGD: "S$", HKD: "HK$", ZAR: "R",
};

export function currencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] ?? code;
}

export function useTaxSettings(): TaxSettings {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["business-settings"],
    queryFn: () => api<{ tax_name?: string; default_tax_rate?: number; currency?: string }>("/api/business-settings"),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const currency = data?.currency ?? "EUR";
  return {
    taxName: data?.tax_name ?? "VAT",
    defaultRate: data?.default_tax_rate ?? 20,
    currency,
    currencySymbol: currencySymbol(currency),
  };
}
