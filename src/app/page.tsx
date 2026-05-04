"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeIndianRupee,
  BedDouble,
  Bell,
  Building2,
  ClipboardList,
  Download,
  FileSpreadsheet,
  Home,
  LogIn,
  Menu,
  Package,
  Search,
  ShieldCheck,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { Badge, EmptyState, Panel, StatCard } from "@/components/ui";

type Dashboard = {
  summary: {
    occupancyRate: number;
    occupiedBeds: number;
    availableBeds: number;
    totalBeds: number;
    dueRent: number;
    collectedRent: number;
    pendingComplaints: number;
    todayCheckIns: number;
    todayCheckOuts: number;
    lowStockItems: number;
    monthlyExpenses: number;
    activeResidents: number;
  };
  recentActivity: { id: string; type: string; label: string; at: string }[];
  beds: { id: string; bedNumber: string; roomId: string; status: string; currentResidentId?: string }[];
  invoices: { id: string; residentId: string; totalAmount: number; paidAmount: number; status: string; dueDate: string }[];
  complaints: { id: string; title: string; priority: string; status: string; openedAt: string }[];
  inventory: { id: string; name: string; category: string; currentStock: number; reorderLevel: number; unit: string }[];
  residents: { id: string; fullName: string; phone: string; email: string; status: string }[];
};

const modules = [
  { label: "Dashboard", icon: Home },
  { label: "Residents", icon: Users },
  { label: "Rooms & Beds", icon: BedDouble },
  { label: "Billing", icon: BadgeIndianRupee },
  { label: "Maintenance", icon: Wrench },
  { label: "Visitors", icon: ClipboardList },
  { label: "Meals", icon: FileSpreadsheet },
  { label: "Inventory", icon: Package },
  { label: "Notices", icon: Bell },
  { label: "Settings", icon: ShieldCheck },
];

