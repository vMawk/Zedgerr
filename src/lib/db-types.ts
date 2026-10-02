export type InvoiceType = "business" | "private" | "reverse_charge";

/** Row types returned by the API. */

export type Company = {
  id: string;
  user_id: string;
  /** Set by the API when the client portal is enabled for this company. */
  has_portal?: boolean;
  name: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  kvk_number: string | null;
  btw_number: string | null;
  default_hourly_rate: number | null;
  advance_balance: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type TimeEntry = {
  id: string;
  user_id: string;
  company_id: string;
  invoice_id: string | null;
  date: string;
  hours: number;
  hourly_rate: number | null;
  description: string | null;
  invoiced: boolean;
  created_at: string;
  updated_at: string;
};

export type Invoice = {
  id: string;
  user_id: string;
  company_id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  status: string;
  subtotal: number;
  btw_percentage: number;
  btw_amount: number;
  total: number;
  advance_payment: number;
  /** Tekst op PDF: krediet of voorschot (default krediet als ontbreekt) */
  advance_label?: "krediet" | "voorschot";
  notes: string | null;
  invoice_type: InvoiceType;
  payment_method: "overboeking" | "contant";
  is_credit_note: boolean;
  credit_note_for_id: string | null;
  created_at: string;
  updated_at: string;
};

export type MileageEntry = {
  id: string;
  user_id: string;
  date: string;
  from_location: string | null;
  to_location: string | null;
  odometer_start: number | null;
  odometer_end: number | null;
  distance_km: number;
  purpose: string;
  is_private: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Attachment = {
  id: string;
  user_id: string;
  entity_type: string;
  entity_id: string;
  filename: string;
  content_type: string | null;
  r2_key: string;
  size_bytes: number | null;
  created_at: string;
};

export type InvoiceLine = {
  id: string;
  invoice_id: string;
  time_entry_id: string | null;
  description: string;
  date: string | null;
  hours: number | null;
  hourly_rate: number | null;
  amount: number;
  created_at: string;
};

export type BusinessSettings = {
  id: string;
  user_id: string;
  company_name: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  kvk_number: string | null;
  btw_number: string | null;
  iban: string | null;
  private_name: string | null;
  private_street: string | null;
  private_postal_code: string | null;
  private_city: string | null;
  private_country: string | null;
  logo_url: string | null;
  tax_name: string | null;
  default_tax_rate: number | null;
  currency: string | null;
  country_code: string | null;
  mileage_rate: number | null;
  distance_unit: string | null;
  created_at: string;
  updated_at: string;
};

export type Quote = {
  id: string;
  user_id: string;
  company_id: string;
  quote_number: string;
  quote_date: string;
  valid_until: string | null;
  status: string;
  subtotal: number;
  btw_percentage: number;
  btw_amount: number;
  total: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type QuoteLine = {
  id: string;
  quote_id: string;
  description: string;
  hours: number | null;
  hourly_rate: number | null;
  amount: number;
  created_at: string;
};

export type Service = {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  created_at: string;
  updated_at: string;
};

export type DailyNote = {
  id: string;
  note_date: string;
  content: string;
  updated_at: string | null;
};

export type Subscription = {
  id: string;
  user_id: string;
  name: string;
  category: "prive" | "zakelijk";
  contract_number: string | null;
  amount: number;
  billing_cycle: "maandelijks" | "jaarlijks" | "kwartaal" | "halfjaarlijks" | "wekelijks";
  payment_method: string | null;
  contract_end_date: string | null;
  next_payment_date: string | null;
  notes: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
};

export type SubscriptionPayment = {
  id: string;
  subscription_id: string;
  user_id: string;
  period_date: string;
  amount: number;
  paid: boolean;
  paid_at: string | null;
  created_at: string;
};

export type CompanyProduct = {
  id: string;
  user_id: string;
  company_id: string;
  name: string;
  serial_number: string | null;
  url: string | null;
  internal_notes: string | null;
  sale_price: number;
  price_includes_vat: boolean;
  vat_percentage: number;
  cost_price: number | null;
  created_at: string;
  updated_at: string;
};

export type LeadStatus =
  | "new"
  | "emailed"
  | "received_answer"
  | "no_response"
  | "follow_up"
  | "converted"
  | "rejected";

export type Expense = {
  id: string;
  user_id: string;
  date: string;
  supplier: string | null;
  description: string;
  category: string;
  amount_excl_vat: number;
  vat_percentage: number;
  vat_amount: number;
  amount_incl_vat: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type BankTransactionType =
  | "inkomst"
  | "uitgave"
  | "prive_storting"
  | "prive_onttrekking"
  | "beginstand"
  | "overig";

export type BankTransaction = {
  id: string;
  user_id: string;
  date: string;
  description: string;
  amount: number;
  type: BankTransactionType;
  notes: string | null;
  created_at: string;
};

export type Lead = {
  id: string;
  user_id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  status: LeadStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
