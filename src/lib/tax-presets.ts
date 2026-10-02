// Standard and reduced rates as of 2026. Users can always override the rate in Settings.
export type TaxPreset = {
  code: string;
  name: string;
  currency: string;
  taxName: string;
  standardRate: number;
  reducedRates: number[];
  taxIdLabel: string;
  companyIdLabel: string;
  distanceUnit: "km" | "mi";
  eu?: boolean;
  regions?: { name: string; taxName: string; rate: number }[];
  note?: string;
};

const eu = (
  code: string,
  name: string,
  standardRate: number,
  reducedRates: number[],
  companyIdLabel = "Company registration no.",
  currency = "EUR",
): TaxPreset => ({
  code, name, currency, taxName: "VAT", standardRate, reducedRates,
  taxIdLabel: "VAT number", companyIdLabel, distanceUnit: "km", eu: true,
});

export const TAX_PRESETS: TaxPreset[] = [
  eu("AT", "Austria", 20, [10, 13], "Company register no. (FN)"),
  eu("BE", "Belgium", 21, [6, 12], "Enterprise number"),
  eu("BG", "Bulgaria", 20, [9], "UIC", "BGN"),
  eu("HR", "Croatia", 25, [5, 13], "OIB"),
  eu("CY", "Cyprus", 19, [3, 5, 9]),
  eu("CZ", "Czechia", 21, [12], "IČO", "CZK"),
  eu("DK", "Denmark", 25, [], "CVR number", "DKK"),
  eu("EE", "Estonia", 24, [9, 13], "Registry code"),
  eu("FI", "Finland", 25.5, [10, 13.5], "Business ID (Y-tunnus)"),
  eu("FR", "France", 20, [2.1, 5.5, 10], "SIRET"),
  eu("DE", "Germany", 19, [7], "Commercial register no."),
  eu("GR", "Greece", 24, [6, 13], "GEMI number"),
  eu("HU", "Hungary", 27, [5, 18], "Company registration no.", "HUF"),
  eu("IE", "Ireland", 23, [9, 13.5], "CRO number"),
  eu("IT", "Italy", 22, [4, 5, 10], "REA number"),
  eu("LV", "Latvia", 21, [5, 12]),
  eu("LT", "Lithuania", 21, [5, 12]),
  eu("LU", "Luxembourg", 17, [3, 8, 14], "RCS number"),
  eu("MT", "Malta", 18, [5, 7, 12]),
  eu("NL", "Netherlands", 21, [9], "KvK number"),
  eu("PL", "Poland", 23, [5, 8], "KRS / REGON", "PLN"),
  eu("PT", "Portugal", 23, [6, 13], "NIPC"),
  eu("RO", "Romania", 21, [11], "Trade register no.", "RON"),
  eu("SK", "Slovakia", 23, [5, 19], "IČO"),
  eu("SI", "Slovenia", 22, [5, 9.5]),
  eu("ES", "Spain", 21, [4, 10], "NIF / CIF"),
  eu("SE", "Sweden", 25, [6, 12], "Organisation number", "SEK"),
  {
    code: "GB", name: "United Kingdom", currency: "GBP", taxName: "VAT", standardRate: 20, reducedRates: [5, 0],
    taxIdLabel: "VAT number", companyIdLabel: "Company number", distanceUnit: "mi",
    note: "You only need to charge VAT once you are VAT-registered.",
  },
  {
    code: "CH", name: "Switzerland", currency: "CHF", taxName: "VAT", standardRate: 8.1, reducedRates: [2.6, 3.8],
    taxIdLabel: "VAT number (UID)", companyIdLabel: "UID", distanceUnit: "km",
  },
  {
    code: "NO", name: "Norway", currency: "NOK", taxName: "VAT", standardRate: 25, reducedRates: [12, 15],
    taxIdLabel: "VAT number (MVA)", companyIdLabel: "Organisation number", distanceUnit: "km",
  },
  {
    code: "US", name: "United States", currency: "USD", taxName: "Sales tax", standardRate: 0, reducedRates: [],
    taxIdLabel: "Sales tax permit no.", companyIdLabel: "EIN", distanceUnit: "mi",
    note: "Most states don't tax freelance services. Check your state's rules and enter its rate if you need to charge sales tax.",
  },
  {
    code: "CA", name: "Canada", currency: "CAD", taxName: "GST", standardRate: 5, reducedRates: [],
    taxIdLabel: "GST/HST number", companyIdLabel: "Business number (BN)", distanceUnit: "km",
    regions: [
      { name: "Alberta", taxName: "GST", rate: 5 },
      { name: "British Columbia", taxName: "GST + PST", rate: 12 },
      { name: "Manitoba", taxName: "GST + RST", rate: 12 },
      { name: "New Brunswick", taxName: "HST", rate: 15 },
      { name: "Newfoundland and Labrador", taxName: "HST", rate: 15 },
      { name: "Northwest Territories", taxName: "GST", rate: 5 },
      { name: "Nova Scotia", taxName: "HST", rate: 14 },
      { name: "Nunavut", taxName: "GST", rate: 5 },
      { name: "Ontario", taxName: "HST", rate: 13 },
      { name: "Prince Edward Island", taxName: "HST", rate: 15 },
      { name: "Quebec", taxName: "GST + QST", rate: 14.975 },
      { name: "Saskatchewan", taxName: "GST + PST", rate: 11 },
      { name: "Yukon", taxName: "GST", rate: 5 },
    ],
  },
  {
    code: "AU", name: "Australia", currency: "AUD", taxName: "GST", standardRate: 10, reducedRates: [0],
    taxIdLabel: "ABN", companyIdLabel: "ACN", distanceUnit: "km",
    note: "Charge GST once you are registered (required from A$75,000 turnover).",
  },
  {
    code: "NZ", name: "New Zealand", currency: "NZD", taxName: "GST", standardRate: 15, reducedRates: [0],
    taxIdLabel: "GST number", companyIdLabel: "NZBN", distanceUnit: "km",
  },
  {
    code: "SG", name: "Singapore", currency: "SGD", taxName: "GST", standardRate: 9, reducedRates: [0],
    taxIdLabel: "GST reg. no.", companyIdLabel: "UEN", distanceUnit: "km",
  },
  {
    code: "JP", name: "Japan", currency: "JPY", taxName: "Consumption tax", standardRate: 10, reducedRates: [8],
    taxIdLabel: "Invoice registration no.", companyIdLabel: "Corporate number", distanceUnit: "km",
  },
  {
    code: "IN", name: "India", currency: "INR", taxName: "GST", standardRate: 18, reducedRates: [5, 0],
    taxIdLabel: "GSTIN", companyIdLabel: "CIN", distanceUnit: "km",
  },
  {
    code: "ZA", name: "South Africa", currency: "ZAR", taxName: "VAT", standardRate: 15, reducedRates: [0],
    taxIdLabel: "VAT number", companyIdLabel: "Company registration no.", distanceUnit: "km",
  },
  {
    code: "AE", name: "United Arab Emirates", currency: "AED", taxName: "VAT", standardRate: 5, reducedRates: [0],
    taxIdLabel: "TRN", companyIdLabel: "Trade licence no.", distanceUnit: "km",
  },
  {
    code: "MX", name: "Mexico", currency: "MXN", taxName: "IVA", standardRate: 16, reducedRates: [0],
    taxIdLabel: "RFC", companyIdLabel: "RFC", distanceUnit: "km",
  },
  {
    code: "BR", name: "Brazil", currency: "BRL", taxName: "ISS", standardRate: 5, reducedRates: [2],
    taxIdLabel: "CNPJ", companyIdLabel: "CNPJ", distanceUnit: "km",
    note: "Service tax (ISS) varies by municipality, usually between 2% and 5%.",
  },
];