export default function HomePage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const login = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "admin@sunrisepg.test", password: "Demo@12345" }),
      });
      if (!login.ok) {
        setError("Demo login failed. Check server logs and environment configuration.");
        setLoading(false);
        return;
      }
      const response = await fetch("/api/dashboard");
      const payload = await response.json();
      if (!response.ok) setError(payload.error ?? "Could not load dashboard");
      else setDashboard(payload.data);
      setLoading(false);
    }
    load();
  }, []);

  const filteredResidents = useMemo(() => {
    if (!dashboard) return [];
    const needle = query.toLowerCase();
    return dashboard.residents.filter((resident) => [resident.fullName, resident.phone, resident.email].join(" ").toLowerCase().includes(needle));
  }, [dashboard, query]);

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white lg:block">
          <Sidebar />
        </aside>

        {menuOpen ? (
          <div className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden" onClick={() => setMenuOpen(false)}>
            <aside className="h-full w-80 bg-white" onClick={(event) => event.stopPropagation()}>
              <div className="flex justify-end p-3">
                <button className="rounded-md p-2 hover:bg-slate-100" onClick={() => setMenuOpen(false)} aria-label="Close menu">
                  <X size={20} />
                </button>
              </div>
              <Sidebar />
            </aside>
          </div>
        ) : null}

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
            <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
              <div className="flex items-center gap-3">
                <button className="rounded-md p-2 hover:bg-slate-100 lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Open menu">
                  <Menu size={22} />
                </button>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Sunrise PG</p>
                  <h1 className="text-lg font-semibold text-slate-950 sm:text-xl">Operations Dashboard</h1>
                </div>
              </div>
              <div className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 sm:flex">
                <Search size={16} className="text-slate-400" />
                <input className="w-56 bg-transparent text-sm outline-none" placeholder="Search residents..." value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
            </div>
          </header>

          <div className="space-y-6 px-4 py-5 sm:px-6">
            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-950">Demo access is active</h2>
                <p className="mt-1 text-sm text-slate-500">Login as any seeded role with password Demo@12345. Swap DATA_ADAPTER to google_sheets when credentials are ready.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white" onClick={() => downloadReport("/api/reports/revenue?format=csv")}>
                  <Download size={16} /> CSV
                </button>
                <button className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700" onClick={() => downloadReport("/api/reports/occupancy?format=pdf")}>
                  <Download size={16} /> PDF
                </button>
              </div>
            </div>

            {loading ? <LoadingGrid /> : null}
            {error ? <EmptyState title="Dashboard unavailable" body={error} /> : null}
            {dashboard ? (
              <>
                <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard label="Occupancy" value={`${dashboard.summary.occupancyRate}%`} meta={`${dashboard.summary.occupiedBeds}/${dashboard.summary.totalBeds} beds occupied`} tone="blue" />
                  <StatCard label="Available beds" value={dashboard.summary.availableBeds} meta="Vacant and assignable" tone="green" />
                  <StatCard label="Due rent" value={money(dashboard.summary.dueRent)} meta="Pending this cycle" tone="red" />
                  <StatCard label="Collected rent" value={money(dashboard.summary.collectedRent)} meta="Received payments" tone="green" />
                  <StatCard label="Complaints" value={dashboard.summary.pendingComplaints} meta="Open or in progress" tone="amber" />
                  <StatCard label="Today" value={`${dashboard.summary.todayCheckIns}/${dashboard.summary.todayCheckOuts}`} meta="Check-ins / check-outs" />
                  <StatCard label="Low stock" value={dashboard.summary.lowStockItems} meta="Needs replenishment" tone="amber" />
                  <StatCard label="Expenses" value={money(dashboard.summary.monthlyExpenses)} meta="Current demo period" />
                </section>

                <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
                  <Panel title="Residents" action={<Badge tone="blue">{filteredResidents.length} shown</Badge>}>
                    <div className="mb-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 sm:hidden">
                      <Search size={16} className="text-slate-400" />
                      <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Search residents..." value={query} onChange={(event) => setQuery(event.target.value)} />
                    </div>
                    <Table
                      columns={["Name", "Phone", "Email", "Status"]}
                      rows={filteredResidents.map((resident) => [resident.fullName, resident.phone, resident.email, <Status key={resident.id} value={resident.status} />])}
                    />
                  </Panel>

                  <Panel title="Recent Activity">
                    <div className="space-y-3">
                      {dashboard.recentActivity.map((item) => (
                        <div key={item.id} className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
                          <div className="mt-1 h-2 w-2 rounded-full bg-sky-500" />
                          <div>
                            <p className="text-sm font-medium text-slate-800">{item.label}</p>
                            <p className="text-xs text-slate-500">{new Date(item.at).toLocaleString()}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Panel>
                </section>

                <section className="grid gap-4 xl:grid-cols-3">
                  <Panel title="Beds">
                    <Table columns={["Bed", "Room", "Status"]} rows={dashboard.beds.map((bed) => [bed.bedNumber, bed.roomId, <Status key={bed.id} value={bed.status} />])} />
                  </Panel>
                  <Panel title="Invoices">
                    <Table columns={["Invoice", "Due", "Status"]} rows={dashboard.invoices.map((invoice) => [invoice.id, money(invoice.totalAmount - invoice.paidAmount), <Status key={invoice.id} value={invoice.status} />])} />
                  </Panel>
                  <Panel title="Inventory">
                    <Table columns={["Item", "Stock", "Alert"]} rows={dashboard.inventory.map((item) => [item.name, `${item.currentStock} ${item.unit}`, <Status key={item.id} value={item.currentStock <= item.reorderLevel ? "low" : "ok"} />])} />
                  </Panel>
                </section>
              </>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function Sidebar() {
  return (
    <div className="flex h-full flex-col px-4 py-5">
      <div className="mb-6 flex items-center gap-3 px-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white">
          <Building2 size={22} />
        </div>
        <div>
          <p className="font-semibold text-slate-950">PG Manager</p>
          <p className="text-xs text-slate-500">Sheets + Drive edition</p>
        </div>
      </div>
      <nav className="space-y-1">
        {modules.map((module) => {
          const Icon = module.icon;
          return (
            <a key={module.label} href="#" className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-950">
              <Icon size={18} /> {module.label}
            </a>
          );
        })}
      </nav>
      <div className="mt-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <LogIn size={16} /> Demo users
        </div>
        <p className="mt-1 text-xs text-slate-500">admin, owner, accounts, care, resident at sunrisepg.test</p>
      </div>
    </div>
  );
}

function Table({ columns, rows }: { columns: string[]; rows: (string | number | React.ReactNode)[][] }) {
  if (!rows.length) return <EmptyState title="No records found" body="Adjust filters or create a new record." />;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            {columns.map((column) => <th key={column} className="whitespace-nowrap px-2 py-2 font-semibold">{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 8).map((row, index) => (
            <tr key={index} className="border-b border-slate-100 last:border-0">
              {row.map((cell, cellIndex) => <td key={cellIndex} className="whitespace-nowrap px-2 py-3 text-slate-700">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Status({ value }: { value: string }) {
  const tone = value.includes("paid") || value === "occupied" || value === "active" || value === "ok" ? "green" : value.includes("due") || value === "low" || value === "open" ? "amber" : value.includes("maintenance") ? "red" : "slate";
  return <Badge tone={tone}>{value.replaceAll("_", " ")}</Badge>;
}

function LoadingGrid() {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-32 animate-pulse rounded-lg bg-slate-200" />)}
    </section>
  );
}

function money(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

function downloadReport(url: string) {
  window.location.assign(url);
}
