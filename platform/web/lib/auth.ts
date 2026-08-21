import { cookies } from "next/headers";

export const TOKEN_COOKIE = "sunrise_token";
export const TOKEN_MAX_AGE = 8 * 60 * 60;

export async function getToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(TOKEN_COOKIE)?.value;
}
