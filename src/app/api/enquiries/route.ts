import { NextResponse } from "next/server";
import { z } from "zod";
import { getStorage } from "@/lib/storage";
import { makeId } from "@/lib/storage/storage-adapter";

const enquirySchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(10),
  email: z.string().email(),
  message: z.string().min(10),
});

export async function POST(request: Request) {
  try {
    const input = enquirySchema.parse(await request.json());
    const storage = getStorage();
    await storage.create("enquiries", {
      id: makeId("enq"),
      name: input.name,
      phone: input.phone,
      email: input.email,
      message: input.message,
      createdAt: new Date().toISOString(),
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid input";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
