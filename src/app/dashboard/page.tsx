"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  BadgeIndianRupee,
  BedDouble,
  Building2,
  ClipboardList,
  Download,
  Edit3,
  FileText,
  Home,
  Loader2,
  LogOut,
  Menu,
  Package,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Save,
  Trash2,
  Upload,
  Users,
  Utensils,
  Wrench,
  X,
} from "lucide-react";
import { Badge, EmptyState, Panel, StatCard } from "@/components/ui";

type Row = Record<string, string | number | boolean | undefined>;
type ApiList = { rows: Row[]; total: number; page: number; pageSize: number };
type Lists = Record<string, ApiList>;
type SessionUser = { id: string; email: string; name: string; role: string; propertyId: string };

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
};

type ModuleKey = "dashboard" | "residents" | "rooms" | "billing" | "maintenance" | "visitors" | "meals" | "inventory" | "reports" | "settings";

const modules: { key: ModuleKey; label: string; icon: typeof Home }[] = [
  { key: "dashboard", label: "Dashboard", icon: Home },
  { key: "residents", label: "Residents", icon: Users },
  { key: "rooms", label: "Rooms & Beds", icon: BedDouble },
  { key: "billing", label: "Billing", icon: BadgeIndianRupee },
  { key: "maintenance", label: "Maintenance", icon: Wrench },
  { key: "visitors", label: "Visitors", icon: ClipboardList },
  { key: "meals", label: "Meals & Notices", icon: Utensils },
  { key: "inventory", label: "Inventory", icon: Package },
  { key: "reports", label: "Reports", icon: FileText },
  { key: "settings", label: "Settings", icon: Settings },
];

const moduleResources: Record<ModuleKey, string[]> = {
  dashboard: [],
  residents: ["residents", "rooms", "beds"],
  rooms: ["rooms", "beds"],
  billing: ["allocations", "invoices", "payments"],
  maintenance: ["residents", "complaints", "maintenance_logs"],
  visitors: ["residents", "visitors"],
  meals: ["mess_plans", "notices"],
  inventory: ["inventory_items", "inventory_transactions"],
  reports: ["invoices", "payments", "complaints", "inventory_items", "expenses", "residents", "beds"],
  settings: ["users", "expenses", "audit_logs", "enquiries"],
};

const today = new Date().toISOString().slice(0, 10);
const month = new Date().toISOString().slice(0, 7);
const demoAccounts = [
  ["admin@sunrisepg.test", "Super Admin"],
  ["owner@sunrisepg.test", "Owner"],
  ["accounts@sunrisepg.test", "Accountant"],
  ["care@sunrisepg.test", "Caretaker"],
  ["resident@sunrisepg.test", "Resident"],
] as const;

const roleModules: Record<string, ModuleKey[]> = {
  SUPER_ADMIN: ["dashboard", "residents", "rooms", "billing", "maintenance", "visitors", "meals", "inventory", "reports", "settings"],
  OWNER_MANAGER: ["dashboard", "residents", "rooms", "billing", "maintenance", "visitors", "meals", "inventory", "reports", "settings"],
  ACCOUNTANT: ["dashboard", "billing", "reports", "settings"],
  CARETAKER: ["dashboard", "residents", "rooms", "maintenance", "visitors", "inventory"],
  RESIDENT: ["dashboard", "maintenance", "meals", "visitors"],
};

