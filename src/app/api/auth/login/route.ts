import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { authenticate, createSession } from "@/lib/auth/session";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(request: Request) {
  try {
    const input = loginSchema.parse(await request.json());
    const user = await authenticate(input.email, input.password);
    if (!user) throw Object.assign(new Error("Invalid email or password"), { status: 401 });
    await createSession(user);
    return ok(user);
  } catch (error) {
    return fail(error);
  }
}
