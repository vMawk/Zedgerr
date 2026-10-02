import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { presetFor, type TaxPreset } from "@/lib/tax-presets";

export interface TaxSettings {
  taxName: string;
  defaultRate: number;
  currency: string;
  currencySymbol: string;
  countryCode: string | null;
  preset: TaxPreset;
  taxIdLabel: string;
  companyIdLabel: string;
  isEu: boolean;
  mileageRate: number;
  distanceUnit: "km" | "mi";
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: "€", USD: "$", GBP: "£", AUD: "A$", CAD: "C$", NZD: "NZ$",
  CHF: "CHF", SEK: "kr", NOK: "kr", DKK: "kr", JPY: "¥", INR: "₹",
  BRL: "R$", MXN: "$", SGD: "S$", HKD: "HK$", ZAR: "R",
  PLN: "zł", CZK: "Kč", HUF: "Ft", RON: "lei", BGN: "лв", AED: "AED",
};

export const SUPPORTED_CURRENCIES = Object.keys(CURRENCY_SYMBOLS).sort();

export function currencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] ?? code;
}

export function useBusinessSettings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["business-settings"],
    queryFn: () => api.getBusinessSettings(),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTaxSettings(): TaxSettings {
  const { data } = useBusinessSettings();
  const preset = presetFor(data?.country_code);
  const currency = data?.currency ?? preset.currency ?? "EUR";
  return {
    taxName: data?.tax_name ?? preset.taxName,
    defaultRate: data?.default_tax_rate ?? preset.standardRate,
    currency,
    currencySymbol: currencySymbol(currency),
    countryCode: data?.country_code ?? null,
    preset,
    taxIdLabel: preset.taxIdLabel,
    companyIdLabel: preset.companyIdLabel,
    isEu: Boolean(preset.eu),
    mileageRate: Number(data?.mileage_rate ?? 0),
    distanceUnit: data?.distance_unit === "mi" ? "mi" : "km",
  };
}