export default function HomePage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [lists, setLists] = useState<Lists>({});
  const [active, setActive] = useState<ModuleKey>("dashboard");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [moduleLoading, setModuleLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function load(options: { activeModule?: ModuleKey; forceResources?: boolean } = {}) {
    setLoading(true);
    setToast(null);
    try {
      const user = await apiGet<SessionUser | null>("/api/auth/me");
      if (!user) {
        setSession(null);
        setDashboard(null);
        setLists({});
        window.location.href = "/login";
        return;
      }
      setSession(user);
      const activeModule = options.activeModule ?? active;
      const dash = await apiGet<Dashboard>("/api/dashboard");
      setDashboard(dash);
      await loadResources(activeModule, { force: options.forceResources });
    } catch (error) {
      setToast({ tone: "error", text: error instanceof Error ? error.message : "Could not load app data." });
    } finally {
      setLoading(false);
    }
  }

  async function loadResources(moduleKey: ModuleKey, options: { force?: boolean } = {}) {
    const needed = getModuleResources(moduleKey, session?.role);
    const missing = options.force ? needed : needed.filter((resource) => !lists[resource]);
    if (!missing.length) return;
    setModuleLoading(true);
    try {
      const resourceLists = await Promise.all(missing.map((resource) => apiGet<ApiList>(`/api/${resource}?pageSize=250`)));
      setLists((current) => ({
        ...current,
        ...Object.fromEntries(missing.map((resource, index) => [resource, resourceLists[index]])),
      }));
    } finally {
      setModuleLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!session || loading) return;
    if (!canAccessModule(session.role, active)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActive("dashboard");
      return;
    }
    loadResources(active).catch((error) => {
      setToast({ tone: "error", text: error instanceof Error ? error.message : "Could not load module data." });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, session?.id]);

  const filtered = useMemo(() => {
    const needle = query.toLowerCase();
    return Object.fromEntries(Object.entries(lists).map(([key, list]) => [
      key,
      { ...list, rows: list.rows.filter((row) => Object.values(row).join(" ").toLowerCase().includes(needle)) },
    ]));
  }, [lists, query]);

  async function runAction<T>(label: string, task: () => Promise<T>) {
    setSaving(true);
    setToast(null);
    try {
      await task();
      await load({ activeModule: active, forceResources: true });
      setToast({ tone: "success", text: label });
    } catch (error) {
      setToast({ tone: "error", text: error instanceof Error ? error.message : "Action failed." });
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    setSaving(true);
    setToast(null);
    try {
      await apiPost<{ success: boolean }>("/api/auth/logout", {});
      window.location.href = "/login";
    } catch (error) {
      setToast({ tone: "error", text: error instanceof Error ? error.message : "Logout failed." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white lg:block">
          <Sidebar active={active} role={session?.role} setActive={setActive} />
        </aside>

        {menuOpen ? (
          <div className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" onClick={() => setMenuOpen(false)}>
            <aside className="h-full w-80 bg-white" onClick={(event) => event.stopPropagation()}>
              <div className="flex justify-end p-3">
                <button className="rounded-md p-2 hover:bg-slate-100" onClick={() => setMenuOpen(false)} aria-label="Close menu">
                  <X size={20} />
                </button>
              </div>
              <Sidebar active={active} role={session?.role} setActive={(key) => { setActive(key); setMenuOpen(false); }} />
            </aside>
          </div>
        ) : null}

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
            <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="flex items-center gap-3">
                <button className="rounded-md p-2 hover:bg-slate-100 lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Open menu">
                  <Menu size={22} />
                </button>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Sunrise PG</p>
                  <h1 className="text-lg font-semibold text-slate-950 sm:text-xl">{modules.find((item) => item.key === active)?.label}</h1>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <Search size={16} className="text-slate-400" />
                  <input className="min-w-0 bg-transparent text-sm outline-none sm:w-64" placeholder="Search all loaded records..." value={query} onChange={(event) => setQuery(event.target.value)} />
                </div>
                {session ? <Badge tone="blue">{session.role.replaceAll("_", " ")}</Badge> : null}
                {session ? (
                  <button className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60" onClick={handleLogout} disabled={saving}>
                    <LogOut size={16} />
                    Logout
                  </button>
                ) : null}
              </div>
            </div>
          </header>

          <div className="space-y-5 px-4 py-5 sm:px-6">
            {toast ? (
              <div className={`rounded-lg border px-4 py-3 text-sm ${toast.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
                {toast.text}
              </div>
            ) : null}
            {loading ? <LoadingGrid /> : null}
            {!loading && session ? (
              <>
                {moduleLoading ? (
                  <div className="rounded-lg border border-slate-200 bg-white p-6 text-center">
                    <Loader2 className="mx-auto animate-spin text-slate-400" size={24} />
                    <p className="mt-2 text-sm text-slate-500">Loading module data...</p>
                  </div>
                ) : null}
                <AppContent active={active} dashboard={dashboard} lists={filtered} rawLists={lists} saving={saving} session={session} runAction={runAction} />
              </>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function AppContent({
  active,
  dashboard,
  lists,
  rawLists,
  saving,
  session,
  runAction,
}: {
  active: ModuleKey;
  dashboard: Dashboard | null;
  lists: Lists;
  rawLists: Lists;
  saving: boolean;
  session: SessionUser;
  runAction: <T>(label: string, task: () => Promise<T>) => Promise<void>;
}) {
  const vacantBeds = (rawLists.beds?.rows ?? []).filter((bed) => bed.status === "vacant");
  const activeResidents = (rawLists.residents?.rows ?? []).filter((resident) => resident.status === "active");
  const dueInvoices = (rawLists.invoices?.rows ?? []).filter((invoice) => Number(invoice.totalAmount) > Number(invoice.paidAmount));

  if (active === "dashboard") {
    return (
      <>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Occupancy" value={`${dashboard?.summary.occupancyRate ?? 0}%`} meta={`${dashboard?.summary.occupiedBeds ?? 0}/${dashboard?.summary.totalBeds ?? 0} beds occupied`} tone="blue" />
          <StatCard label="Available beds" value={dashboard?.summary.availableBeds ?? 0} meta="Vacant and assignable" tone="green" />
          <StatCard label="Due rent" value={money(dashboard?.summary.dueRent ?? 0)} meta="Pending this cycle" tone="red" />
          <StatCard label="Collected rent" value={money(dashboard?.summary.collectedRent ?? 0)} meta="Received payments" tone="green" />
          <StatCard label="Complaints" value={dashboard?.summary.pendingComplaints ?? 0} meta="Open or in progress" tone="amber" />
          <StatCard label="Today" value={`${dashboard?.summary.todayCheckIns ?? 0}/${dashboard?.summary.todayCheckOuts ?? 0}`} meta="Check-ins / check-outs" />
          <StatCard label="Low stock" value={dashboard?.summary.lowStockItems ?? 0} meta="Needs replenishment" tone="amber" />
          <StatCard label="Expenses" value={money(dashboard?.summary.monthlyExpenses ?? 0)} meta="Current period" />
        </section>
        <section className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
          <Panel title="Today’s Work Queue">
            <WorkQueue lists={rawLists} />
          </Panel>
          <Panel title="Recent Activity">
            <Activity items={dashboard?.recentActivity ?? []} />
          </Panel>
        </section>
      </>
    );
  }

  if (active === "residents") {
    return (
      <section className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <Panel title="Check In Resident" action={<Badge tone="green">{vacantBeds.length} vacant beds</Badge>}>
          <SmartForm
            saving={saving}
            submitLabel="Check in and allocate"
            fields={[
              ["fullName", "Full name", "text"],
              ["phone", "Phone", "tel"],
              ["email", "Email", "email"],
              ["gender", "Gender", "select", ["Female", "Male", "Other"]],
              ["occupation", "Occupation", "text"],
              ["kycType", "KYC type", "select", ["Aadhaar", "PAN", "Passport", "Driving License"]],
              ["kycNumber", "KYC number", "text"],
              ["emergencyName", "Emergency contact", "text"],
              ["emergencyPhone", "Emergency phone", "tel"],
              ["roomId", "Room", "select", (rawLists.rooms?.rows ?? []).map((room) => [String(room.id), `${room.building}-${room.roomNumber}`])],
              ["bedId", "Bed", "select", vacantBeds.map((bed) => [String(bed.id), String(bed.bedNumber)])],
              ["checkInDate", "Check-in date", "date", today],
              ["expectedCheckOutDate", "Expected check-out", "date"],
              ["depositAmount", "Deposit", "number", "20000"],
              ["monthlyRent", "Monthly rent", "number", "9500"],
            ]}
            onSubmit={(payload) => runAction("Resident checked in and bed allocated.", () => apiPost("/api/workflows/check-in", payload))}
          />
        </Panel>
        <Panel title="Residents" action={<Badge tone="blue">{lists.residents?.rows.length ?? 0} records</Badge>}>
          <DataTable resource="residents" rows={lists.residents?.rows ?? []} columns={["fullName", "phone", "email", "occupation", "status"]} runAction={runAction} />
        </Panel>
      </section>
    );
  }

  if (active === "rooms") {
    return (
      <section className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <Panel title="Create Room">
            <SmartForm
              saving={saving}
              submitLabel="Add room"
              fields={[
                ["building", "Building", "text", "A"],
                ["floor", "Floor", "text", "1"],
                ["roomNumber", "Room number", "text"],
                ["roomType", "Room type", "select", ["Single", "Double Sharing", "Triple Sharing", "Dormitory"]],
                ["capacity", "Capacity", "number", "2"],
                ["monthlyRent", "Monthly rent", "number", "10000"],
                ["status", "Status", "select", ["active", "maintenance"]],
              ]}
              onSubmit={(payload) => runAction("Room created.", () => apiPost("/api/rooms", payload))}
            />
          </Panel>
          <Panel title="Create Bed">
            <SmartForm
              saving={saving}
              submitLabel="Add bed"
              fields={[
                ["roomId", "Room", "select", (rawLists.rooms?.rows ?? []).map((room) => [String(room.id), `${room.building}-${room.roomNumber}`])],
                ["bedNumber", "Bed number", "text"],
                ["status", "Status", "select", ["vacant", "maintenance"]],
              ]}
              onSubmit={(payload) => runAction("Bed created.", () => apiPost("/api/beds", payload))}
            />
          </Panel>
        </div>
        <div className="space-y-4">
          <Panel title="Rooms"><DataTable resource="rooms" rows={lists.rooms?.rows ?? []} columns={["building", "floor", "roomNumber", "roomType", "capacity", "monthlyRent", "status"]} runAction={runAction} /></Panel>
          <Panel title="Beds"><DataTable resource="beds" rows={lists.beds?.rows ?? []} columns={["bedNumber", "roomId", "status", "currentResidentId"]} runAction={runAction} /></Panel>
        </div>
      </section>
    );
  }

  if (active === "billing") {
    return (
      <section className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <Panel title="Generate Monthly Rent">
            <SmartForm
              saving={saving}
              submitLabel="Generate invoices"
              fields={[
                ["month", "Month", "month", month],
                ["dueDate", "Due date", "date", today],
                ["messAmount", "Mess charge", "number", "2500"],
                ["taxPercent", "Tax percent", "number", "0"],
              ]}
              onSubmit={(payload) => runAction("Invoices generated for active allocations.", () => apiPost("/api/workflows/generate-invoices", payload))}
            />
          </Panel>
          <Panel title="Record Payment">
            <SmartForm
              saving={saving}
              submitLabel="Post payment"
              fields={[
                ["invoiceId", "Invoice", "select", dueInvoices.map((invoice) => [String(invoice.id), `${invoice.id} due ${money(Number(invoice.totalAmount) - Number(invoice.paidAmount))}`])],
                ["amount", "Amount", "number"],
                ["mode", "Mode", "select", ["cash", "upi", "bank_transfer", "card", "other"]],
                ["reference", "Reference", "text"],
                ["notes", "Notes", "text"],
              ]}
              onSubmit={(payload) => runAction("Payment recorded and invoice updated.", () => apiPost("/api/workflows/record-payment", payload))}
            />
          </Panel>
        </div>
        <div className="space-y-4">
          <Panel title="Invoices" action={<ReportActions type="defaulters" />}>
            <DataTable resource="invoices" rows={lists.invoices?.rows ?? []} columns={["id", "residentId", "month", "totalAmount", "paidAmount", "dueDate", "status"]} runAction={runAction} />
          </Panel>
          <Panel title="Payments">
            <DataTable resource="payments" rows={lists.payments?.rows ?? []} columns={["invoiceId", "residentId", "amount", "mode", "paidAt", "reference", "status"]} runAction={runAction} />
          </Panel>
        </div>
      </section>
    );
  }

  if (active === "maintenance") {
    return (
      <section className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <Panel title="Create Complaint">
            <SmartForm
              saving={saving}
              submitLabel="Create ticket"
              fields={[
                ["residentId", "Resident", "select", activeResidents.map((resident) => [String(resident.id), String(resident.fullName)])],
                ["title", "Title", "text"],
                ["description", "Description", "textarea"],
                ["priority", "Priority", "select", ["low", "medium", "high", "critical"]],
                ["status", "Status", "select", ["open", "in_progress"]],
                ["openedAt", "Opened at", "datetime-local", new Date().toISOString().slice(0, 16)],
              ]}
              onSubmit={(payload) => runAction("Complaint created.", () => apiPost("/api/complaints", payload))}
            />
          </Panel>
          <Panel title="Update Complaint">
            <SmartForm
              saving={saving}
              submitLabel="Update status"
              fields={[
                ["complaintId", "Complaint", "select", (rawLists.complaints?.rows ?? []).map((complaint) => [String(complaint.id), String(complaint.title)])],
                ["status", "Status", "select", ["open", "in_progress", "resolved", "closed"]],
                ["actionTaken", "Action taken", "textarea"],
                ["materialCost", "Material cost", "number", "0"],
                ["laborCost", "Labor cost", "number", "0"],
              ]}
              onSubmit={(payload) => runAction("Complaint updated and maintenance log saved.", () => apiPost("/api/workflows/complaint-status", payload))}
            />
          </Panel>
        </div>
        <div className="space-y-4">
          <Panel title="Complaints" action={<ReportActions type="complaints" />}>
            <DataTable resource="complaints" rows={lists.complaints?.rows ?? []} columns={["title", "residentId", "priority", "status", "assignedStaffId", "openedAt", "resolvedAt"]} runAction={runAction} />
          </Panel>
          <Panel title="Maintenance Logs">
            <DataTable resource="maintenance_logs" rows={lists.maintenance_logs?.rows ?? []} columns={["complaintId", "staffId", "actionTaken", "materialCost", "laborCost", "createdAt"]} runAction={runAction} />
          </Panel>
        </div>
      </section>
    );
  }

  if (active === "visitors") {
    return (
      <section className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <Panel title="Visitor Entry">
          <SmartForm
            saving={saving}
            submitLabel="Log visitor"
            fields={[
              ["residentId", "Resident", "select", activeResidents.map((resident) => [String(resident.id), String(resident.fullName)])],
              ["visitorName", "Visitor name", "text"],
              ["visitorPhone", "Visitor phone", "tel"],
              ["purpose", "Purpose", "text"],
              ["timeIn", "Time in", "datetime-local", new Date().toISOString().slice(0, 16)],
              ["guardNotes", "Guard notes", "text"],
            ]}
            onSubmit={(payload) => runAction("Visitor logged.", () => apiPost("/api/visitors", payload))}
          />
        </Panel>
        <Panel title="Visitor Log">
          <DataTable resource="visitors" rows={lists.visitors?.rows ?? []} columns={["visitorName", "visitorPhone", "residentId", "purpose", "timeIn", "timeOut", "guardNotes"]} runAction={runAction} />
        </Panel>
      </section>
    );
  }

  if (active === "meals") {
    return (
      <section className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <Panel title="Meal Plan">
            <SmartForm
              saving={saving}
              submitLabel="Save plan"
              fields={[
                ["name", "Plan name", "text", "Standard Veg"],
                ["monthlyCharge", "Monthly charge", "number", "2500"],
                ["weeklyMenuJson", "Weekly menu JSON", "textarea", "{\"Mon\":\"Dal rice\",\"Tue\":\"Chapati sabzi\"}"],
                ["status", "Status", "select", ["active", "inactive"]],
              ]}
              onSubmit={(payload) => runAction("Meal plan saved.", () => apiPost("/api/mess_plans", payload))}
            />
          </Panel>
          <Panel title="Notice">
            <SmartForm
              saving={saving}
              submitLabel="Publish notice"
              fields={[
                ["title", "Title", "text"],
                ["body", "Body", "textarea"],
                ["audience", "Audience", "select", ["all", "RESIDENT", "CARETAKER", "ACCOUNTANT"]],
                ["publishAt", "Publish at", "datetime-local", new Date().toISOString().slice(0, 16)],
                ["status", "Status", "select", ["active", "inactive"]],
              ]}
              onSubmit={(payload) => runAction("Notice published.", () => apiPost("/api/notices", payload))}
            />
          </Panel>
        </div>
        <div className="space-y-4">
          <Panel title="Mess Plans"><DataTable resource="mess_plans" rows={lists.mess_plans?.rows ?? []} columns={["name", "monthlyCharge", "status", "weeklyMenuJson"]} runAction={runAction} /></Panel>
          <Panel title="Notices"><DataTable resource="notices" rows={lists.notices?.rows ?? []} columns={["title", "audience", "publishAt", "expiresAt", "status"]} runAction={runAction} /></Panel>
        </div>
      </section>
    );
  }

  if (active === "inventory") {
    return (
      <section className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <Panel title="Create Item">
            <SmartForm
              saving={saving}
              submitLabel="Add item"
              fields={[
                ["name", "Item name", "text"],
                ["category", "Category", "text"],
                ["unit", "Unit", "text", "pcs"],
                ["currentStock", "Opening stock", "number", "0"],
                ["reorderLevel", "Reorder level", "number", "10"],
                ["status", "Status", "select", ["active", "inactive"]],
              ]}
              onSubmit={(payload) => runAction("Inventory item created.", () => apiPost("/api/inventory_items", payload))}
            />
          </Panel>
          <Panel title="Stock Movement">
            <SmartForm
              saving={saving}
              submitLabel="Post stock entry"
              fields={[
                ["itemId", "Item", "select", (rawLists.inventory_items?.rows ?? []).map((item) => [String(item.id), String(item.name)])],
                ["type", "Type", "select", ["purchase", "issue", "consume", "adjustment"]],
                ["quantity", "Quantity", "number"],
                ["unitCost", "Unit cost", "number", "0"],
                ["reference", "Reference", "text"],
              ]}
              onSubmit={(payload) => runAction("Stock movement posted.", () => apiPost("/api/workflows/inventory-transaction", payload))}
            />
          </Panel>
        </div>
        <div className="space-y-4">
          <Panel title="Stock Levels" action={<ReportActions type="inventory" />}>
            <DataTable resource="inventory_items" rows={lists.inventory_items?.rows ?? []} columns={["name", "category", "currentStock", "unit", "reorderLevel", "status"]} runAction={runAction} />
          </Panel>
          <Panel title="Transactions"><DataTable resource="inventory_transactions" rows={lists.inventory_transactions?.rows ?? []} columns={["itemId", "type", "quantity", "unitCost", "reference", "createdBy"]} runAction={runAction} /></Panel>
        </div>
      </section>
    );
  }

  if (active === "reports") {
    return <Reports lists={lists} />;
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[380px_1fr]">
      <div className="space-y-4">
        {["SUPER_ADMIN", "OWNER_MANAGER"].includes(session.role) ? (
          <Panel title="Create User">
            <SmartForm
              saving={saving}
              submitLabel="Create user"
              fields={[
                ["name", "Name", "text"],
                ["email", "Email", "email"],
                ["password", "Password", "text", "Demo@12345"],
                ["role", "Role", "select", session.role === "SUPER_ADMIN" ? ["SUPER_ADMIN", "OWNER_MANAGER", "ACCOUNTANT", "CARETAKER", "RESIDENT"] : ["OWNER_MANAGER", "ACCOUNTANT", "CARETAKER", "RESIDENT"]],
                ["residentId", "Resident ID", "text"],
                ["status", "Status", "select", ["active", "inactive"]],
              ]}
              onSubmit={(payload) => runAction("User created.", () => apiPost("/api/users", payload))}
            />
          </Panel>
        ) : null}
        <Panel title="Expense Entry">
          <SmartForm
            saving={saving}
            submitLabel="Save expense"
            fields={[
              ["category", "Category", "text"],
              ["amount", "Amount", "number"],
              ["paidAt", "Paid at", "date", today],
              ["vendor", "Vendor", "text"],
              ["notes", "Notes", "text"],
              ["status", "Status", "select", ["active", "inactive"]],
            ]}
            onSubmit={(payload) => runAction("Expense saved.", () => apiPost("/api/expenses", payload))}
          />
        </Panel>
        <Panel title="Document Upload">
          <UploadForm saving={saving} onDone={(message) => runAction(message, async () => undefined)} />
        </Panel>
      </div>
      <div className="space-y-4">
        {["SUPER_ADMIN", "OWNER_MANAGER"].includes(session.role) ? (
          <Panel title="Users">
            <DataTable resource="users" rows={lists.users?.rows ?? []} columns={["name", "email", "role", "residentId", "status"]} runAction={runAction} />
          </Panel>
        ) : null}
        <Panel title="Expenses"><DataTable resource="expenses" rows={lists.expenses?.rows ?? []} columns={["category", "amount", "paidAt", "vendor", "status"]} runAction={runAction} /></Panel>
        <Panel title="Audit Logs"><DataTable resource="audit_logs" rows={lists.audit_logs?.rows ?? []} columns={["actorUserId", "action", "entity", "entityId", "createdAt"]} runAction={runAction} /></Panel>
        <Panel title="Enquiries"><DataTable resource="enquiries" rows={lists.enquiries?.rows ?? []} columns={["name", "phone", "email", "message", "createdAt"]} runAction={runAction} /></Panel>
      </div>
    </section>
  );
}

function Sidebar({ active, role, setActive }: { active: ModuleKey; role?: string; setActive: (key: ModuleKey) => void }) {
  const visibleModules = modules.filter((module) => !role || canAccessModule(role, module.key));
  return (
    <div className="flex h-full flex-col px-4 py-5">
      <div className="mb-6 flex items-center gap-3 px-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white">
          <Building2 size={22} />
        </div>
        <div>
          <p className="font-semibold text-slate-950">PG Manager</p>
          <p className="text-xs text-slate-500">Production console</p>
        </div>
      </div>
      <nav className="space-y-1">
        {visibleModules.map((module) => {
          const Icon = module.icon;
          return (
            <button
              key={module.key}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium ${active === module.key ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`}
              onClick={() => setActive(module.key)}
            >
              <Icon size={18} /> {module.label}
            </button>
          );
        })}
      </nav>
      <div className="mt-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <ShieldCheck size={16} /> Deployment ready
        </div>
        <p className="mt-1 text-xs text-slate-500">Switch DATA_ADAPTER to google_sheets and add service-account credentials.</p>
      </div>
    </div>
  );
}

function canAccessModule(role: string, module: ModuleKey) {
  return (roleModules[role] ?? ["dashboard"]).includes(module);
}

function getModuleResources(module: ModuleKey, role?: string) {
  const resources = moduleResources[module] ?? [];
  if (module !== "settings") return resources;
  if (role === "SUPER_ADMIN" || role === "OWNER_MANAGER") return resources;
  return resources.filter((resource) => resource !== "users" && resource !== "audit_logs");
}

type FieldConfig = [name: string, label: string, type: "text" | "email" | "tel" | "number" | "date" | "month" | "datetime-local" | "select" | "textarea", options?: string | string[] | string[][]];

function SmartForm({ fields, submitLabel, saving, onSubmit }: { fields: FieldConfig[]; submitLabel: string; saving: boolean; onSubmit: (payload: Row) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload: Row = {};
    fields.forEach(([name, , type]) => {
      const value = String(formData.get(name) ?? "");
      if (value === "") return;
      payload[name] = type === "number" ? Number(value) : value;
    });
    onSubmit(payload);
    event.currentTarget.reset();
  }

  return (
    <form className="space-y-3" onSubmit={submit}>
      {fields.map(([name, label, type, options]) => (
        <label key={name} className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
          {type === "select" ? (
            <select name={name} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-950" defaultValue="">
              <option value="" disabled>Select {label.toLowerCase()}</option>
              {normalizeOptions(options).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
            </select>
          ) : type === "textarea" ? (
            <textarea name={name} defaultValue={typeof options === "string" ? options : ""} className="mt-1 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950" />
          ) : (
            <input name={name} type={type} defaultValue={typeof options === "string" ? options : ""} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950" />
          )}
        </label>
      ))}
      <button disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60">
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} {submitLabel}
      </button>
    </form>
  );
}

function UploadForm({ saving, onDone }: { saving: boolean; onDone: (message: string) => void }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    await apiUpload("/api/files/upload", formData);
    form.reset();
    onDone("File uploaded to configured Drive folder.");
  }

  return (
    <form className="space-y-3" onSubmit={submit}>
      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Folder</span>
        <select name="folder" className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
          {["agreements", "id_proofs", "resident_photos", "receipts", "complaint_images", "exports", "notices", "staff_docs"].map((folder) => <option key={folder} value={folder}>{folder}</option>)}
        </select>
      </label>
      <input name="file" type="file" className="w-full rounded-md border border-dashed border-slate-300 p-3 text-sm" required />
      <button disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800">
        <Upload size={16} /> Upload document
      </button>
    </form>
  );
}

function DataTable({
  rows,
  columns,
  resource,
  runAction,
}: {
  rows: Row[];
  columns: string[];
  resource?: string;
  runAction?: <T>(label: string, task: () => Promise<T>) => Promise<void>;
}) {
  const [editing, setEditing] = useState<Row | null>(null);
  const canManage = Boolean(resource && runAction);

  async function deleteRow(row: Row) {
    if (!resource || !runAction || !row.id) return;
    const label = String(row.fullName ?? row.name ?? row.title ?? row.id);
    const confirmed = window.confirm(`Soft delete ${label}? This hides the record from normal lists but keeps an audit trail.`);
    if (!confirmed) return;
    await runAction("Record soft-deleted.", () => apiDelete(`/api/${resource}/${row.id}`));
  }

  if (!rows.length) return <EmptyState title="No records found" body="Create a record or adjust your search." />;
  return (
    <>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              {columns.map((column) => <th key={column} className="whitespace-nowrap px-2 py-2 font-semibold">{pretty(column)}</th>)}
              {canManage ? <th className="whitespace-nowrap px-2 py-2 text-right font-semibold">Manage</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row.id ?? JSON.stringify(row))} className="border-b border-slate-100 last:border-0">
                {columns.map((column) => (
                  <td key={column} className="max-w-72 truncate whitespace-nowrap px-2 py-3 text-slate-700">
                    {column === "status" || column === "priority" ? <Status value={String(row[column] ?? "")} /> : formatCell(row[column])}
                  </td>
                ))}
                {canManage ? (
                  <td className="whitespace-nowrap px-2 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50" onClick={() => setEditing(row)}>
                        <Edit3 size={13} /> Edit
                      </button>
                      <button className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50" onClick={() => deleteRow(row)}>
                        <Trash2 size={13} /> Delete
                      </button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && resource && runAction ? (
        <EditRecordDialog
          row={editing}
          resource={resource}
          onClose={() => setEditing(null)}
          onSave={(payload) => runAction("Record updated.", () => apiPut(`/api/${resource}/${editing.id}`, payload)).then(() => setEditing(null))}
        />
      ) : null}
    </>
  );
}

function EditRecordDialog({ row, resource, onClose, onSave }: { row: Row; resource: string; onClose: () => void; onSave: (payload: Row) => Promise<void> }) {
  const fields = Object.keys(row).filter((key) => !["id", "propertyId", "passwordHash", "createdAt", "updatedAt"].includes(key));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload: Row = {};
    fields.forEach((field) => {
      const original = row[field];
      const value = String(formData.get(field) ?? "");
      payload[field] = typeof original === "number" ? Number(value || 0) : value;
    });
    onSave(payload);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 px-4 py-6">
      <form className="w-full max-w-2xl rounded-lg bg-white shadow-xl" onSubmit={submit}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h3 className="font-semibold text-slate-950">Edit {pretty(resource)}</h3>
            <p className="text-xs text-slate-500">Record ID: {String(row.id)}</p>
          </div>
          <button type="button" className="rounded-md p-2 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Close editor">
            <X size={18} />
          </button>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          {fields.map((field) => {
            const value = row[field];
            const textValue = String(value ?? "");
            const isLong = textValue.length > 80 || field.toLowerCase().includes("json") || field.toLowerCase().includes("description") || field.toLowerCase().includes("body") || field.toLowerCase().includes("notes");
            return (
              <label key={field} className={isLong ? "block sm:col-span-2" : "block"}>
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{pretty(field)}</span>
                {isLong ? (
                  <textarea name={field} defaultValue={textValue} className="mt-1 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950" />
                ) : (
                  <input name={field} type={typeof value === "number" ? "number" : inferInputType(field)} defaultValue={textValue} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950" />
                )}
              </label>
            );
          })}
        </div>
        <div className="flex flex-col gap-2 border-t border-slate-200 px-4 py-3 sm:flex-row sm:justify-end">
          <button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700" onClick={onClose}>Cancel</button>
          <button className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white">
            <Save size={16} /> Save changes
          </button>
        </div>
      </form>
    </div>
  );
}

function WorkQueue({ lists }: { lists: Lists }) {
  const due = (lists.invoices?.rows ?? []).filter((invoice) => Number(invoice.totalAmount) > Number(invoice.paidAmount)).length;
  const openComplaints = (lists.complaints?.rows ?? []).filter((complaint) => ["open", "in_progress"].includes(String(complaint.status))).length;
  const vacantBeds = (lists.beds?.rows ?? []).filter((bed) => bed.status === "vacant").length;
  const lowStock = (lists.inventory_items?.rows ?? []).filter((item) => Number(item.currentStock) <= Number(item.reorderLevel)).length;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Task title="Collect rent" value={`${due} invoices pending`} tone={due ? "amber" : "green"} />
      <Task title="Resolve maintenance" value={`${openComplaints} tickets open`} tone={openComplaints ? "red" : "green"} />
      <Task title="Fill beds" value={`${vacantBeds} beds vacant`} tone={vacantBeds ? "blue" : "green"} />
      <Task title="Restock inventory" value={`${lowStock} low-stock items`} tone={lowStock ? "amber" : "green"} />
    </div>
  );
}

