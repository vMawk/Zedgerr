import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Database } from "@/integrations/supabase/types";

type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
type InvoiceLine = Database["public"]["Tables"]["invoice_lines"]["Row"];
type BusinessSettings = Database["public"]["Tables"]["business_settings"]["Row"];
type Company = Database["public"]["Tables"]["companies"]["Row"];

export function generateInvoicePDF(
  invoice: Invoice,
  lines: InvoiceLine[],
  settings: BusinessSettings | null,
  company: Company | null
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header - own business info
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text(settings?.company_name || "Mijn Bedrijf", 20, 30);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const ownInfo = [
    settings?.street,
    [settings?.postal_code, settings?.city].filter(Boolean).join(" "),
    settings?.email,
    settings?.phone,
    settings?.kvk_number ? `KvK: ${settings.kvk_number}` : null,
    settings?.btw_number ? `BTW: ${settings.btw_number}` : null,
  ].filter(Boolean);
  ownInfo.forEach((line, i) => doc.text(line as string, 20, 38 + i * 4.5));

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

  // Client info
  const clientY = 75;
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

  // Totals
  const finalY = (doc as any).lastAutoTable.finalY + 10;
  const rightX = pageWidth - 20;

  doc.setFontSize(10);
  doc.text("Subtotaal:", rightX - 40, finalY);
  doc.text(`€${Number(invoice.subtotal).toFixed(2)}`, rightX, finalY, { align: "right" });

  doc.text(`BTW (${Number(invoice.btw_percentage)}%):`, rightX - 40, finalY + 6);
  doc.text(`€${Number(invoice.btw_amount).toFixed(2)}`, rightX, finalY + 6, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Totaal:", rightX - 40, finalY + 14);
  doc.text(`€${Number(invoice.total).toFixed(2)}`, rightX, finalY + 14, { align: "right" });

  // Payment info
  if (settings?.iban) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Gelieve te betalen op IBAN: ${settings.iban}`, 20, finalY + 30);
    doc.text(`o.v.v. factuurnummer ${invoice.invoice_number}`, 20, finalY + 35);
  }

  doc.save(`${invoice.invoice_number}.pdf`);
}
