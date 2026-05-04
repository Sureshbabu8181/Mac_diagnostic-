import PDFDocument from "pdfkit";
import { requireSession } from "@/lib/auth/session";
import { fail } from "@/lib/api";
import { getDashboard } from "@/lib/dashboard";

export async function GET(request: Request, context: { params: Promise<{ type: string }> }) {
  try {
    const session = await requireSession(["SUPER_ADMIN", "OWNER_MANAGER", "ACCOUNTANT"]);
    const { type } = await context.params;
    const format = new URL(request.url).searchParams.get("format") ?? "json";
    const dashboard = await getDashboard(session.propertyId);
    const rows = buildReportRows(type, dashboard);

    if (format === "csv") {
      const headers = Object.keys(rows[0] ?? { message: "No data" });
      const csv = [headers.join(","), ...rows.map((row) => headers.map((header) => JSON.stringify(row[header] ?? "")).join(","))].join("\n");
      return new Response(csv, {
        headers: { "content-type": "text/csv", "content-disposition": `attachment; filename="${type}.csv"` },
      });
    }

    if (format === "pdf") {
      const body = await renderPdf(type, rows);
      return new Response(body, {
        headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${type}.pdf"` },
      });
    }

    return Response.json({ data: rows });
  } catch (error) {
    return fail(error);
  }
}

function buildReportRows(type: string, dashboard: Awaited<ReturnType<typeof getDashboard>>): Record<string, string | number>[] {
  if (type === "occupancy") return dashboard.beds.map((bed) => ({ bed: bed.bedNumber, roomId: bed.roomId, status: bed.status, residentId: bed.currentResidentId ?? "" }));
  if (type === "defaulters") return dashboard.invoices.filter((invoice) => invoice.totalAmount > invoice.paidAmount).map((invoice) => ({ invoiceId: invoice.id, residentId: invoice.residentId, due: invoice.totalAmount - invoice.paidAmount, status: invoice.status }));
  if (type === "complaints") return dashboard.complaints.map((complaint) => ({ id: complaint.id, title: complaint.title, priority: complaint.priority, status: complaint.status, openedAt: complaint.openedAt }));
  if (type === "inventory") return dashboard.inventory.map((item) => ({ item: item.name, stock: item.currentStock, reorderLevel: item.reorderLevel, alert: item.currentStock <= item.reorderLevel ? "LOW" : "OK" }));
  return [
    { metric: "Collected rent", value: dashboard.summary.collectedRent },
    { metric: "Due rent", value: dashboard.summary.dueRent },
    { metric: "Monthly expenses", value: dashboard.summary.monthlyExpenses },
    { metric: "Active residents", value: dashboard.summary.activeResidents },
  ];
}

async function renderPdf(title: string, rows: Record<string, unknown>[]) {
  const doc = new PDFDocument({ margin: 40 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk as Buffer));
  doc.fontSize(18).text(`Sunrise PG ${title} report`, { underline: true });
  doc.moveDown();
  rows.slice(0, 100).forEach((row) => doc.fontSize(10).text(JSON.stringify(row)));
  doc.end();
  await new Promise((resolve) => doc.on("end", resolve));
  return Buffer.concat(chunks);
}
