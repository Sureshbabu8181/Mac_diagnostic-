import { getStorage } from "./storage";

export async function getDashboard(propertyId: string) {
  const storage = getStorage();
  const [beds, invoices, complaints, allocations, payments, visitors, inventory, expenses, residents] = await Promise.all([
    storage.list("beds", { filters: { propertyId }, pageSize: 5000 }),
    storage.list("invoices", { filters: { propertyId }, pageSize: 5000 }),
    storage.list("complaints", { filters: { propertyId }, pageSize: 5000 }),
    storage.list("allocations", { filters: { propertyId }, pageSize: 5000 }),
    storage.list("payments", { filters: { propertyId }, pageSize: 5000 }),
    storage.list("visitors", { filters: { propertyId }, pageSize: 5000 }),
    storage.list("inventory_items", { filters: { propertyId }, pageSize: 5000 }),
    storage.list("expenses", { filters: { propertyId }, pageSize: 5000 }),
    storage.list("residents", { filters: { propertyId }, pageSize: 5000 }),
  ]);

  const occupiedBeds = beds.rows.filter((bed) => bed.status === "occupied").length;
  const availableBeds = beds.rows.filter((bed) => bed.status === "vacant").length;
  const collectedRent = invoices.rows.reduce((sum, invoice) => sum + Number(invoice.paidAmount), 0);
  const dueRent = invoices.rows.reduce((sum, invoice) => sum + Math.max(0, Number(invoice.totalAmount) - Number(invoice.paidAmount)), 0);
  const pendingComplaints = complaints.rows.filter((complaint) => ["open", "in_progress"].includes(complaint.status)).length;
  const today = new Date().toISOString().slice(0, 10);

  const recentActivity = [
    ...payments.rows.map((payment) => ({ id: payment.id, type: "payment", label: `Payment received: Rs ${payment.amount}`, at: payment.paidAt })),
    ...complaints.rows.map((complaint) => ({ id: complaint.id, type: "complaint", label: `${complaint.priority} complaint: ${complaint.title}`, at: complaint.openedAt })),
    ...visitors.rows.map((visitor) => ({ id: visitor.id, type: "visitor", label: `${visitor.visitorName} visited`, at: visitor.timeIn })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);

  return {
    summary: {
      occupancyRate: beds.total ? Math.round((occupiedBeds / beds.total) * 100) : 0,
      occupiedBeds,
      availableBeds,
      totalBeds: beds.total,
      dueRent,
      collectedRent,
      pendingComplaints,
      todayCheckIns: allocations.rows.filter((allocation) => allocation.checkInDate === today).length,
      todayCheckOuts: allocations.rows.filter((allocation) => allocation.actualCheckOutDate === today).length,
      lowStockItems: inventory.rows.filter((item) => item.currentStock <= item.reorderLevel).length,
      monthlyExpenses: expenses.rows.reduce((sum, expense) => sum + Number(expense.amount), 0),
      activeResidents: residents.rows.filter((resident) => resident.status === "active").length,
    },
    recentActivity,
    beds: beds.rows,
    invoices: invoices.rows,
    complaints: complaints.rows,
    inventory: inventory.rows,
    residents: residents.rows,
  };
}
