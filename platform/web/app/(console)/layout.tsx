import Link from "next/link";
import { redirect } from "next/navigation";
import { getToken } from "@/lib/auth";

const GO_API_URL = process.env.GO_API_URL || "http://localhost:8080";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/devices", label: "Devices" },
  { href: "/groups", label: "Groups" },
  { href: "/jobs", label: "Jobs & Commands" },
  { href: "/patches", label: "Patch Management" },
  { href: "/audit", label: "Audit Logs" },
];

export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = await getToken();
  if (!token) redirect("/login");

  let email = "";
  try {
    const res = await fetch(`${GO_API_URL}/api/v1/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.ok) {
      const me = await res.json();
      email = me.email || "";
    } else {
      redirect("/login");
    }
  } catch {
    // API unreachable: keep going, console renders with data errors
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">Sunrise MDM</div>
        <nav className="sidebar-nav">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-user">
          <div>{email}</div>
          <div className="email">
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="btn btn-sm" style={{ marginTop: 8 }}>
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
