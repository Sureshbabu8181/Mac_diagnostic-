import { NextResponse } from "next/server";
import { TOKEN_COOKIE, TOKEN_MAX_AGE } from "@/lib/auth";

const GO_API_URL = process.env.GO_API_URL || "http://localhost:8080";

export async function POST(request: Request) {
  const body = await request.json();
  const upstream = await fetch(`${GO_API_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await upstream.json();
  if (!upstream.ok) {
    return NextResponse.json(data, { status: upstream.status });
  }
  const response = NextResponse.json(data);
  response.cookies.set(TOKEN_COOKIE, data.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TOKEN_MAX_AGE,
  });
  return response;
}
