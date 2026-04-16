import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { BusinessSettings, Company, Invoice, InvoiceLine, Quote, QuoteLine } from "@/lib/db-types";

/** Gibby.it wordmark — same asset as in the app (`public/gibby-logo.png`). */
async function loadInvoiceLogo(): Promise<{ dataUrl: string; wMm: number; hMm: number } | null> {
  try {
    const res = await fetch("/gibby-logo.png");
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => reject(new Error("logo image load failed"));
      img.src = dataUrl;
    });
    const maxW = 48;
    const maxH = 16;
    let wMm = maxW;
    let hMm = (dims.h / dims.w) * maxW;
    if (hMm > maxH) {
      hMm = maxH;
      wMm = (dims.w / dims.h) * maxH;
    }
    return { dataUrl, wMm, hMm };
  } catch {
    return null;
  }
}

export async function generateInvoicePDF(
  invoice: Invoice,
  lines: InvoiceLine[],
  settings: BusinessSettings | null,
  company: Company | null
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  const isPrivate = invoice.invoice_type === "private";
  const logo = isPrivate ? null : await loadInvoiceLogo();
  const ownInfo = isPrivate
    ? [
        settings?.private_name,
        settings?.private_street,
        [settings?.private_postal_code, settings?.private_city].filter(Boolean).join(" "),
        settings?.private_country,
      ].filter(Boolean)
    : [
        settings?.street,
        [settings?.postal_code, settings?.city].filter(Boolean).join(" "),
        settings?.email,
        settings?.phone,
        settings?.kvk_number ? `KvK: ${settings.kvk_number}` : null,
        settings?.btw_number ? `BTW: ${settings.btw_number}` : null,
      ].filter(Boolean);

  // Header — logo + own business info (geen merk-/bedrijfsnaamtekst)
  const logoTop = 14;
  if (logo) {
    doc.addImage(logo.dataUrl, "PNG", 20, logoTop, logo.wMm, logo.hMm);
  }

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const yOwnStart = logo ? logoTop + (logo?.hMm ?? 0) + 10 : 30;
  ownInfo.forEach((line, i) => doc.text(line as string, 20, yOwnStart + i * 4.5));

  // Invoice title
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.text("FACTUUR", pageWidth - 20, 30, { align: "right" });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Factuurnummer: ${invoice.invoice_number}`, pageWidth - 20, 40, { align: "right" });
  doc.text(`Datum: ${new Date(invoice.invoice_date).toLocaleDateString("nl-NL")}`, pageWidth - 20, 46, { align: "right" });
  if (invoice.due_date) {
    doc.text(`Vervaldatum: ${new Date(invoice.due_date).toLocaleDateString("nl-NL")}`, pageWidth - 20, 52, { align: "right" });
  }
  if (invoice.status === "betaald") {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("BETAALD", pageWidth - 20, 60, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
  }

  // Client info
  const clientY = yOwnStart + ownInfo.length * 4.5 + 15;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Factuur aan:", 20, clientY);
  doc.setFont("helvetica", "normal");
  const clientInfo = [
    company?.name,
    company?.contact_person ? `t.a.v. ${company.contact_person}` : null,
    company?.street,
    [company?.postal_code, company?.city].filter(Boolean).join(" "),
    company?.btw_number ? `BTW: ${company.btw_number}` : null,
  ].filter(Boolean);
  clientInfo.forEach((line, i) => doc.text(line as string, 20, clientY + 6 + i * 5));

  // Table
  const tableData = lines.map((line) => [
    line.date ? new Date(line.date).toLocaleDateString("nl-NL") : "",
    line.description,
    line.hours ? Number(line.hours).toFixed(2) : "",
    line.hourly_rate ? `€${Number(line.hourly_rate).toFixed(2)}` : "",
    `€${Number(line.amount).toFixed(2)}`,
  ]);

  autoTable(doc, {
    startY: clientY + 6 + clientInfo.length * 5 + 10,
    head: [["Datum", "Omschrijving", "Uren", "Tarief", "Bedrag"]],
    body: tableData,
    theme: "plain",
    headStyles: { fillColor: [245, 245, 245], textColor: [60, 60, 60], fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 25 },
      2: { cellWidth: 20, halign: "right" },
      3: { cellWidth: 25, halign: "right" },
      4: { cellWidth: 25, halign: "right" },
    },
  });

  // Totals (sequentieel opgebouwd om overlap te voorkomen)
  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  const rightX = pageWidth - 20;
  const labelX = rightX - 70;
  const lineHeight = 6;
  let totalsY = finalY;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  if (!isPrivate) {
    doc.text("Subtotaal:", labelX, totalsY);
    doc.text(`€${Number(invoice.subtotal).toFixed(2)}`, rightX, totalsY, { align: "right" });
    totalsY += lineHeight;
    doc.text(`BTW (${Number(invoice.btw_percentage)}%):`, labelX, totalsY);
    doc.text(`€${Number(invoice.btw_amount).toFixed(2)}`, rightX, totalsY, { align: "right" });
    totalsY += lineHeight + 2;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(isPrivate ? "Totaal (all-in):" : "Totaal:", labelX, totalsY);
  doc.text(`€${Number(invoice.total).toFixed(2)}`, rightX, totalsY, { align: "right" });
  totalsY += lineHeight + 2;

  if (isPrivate) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Vrijgesteld van BTW (particulier)", rightX, totalsY, { align: "right" });
    totalsY += lineHeight;
  }

  const rawAdvance = Math.max(0, Number(invoice.advance_payment ?? 0));
  const safeAdvance = Math.min(rawAdvance, Number(invoice.total));
  if (safeAdvance > 0) {
    const rest = Math.max(0, Number(invoice.total) - safeAdvance);
    totalsY += 2;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Reeds verrekend krediet:", labelX, totalsY);
    doc.text(`€${safeAdvance.toFixed(2)}`, rightX, totalsY, { align: "right" });
    totalsY += lineHeight;
    doc.setFont("helvetica", "bold");
    doc.text("Te ontvangen na krediet:", labelX, totalsY);
    doc.text(`€${rest.toFixed(2)}`, rightX, totalsY, { align: "right" });
    totalsY += lineHeight;
  }

  const paymentBlockY = totalsY + 8;

  // Payment info
  if (settings?.iban) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Gelieve te betalen op IBAN: ${settings.iban}`, 20, paymentBlockY);
    doc.text(`o.v.v. factuurnummer ${invoice.invoice_number}`, 20, paymentBlockY + 5);
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

  const logo = await loadInvoiceLogo();

  const ownInfo = [
    settings?.street,
    [settings?.postal_code, settings?.city].filter(Boolean).join(" "),
    settings?.email,
    settings?.phone,
    settings?.kvk_number ? `KvK: ${settings.kvk_number}` : null,
    settings?.btw_number ? `BTW: ${settings.btw_number}` : null,
  ].filter(Boolean);

  const logoTop = 14;
  if (logo) {
    doc.addImage(logo.dataUrl, "PNG", 20, logoTop, logo.wMm, logo.hMm);
  }

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const yOwnStart = logo ? logoTop + (logo?.hMm ?? 0) + 10 : 30;
  ownInfo.forEach((line, i) => doc.text(line as string, 20, yOwnStart + i * 4.5));

  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.text("OFFERTE", pageWidth - 20, 30, { align: "right" });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Offertenummer: ${quote.quote_number}`, pageWidth - 20, 40, { align: "right" });
  doc.text(`Datum: ${new Date(quote.quote_date).toLocaleDateString("nl-NL")}`, pageWidth - 20, 46, { align: "right" });
  if (quote.valid_until) {
    doc.text(`Geldig t/m: ${new Date(quote.valid_until).toLocaleDateString("nl-NL")}`, pageWidth - 20, 52, { align: "right" });
  }

  const clientY = yOwnStart + ownInfo.length * 4.5 + 15;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Offerte aan:", 20, clientY);
  doc.setFont("helvetica", "normal");
  const clientInfo = [
    company?.name,
    company?.contact_person ? `t.a.v. ${company.contact_person}` : null,
    company?.street,
    [company?.postal_code, company?.city].filter(Boolean).join(" "),
    company?.btw_number ? `BTW: ${company.btw_number}` : null,
  ].filter(Boolean);
  clientInfo.forEach((line, i) => doc.text(line as string, 20, clientY + 6 + i * 5));

  const tableData = lines.map((line) => [
    line.description,
    line.hours != null ? Number(line.hours).toFixed(2) : "",
    line.hourly_rate != null ? `€${Number(line.hourly_rate).toFixed(2)}` : "",
    `€${Number(line.amount).toFixed(2)}`,
  ]);

  autoTable(doc, {
    startY: clientY + 6 + clientInfo.length * 5 + 10,
    head: [["Omschrijving", "Uren", "Tarief", "Bedrag"]],
    body: tableData,
    theme: "plain",
    headStyles: { fillColor: [245, 245, 245], textColor: [60, 60, 60], fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: {
      1: { cellWidth: 20, halign: "right" },
      2: { cellWidth: 25, halign: "right" },
      3: { cellWidth: 25, halign: "right" },
    },
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  const rightX = pageWidth - 20;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Subtotaal:", rightX - 40, finalY);
  doc.text(`€${Number(quote.subtotal).toFixed(2)}`, rightX, finalY, { align: "right" });

  doc.text(`BTW (${Number(quote.btw_percentage)}%):`, rightX - 40, finalY + 6);
  doc.text(`€${Number(quote.btw_amount).toFixed(2)}`, rightX, finalY + 6, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Totaal:", rightX - 40, finalY + 14);
  doc.text(`€${Number(quote.total).toFixed(2)}`, rightX, finalY + 14, { align: "right" });

  if (quote.notes) {
    const y = finalY + 30;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Notities", 20, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const wrapped = doc.splitTextToSize(String(quote.notes), pageWidth - 40);
    doc.text(wrapped, 20, y + 6);
  }

  doc.save(`${quote.quote_number}.pdf`);
}
