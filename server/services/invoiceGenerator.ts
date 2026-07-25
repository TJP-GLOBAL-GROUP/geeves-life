/**
 * Invoice Generator — creates a PDF invoice for a direct property booking
 * and uploads it to S3, returning the public URL.
 */
import PDFDocument from "pdfkit";
import { storagePut } from "../storage";
import { nanoid } from "nanoid";

export interface InvoiceData {
  bookingId: string;
  propertyName: string;
  propertyAddress?: string | null;
  guestName: string;
  guestEmail?: string | null;
  guestPhone?: string | null;
  checkIn: number; // Unix ms
  checkOut: number; // Unix ms
  nights: number;
  totalPrice?: number | null;
  cleaningFee?: number | null;
  commissionAmount?: number | null;
  netAmount?: number | null;
  currency: string;
  guestCount?: number | null;
  notes?: string | null;
  invoiceNumber: string;
  issuedAt: number; // Unix ms
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatCurrency(amount: number | null | undefined, currency: string): string {
  if (amount == null) return "—";
  return `${currency} ${Number(amount).toFixed(2)}`;
}

export async function generateBookingInvoicePDF(data: InvoiceData): Promise<string> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "LETTER" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", async () => {
      try {
        const pdfBuffer = Buffer.concat(chunks);
        const fileKey = `invoices/${data.bookingId}-${nanoid(6)}.pdf`;
        const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");
        resolve(url);
      } catch (err) {
        reject(err);
      }
    });

    const BRAND_DARK = "#0f172a";
    const BRAND_ACCENT = "#6366f1";
    const GRAY = "#64748b";
    const LIGHT_GRAY = "#f1f5f9";
    const PAGE_WIDTH = doc.page.width - 100; // accounting for margins

    // ── Header ──────────────────────────────────────────────────────────────
    doc.rect(50, 50, PAGE_WIDTH, 70).fill(BRAND_ACCENT);

    doc.fillColor("white")
      .fontSize(22)
      .font("Helvetica-Bold")
      .text("BOOKING INVOICE", 70, 65, { width: PAGE_WIDTH - 40 });

    doc.fontSize(10)
      .font("Helvetica")
      .text("Geeves.Life Property Management", 70, 93, { width: PAGE_WIDTH - 40 });

    // ── Invoice Meta ─────────────────────────────────────────────────────────
    doc.fillColor(BRAND_DARK)
      .fontSize(10)
      .font("Helvetica-Bold")
      .text("Invoice Number:", 50, 140)
      .font("Helvetica")
      .text(data.invoiceNumber, 160, 140);

    doc.font("Helvetica-Bold")
      .text("Issue Date:", 50, 155)
      .font("Helvetica")
      .text(formatDate(data.issuedAt), 160, 155);

    doc.font("Helvetica-Bold")
      .text("Booking ID:", 50, 170)
      .font("Helvetica")
      .text(data.bookingId, 160, 170);

    // ── Property & Guest Info ─────────────────────────────────────────────────
    const infoY = 210;
    // Property box
    doc.rect(50, infoY, PAGE_WIDTH / 2 - 10, 90).fill(LIGHT_GRAY);
    doc.fillColor(BRAND_ACCENT)
      .fontSize(9)
      .font("Helvetica-Bold")
      .text("PROPERTY", 60, infoY + 10);
    doc.fillColor(BRAND_DARK)
      .fontSize(11)
      .font("Helvetica-Bold")
      .text(data.propertyName, 60, infoY + 24, { width: PAGE_WIDTH / 2 - 30 });
    if (data.propertyAddress) {
      doc.fillColor(GRAY)
        .fontSize(9)
        .font("Helvetica")
        .text(data.propertyAddress, 60, infoY + 42, { width: PAGE_WIDTH / 2 - 30 });
    }

    // Guest box
    const guestX = 50 + PAGE_WIDTH / 2 + 10;
    const guestW = PAGE_WIDTH / 2 - 10;
    doc.rect(guestX, infoY, guestW, 90).fill(LIGHT_GRAY);
    doc.fillColor(BRAND_ACCENT)
      .fontSize(9)
      .font("Helvetica-Bold")
      .text("GUEST", guestX + 10, infoY + 10);
    doc.fillColor(BRAND_DARK)
      .fontSize(11)
      .font("Helvetica-Bold")
      .text(data.guestName, guestX + 10, infoY + 24, { width: guestW - 20 });
    let guestDetailY = infoY + 42;
    if (data.guestEmail) {
      doc.fillColor(GRAY).fontSize(9).font("Helvetica")
        .text(data.guestEmail, guestX + 10, guestDetailY, { width: guestW - 20 });
      guestDetailY += 14;
    }
    if (data.guestPhone) {
      doc.fillColor(GRAY).fontSize(9).font("Helvetica")
        .text(data.guestPhone, guestX + 10, guestDetailY, { width: guestW - 20 });
    }

    // ── Stay Details ──────────────────────────────────────────────────────────
    const stayY = infoY + 105;
    doc.fillColor(BRAND_DARK)
      .fontSize(12)
      .font("Helvetica-Bold")
      .text("Stay Details", 50, stayY);
    doc.moveTo(50, stayY + 18).lineTo(50 + PAGE_WIDTH, stayY + 18).strokeColor(BRAND_ACCENT).lineWidth(1.5).stroke();

    const row1Y = stayY + 28;
    const colW = PAGE_WIDTH / 3;

    const stayDetails = [
      { label: "Check-In", value: formatDate(data.checkIn) },
      { label: "Check-Out", value: formatDate(data.checkOut) },
      { label: "Duration", value: `${data.nights} night${data.nights !== 1 ? "s" : ""}` },
    ];
    if (data.guestCount) {
      stayDetails.push({ label: "Guests", value: String(data.guestCount) });
    }

    stayDetails.forEach((item, i) => {
      const x = 50 + (i % 3) * colW;
      const y = row1Y + Math.floor(i / 3) * 40;
      doc.fillColor(GRAY).fontSize(8).font("Helvetica-Bold").text(item.label.toUpperCase(), x, y);
      doc.fillColor(BRAND_DARK).fontSize(11).font("Helvetica").text(item.value, x, y + 12);
    });

    // ── Financial Summary ─────────────────────────────────────────────────────
    const finY = row1Y + Math.ceil(stayDetails.length / 3) * 40 + 30;
    doc.fillColor(BRAND_DARK)
      .fontSize(12)
      .font("Helvetica-Bold")
      .text("Financial Summary", 50, finY);
    doc.moveTo(50, finY + 18).lineTo(50 + PAGE_WIDTH, finY + 18).strokeColor(BRAND_ACCENT).lineWidth(1.5).stroke();

    const lineItems: { label: string; value: string; bold?: boolean }[] = [];
    if (data.totalPrice != null) {
      lineItems.push({ label: "Accommodation", value: formatCurrency(data.totalPrice, data.currency) });
    }
    if (data.cleaningFee != null) {
      lineItems.push({ label: "Cleaning Fee", value: formatCurrency(data.cleaningFee, data.currency) });
    }
    if (data.commissionAmount != null) {
      lineItems.push({ label: "Platform Commission", value: formatCurrency(data.commissionAmount, data.currency) });
    }

    const totalAmount = data.totalPrice != null
      ? (data.totalPrice || 0) + (data.cleaningFee || 0)
      : null;

    let lineY = finY + 28;
    lineItems.forEach((item) => {
      doc.fillColor(GRAY).fontSize(10).font("Helvetica").text(item.label, 50, lineY);
      doc.fillColor(BRAND_DARK).fontSize(10).font(item.bold ? "Helvetica-Bold" : "Helvetica")
        .text(item.value, 50, lineY, { width: PAGE_WIDTH, align: "right" });
      lineY += 20;
    });

    // Divider before total
    doc.moveTo(50, lineY + 5).lineTo(50 + PAGE_WIDTH, lineY + 5).strokeColor("#e2e8f0").lineWidth(1).stroke();
    lineY += 15;

    // Total amount box
    if (totalAmount != null) {
      doc.rect(50 + PAGE_WIDTH - 200, lineY, 200, 32).fill(BRAND_ACCENT);
      doc.fillColor("white")
        .fontSize(11)
        .font("Helvetica-Bold")
        .text("TOTAL DUE", 50 + PAGE_WIDTH - 195, lineY + 5)
        .text(formatCurrency(totalAmount, data.currency), 50 + PAGE_WIDTH - 195, lineY + 5, { width: 185, align: "right" });
      lineY += 50;
    }

    // ── Notes ─────────────────────────────────────────────────────────────────
    if (data.notes) {
      lineY += 10;
      doc.fillColor(BRAND_DARK).fontSize(10).font("Helvetica-Bold").text("Notes", 50, lineY);
      lineY += 16;
      doc.fillColor(GRAY).fontSize(9).font("Helvetica")
        .text(data.notes, 50, lineY, { width: PAGE_WIDTH });
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    const footerY = doc.page.height - 80;
    doc.rect(50, footerY, PAGE_WIDTH, 1).fill("#e2e8f0");
    doc.fillColor(GRAY)
      .fontSize(8)
      .font("Helvetica")
      .text(
        "This invoice was generated by Geeves.Life. For questions, contact your property manager.",
        50, footerY + 10, { width: PAGE_WIDTH, align: "center" }
      );

    doc.end();
  });
}
