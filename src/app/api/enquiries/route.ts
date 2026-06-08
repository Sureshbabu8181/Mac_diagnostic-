import { NextResponse } from "next/server";
import { z } from "zod";

const enquirySchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(10),
  email: z.string().email(),
  message: z.string().min(10),
});

const enquiries: unknown[] = [];

export async function POST(request: Request) {
  try {
    const input = enquirySchema.parse(await request.json());
    const entry = { ...input, createdAt: new Date().toISOString() };
    enquiries.push(entry);
    console.log("New enquiry saved:", entry);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid input";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({ data: enquiries });
}