function Task({ title, value, tone }: { title: string; value: string; tone: "green" | "amber" | "red" | "blue" }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <Badge tone={tone}>{title}</Badge>
      <p className="mt-3 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function Activity({ items }: { items: { id: string; label: string; at: string }[] }) {
  if (!items.length) return <EmptyState title="No recent activity" body="New payments, complaints, and visitors will appear here." />;
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
          <div className="mt-1 h-2 w-2 rounded-full bg-sky-500" />
          <div>
            <p className="text-sm font-medium text-slate-800">{item.label}</p>
            <p className="text-xs text-slate-500">{new Date(item.at).toLocaleString()}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function Reports({ lists }: { lists: Lists }) {
  const reports = ["revenue", "occupancy", "defaulters", "complaints", "inventory"];
  return (
    <section className="space-y-4">
      <Panel title="Export Center">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {reports.map((report) => (
            <div key={report} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold text-slate-950">{pretty(report)}</p>
              <p className="mt-1 text-sm text-slate-500">Download as CSV or PDF.</p>
              <div className="mt-4 flex gap-2">
                <button className="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white" onClick={() => downloadReport(`/api/reports/${report}?format=csv`)}>CSV</button>
                <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700" onClick={() => downloadReport(`/api/reports/${report}?format=pdf`)}>PDF</button>
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Financial Summary">
        <DataTable rows={lists.invoices?.rows ?? []} columns={["id", "residentId", "month", "totalAmount", "paidAmount", "status"]} />
      </Panel>
    </section>
  );
}

function ReportActions({ type }: { type: string }) {
  return (
    <div className="flex gap-2">
      <button className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700" onClick={() => downloadReport(`/api/reports/${type}?format=csv`)}>
        <Download size={14} /> CSV
      </button>
      <button className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700" onClick={() => downloadReport(`/api/reports/${type}?format=pdf`)}>
        <Download size={14} /> PDF
      </button>
    </div>
  );
}

function Status({ value }: { value: string }) {
  const tone = value.includes("paid") || value === "occupied" || value === "active" || value === "received" ? "green" : value.includes("due") || value === "low" || value === "open" || value === "high" ? "amber" : value.includes("critical") || value.includes("maintenance") ? "red" : value.includes("progress") ? "blue" : "slate";
  return <Badge tone={tone}>{value.replaceAll("_", " ")}</Badge>;
}

function LoadingGrid() {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-32 animate-pulse rounded-lg bg-slate-200" />)}
    </section>
  );
}

function normalizeOptions(options: FieldConfig[3]): [string, string][] {
  if (!options) return [];
  if (typeof options === "string") return [[options, options]];
  return options.map((option) => Array.isArray(option) ? [option[0] ?? "", option[1] ?? option[0] ?? ""] : [option, option]);
}

function formatCell(value: Row[string]) {
  if (value === undefined || value === "") return "—";
  if (typeof value === "number" && value > 999) return money(value);
  return String(value);
}

function pretty(value: string) {
  return value.replaceAll("_", " ").replace(/([A-Z])/g, " $1").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function inferInputType(field: string) {
  const normalized = field.toLowerCase();
  if (normalized.includes("email")) return "email";
  if (normalized.includes("phone")) return "tel";
  if (normalized.endsWith("date") || normalized === "paidat") return "date";
  if (normalized.endsWith("at")) return "datetime-local";
  return "text";
}

function money(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

function downloadReport(url: string) {
  window.location.assign(url);
}

async function apiGet<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "Request failed");
  return payload.data as T;
}

async function apiPost<T>(url: string, body: Row): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "Request failed");
  return payload.data as T;
}

async function apiPut<T>(url: string, body: Row): Promise<T> {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "Request failed");
  return payload.data as T;
}

async function apiDelete<T>(url: string): Promise<T> {
  const response = await fetch(url, { method: "DELETE" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "Request failed");
  return payload.data as T;
}

async function apiUpload<T>(url: string, body: FormData): Promise<T> {
  const response = await fetch(url, { method: "POST", body });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "Upload failed");
  return payload.data as T;
}
