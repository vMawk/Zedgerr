import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { BusinessSettings, Company, Invoice, InvoiceLine, Quote, QuoteLine } from "@/lib/db-types";
import { currencySymbol } from "@/lib/tax";
import { api } from "@/lib/api";
import { REVERSE_CHARGE_NOTE, presetFor, bankAccountLabel } from "@/lib/tax-presets";

// jsPDF's built-in fonts only cover WinAnsi, so symbols like ₹ fall back to the ISO code.
const PDF_SAFE_SYMBOLS = new Set(["€", "$", "£", "¥", "A$", "C$", "NZ$", "S$", "HK$", "R$", "CHF", "kr", "R"]);

function moneyFormatter(settings: BusinessSettings | null) {
  const code = settings?.currency || "EUR";
  const symbol = currencySymbol(code);
  const prefix = PDF_SAFE_SYMBOLS.has(symbol) ? symbol : `${code} `;
  return (n: number) =>
    `${prefix}${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function taxLabel(settings: BusinessSettings | null) {
  return settings?.tax_name && settings.tax_name !== "None" ? settings.tax_name : "Tax";
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString(undefined);
}

function advanceLabels(invoice: Invoice): { received: string; after: string } {
  return invoice.advance_label === "voorschot"
    ? { received: "Advance already received:", after: "Balance due after advance:" }
    : { received: "Credit applied:", after: "Balance due after credit:" };
}

function ownBusinessLines(settings: BusinessSettings | null, tax: string): string[] {
  return [
    settings?.street,
    [settings?.postal_code, settings?.city].filter(Boolean).join(" "),
    settings?.country,
    settings?.email,
    settings?.phone,
    settings?.kvk_number ? `${presetFor(settings.country_code).companyIdLabel}: ${settings.kvk_number}` : null,
    settings?.btw_number ? `${presetFor(settings.country_code).taxIdLabel}: ${settings.btw_number}` : null,
  ].filter((l): l is string => Boolean(l));
}

function clientLines(company: Company | null, tax: string): string[] {
  return [
    company?.name,
    company?.contact_person ? `Attn: ${company.contact_person}` : null,
    company?.street,
    [company?.postal_code, company?.city].filter(Boolean).join(" "),
    company?.country,
    company?.btw_number ? `${tax === "VAT" ? "VAT number" : "Tax number"}: ${company.btw_number}` : null,
  ].filter((l): l is string => Boolean(l));
}

type PdfLogo = { dataUrl: string; format: "PNG" | "JPEG"; w: number; h: number };

async function loadBusinessLogo(settings: BusinessSettings | null): Promise<PdfLogo | null> {
  if (!settings?.logo_url) return null;
  try {
    const blob = await api.getLogoBlob();
    if (!blob) return null;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = reject;
      img.src = dataUrl;
    });
    const maxW = 50;
    const maxH = 18;
    const scale = Math.min(maxW / width, maxH / height);
    return { dataUrl, format: blob.type === "image/png" ? "PNG" : "JPEG", w: width * scale, h: height * scale };
  } catch {
    return null;
  }
}

function drawHeader(doc: jsPDF, name: string | null | undefined, lines: string[], logo: PdfLogo | null = null): number {
  let y = 22;
  if (logo) {
    doc.addImage(logo.dataUrl, logo.format, 20, 14, logo.w, logo.h);
    y = 14 + logo.h + 8;
  } else if (name) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(name, 20, y);
    y += 8;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  lines.forEach((line, i) => doc.text(line, 20, y + i * 4.5));
  return y + lines.length * 4.5;
}

export async function generateInvoicePDF(
  invoice: Invoice,
  lines: InvoiceLine[],
  settings: BusinessSettings | null,
  company: Company | null,
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const money = moneyFormatter(settings);
  const tax = taxLabel(settings);
  const isPrivate = invoice.invoice_type === "private";
  const isReverseCharge = invoice.invoice_type === "reverse_charge";
  const isCreditNote = Boolean(invoice.is_credit_note);

  const headerEnd = isPrivate
    ? drawHeader(doc, settings?.private_name, [
        settings?.private_street,
        [settings?.private_postal_code, settings?.private_city].filter(Boolean).join(" "),
        settings?.private_country,
      ].filter((l): l is string => Boolean(l)))
    : drawHeader(doc, settings?.company_name, ownBusinessLines(settings, tax), await loadBusinessLogo(settings));

  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.text(isCreditNote ? "CREDIT NOTE" : "INVOICE", pageWidth - 20, 30, { align: "right" });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`${isCreditNote ? "Credit note no." : "Invoice no."}: ${invoice.invoice_number}`, pageWidth - 20, 40, { align: "right" });
  doc.text(`Date: ${fmtDate(invoice.invoice_date)}`, pageWidth - 20, 46, { align: "right" });
  if (invoice.due_date) {
    doc.text(`Due date: ${fmtDate(invoice.due_date)}`, pageWidth - 20, 52, { align: "right" });
  }
  if (invoice.status === "betaald") {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("PAID", pageWidth - 20, 60, { align: "right" });
  }

  const clientY = Math.max(headerEnd, 60) + 12;
  const client = clientLines(company, tax);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(isCreditNote ? "Credit note to:" : "Bill to:", 20, clientY);
  doc.setFont("helvetica", "normal");
  client.forEach((line, i) => doc.text(line, 20, clientY + 6 + i * 5));

  autoTable(doc, {
    startY: clientY + 6 + client.length * 5 + 10,
    head: [["Date", "Description", "Hours", "Rate", "Amount"]],
    body: lines.map((line) => [
      line.date ? fmtDate(line.date) : "",
      line.description,
      line.hours ? Number(line.hours).toFixed(2) : "",
      line.hourly_rate ? money(Number(line.hourly_rate)) : "",
      money(Number(line.amount)),
    ]),
    theme: "plain",
    headStyles: { fillColor: [245, 245, 245], textColor: [60, 60, 60], fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 25 },
      2: { cellWidth: 20, halign: "right" },
      3: { cellWidth: 28, halign: "right" },
      4: { cellWidth: 28, halign: "right" },
    },
  });

  const rightX = pageWidth - 20;
  const labelX = rightX - 75;
  const lineHeight = 6;
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  if (!isPrivate) {
    doc.text("Subtotal:", labelX, y);
    doc.text(money(Number(invoice.subtotal)), rightX, y, { align: "right" });
    y += lineHeight;
    doc.text(isReverseCharge ? `${tax} (reverse charge):` : `${tax} (${Number(invoice.btw_percentage)}%):`, labelX, y);
    doc.text(money(Number(invoice.btw_amount)), rightX, y, { align: "right" });
    y += lineHeight + 2;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Total:", labelX, y);
  doc.text(money(Number(invoice.total)), rightX, y, { align: "right" });
  y += lineHeight + 2;

  if (isPrivate) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`${tax} exempt (private individual)`, rightX, y, { align: "right" });
    y += lineHeight;
  }

  if (isReverseCharge) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const wrapped = doc.splitTextToSize(REVERSE_CHARGE_NOTE, pageWidth - 40);
    doc.text(wrapped, 20, y + 2);
    y += wrapped.length * 4.5 + 2;
  }

  const advance = Math.min(Math.max(0, Number(invoice.advance_payment ?? 0)), Number(invoice.total));
  if (advance > 0) {
    const labels = advanceLabels(invoice);
    y += 2;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(labels.received, labelX, y);
    doc.text(money(advance), rightX, y, { align: "right" });
    y += lineHeight;
    doc.setFont("helvetica", "bold");
    doc.text(labels.after, labelX, y);
    doc.text(money(Math.max(0, Number(invoice.total) - advance)), rightX, y, { align: "right" });
    y += lineHeight;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  y += 8;
  if (invoice.payment_method === "contant") {
    doc.text("Payment method: cash", 20, y);
  } else if (settings?.iban) {
    doc.text(`Please pay to ${bankAccountLabel(settings.country_code).label === "IBAN" ? "IBAN" : "account"}: ${settings.iban}`, 20, y);
    doc.text(`Reference: ${invoice.invoice_number}`, 20, y + 5);
  }

  doc.save(`${invoice.invoice_number}.pdf`);
}

export async function generateQuotePDF(
  quote: Quote,
  lines: QuoteLine[],
  settings: BusinessSettings | null,
  company: Company | null,
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const money = moneyFormatter(settings);
  const tax = taxLabel(settings);

  const headerEnd = drawHeader(doc, settings?.company_name, ownBusinessLines(settings, tax), await loadBusinessLogo(settings));

  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.text("QUOTE", pageWidth - 20, 30, { align: "right" });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Quote no.: ${quote.quote_number}`, pageWidth - 20, 40, { align: "right" });
  doc.text(`Date: ${fmtDate(quote.quote_date)}`, pageWidth - 20, 46, { align: "right" });
  if (quote.valid_until) {
    doc.text(`Valid until: ${fmtDate(quote.valid_until)}`, pageWidth - 20, 52, { align: "right" });
  }

  const clientY = Math.max(headerEnd, 60) + 12;
  const client = clientLines(company, tax);
  doc.setFont("helvetica", "bold");
  doc.text("Quote for:", 20, clientY);
  doc.setFont("helvetica", "normal");
  client.forEach((line, i) => doc.text(line, 20, clientY + 6 + i * 5));

  autoTable(doc, {
    startY: clientY + 6 + client.length * 5 + 10,
    head: [["Description", "Hours", "Rate", "Amount"]],
    body: lines.map((line) => [
      line.description,
      line.hours != null ? Number(line.hours).toFixed(2) : "",
      line.hourly_rate != null ? money(Number(line.hourly_rate)) : "",
      money(Number(line.amount)),
    ]),
    theme: "plain",
    headStyles: { fillColor: [245, 245, 245], textColor: [60, 60, 60], fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: {
      1: { cellWidth: 20, halign: "right" },
      2: { cellWidth: 28, halign: "right" },
      3: { cellWidth: 28, halign: "right" },
    },
  });

  const rightX = pageWidth - 20;
  const labelX = rightX - 60;
  const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Subtotal:", labelX, y);
  doc.text(money(Number(quote.subtotal)), rightX, y, { align: "right" });
  doc.text(`${tax} (${Number(quote.btw_percentage)}%):`, labelX, y + 6);
  doc.text(money(Number(quote.btw_amount)), rightX, y + 6, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Total:", labelX, y + 14);
  doc.text(money(Number(quote.total)), rightX, y + 14, { align: "right" });

  if (quote.notes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Notes", 20, y + 30);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(doc.splitTextToSize(String(quote.notes), pageWidth - 40), 20, y + 36);
  }

  doc.save(`${quote.quote_number}.pdf`);
}
