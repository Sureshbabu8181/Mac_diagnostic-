import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import bcrypt from "bcryptjs";
import type { Role, User } from "../models";
import { getStorage } from "../storage";

const cookieName = "pg_session";

function secretKey() {
  const secret = process.env.AUTH_SECRET ?? "dev-only-change-this-secret";
  return new TextEncoder().encode(secret);
}

export type SessionUser = Pick<User, "id" | "email" | "name" | "role" | "propertyId" | "residentId">;

export async function createSession(user: SessionUser) {
  const token = await new SignJWT(user)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secretKey());

  (await cookies()).set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function clearSession() {
  (await cookies()).delete(cookieName);
}

export async function getSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload as SessionUser;
  } catch {
    return null;
  }
}

export async function requireSession(allowedRoles?: Role[]) {
  const session = await getSession();
  if (!session) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  if (allowedRoles && !allowedRoles.includes(session.role)) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }
  return session;
}

export async function authenticate(email: string, password: string) {
  const storage = getStorage();
  const users = await storage.list("users", { filters: { email }, includeDeleted: false, pageSize: 1 });
  const user = users.rows[0];
  if (!user || user.status !== "active") return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    propertyId: user.propertyId,
    residentId: user.residentId,
  } satisfies SessionUser;
}
