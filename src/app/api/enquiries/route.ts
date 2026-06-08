import { NextResponse } from "next/server";
import { z } from "zod";
import { promises as fs } from "fs";
import path from "path";

const enquirySchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(10),
  email: z.string().email(),
  message: z.string().min(10),
});

type Enquiry = {
  id: string;
  name: string;
  phone: string;
  email: string;
  message: string;
  createdAt: string;
};

function dataFile() {
  return path.join(process.cwd(), "data", "enquiries.json");
}

async function readEnquiries(): Promise<Enquiry[]> {
  try {
    const raw = await fs.readFile(dataFile(), "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeEnquiries(enquiries: Enquiry[]) {
  await fs.mkdir(path.dirname(dataFile()), { recursive: true });
  await fs.writeFile(dataFile(), JSON.stringify(enquiries, null, 2), "utf-8");
}

export async function POST(request: Request) {
  try {
    const input = enquirySchema.parse(await request.json());
    const enquiries = await readEnquiries();
    const entry: Enquiry = {
      id: `enq_${Date.now()}`,
      ...input,
      createdAt: new Date().toISOString(),
    };
    enquiries.push(entry);
    await writeEnquiries(enquiries);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid input";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET(request: Request) {
  const enquiries = await readEnquiries();
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.toLowerCase();
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(250, Math.max(1, Number(url.searchParams.get("pageSize") ?? 25)));
  let filtered = enquiries;
  if (query) {
    filtered = enquiries.filter((e) =>
      [e.name, e.phone, e.email, e.message].some((v) => v.toLowerCase().includes(query))
    );
  }
  const start = (page - 1) * pageSize;
  const rows = filtered.slice(start, start + pageSize);
  return NextResponse.json({ data: { rows, total: filtered.length, page, pageSize } });
}