export const OTHER_PRESET: TaxPreset = {
  code: "XX", name: "Other country", currency: "USD", taxName: "Tax", standardRate: 0, reducedRates: [],
  taxIdLabel: "Tax number", companyIdLabel: "Company registration no.", distanceUnit: "km",
};

export const SORTED_PRESETS = [...TAX_PRESETS].sort((a, b) => a.name.localeCompare(b.name));

export function presetFor(code: string | null | undefined): TaxPreset {
  return TAX_PRESETS.find((p) => p.code === code) ?? OTHER_PRESET;
}

export function rateOptions(preset: TaxPreset, current: number): number[] {
  return [...new Set([preset.standardRate, ...preset.reducedRates, 0, current])]
    .filter((r) => Number.isFinite(r))
    .sort((a, b) => b - a);
}

export const REVERSE_CHARGE_NOTE = "Reverse charge: VAT to be accounted for by the recipient (Article 196, Council Directive 2006/112/EC).";

const IBAN_COUNTRIES = new Set(["GB", "CH", "NO", "AE"]);

export function bankAccountLabel(code: string | null | undefined): { label: string; placeholder: string } {
  const preset = presetFor(code);
  if (preset.eu || IBAN_COUNTRIES.has(preset.code)) return { label: "IBAN", placeholder: "e.g. NL91 ABNA 0417 1643 00" };
  switch (preset.code) {
    case "US": return { label: "Bank account (routing and account number)", placeholder: "e.g. 021000021 / 123456789" };
    case "CA": return { label: "Bank account (institution, transit, account)", placeholder: "e.g. 001-12345-1234567" };
    case "AU": return { label: "Bank account (BSB and account number)", placeholder: "e.g. 062-000 12345678" };
    case "NZ": return { label: "Bank account number", placeholder: "e.g. 12-3456-7890123-00" };
    case "IN": return { label: "Bank account (account number and IFSC)", placeholder: "e.g. 1234567890 / HDFC0001234" };
    default: return { label: "Bank account", placeholder: "Account number, IBAN or payment details" };
  }
}
