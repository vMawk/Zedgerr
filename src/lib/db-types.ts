/** Types voor D1 / SQLite (Worker API). */

export type Company = {
  id: string;
  user_id: string;
  name: string;
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
  notes: string | null;
  created_at: string;
  updated_at: string;
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
  logo_url: string | null;
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
