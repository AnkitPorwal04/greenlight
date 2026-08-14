import { NextRequest, NextResponse } from "next/server";
import {
  loadEmployees,
  saveEmployees,
  parseEmployeeInput,
  type Employee,
} from "@/lib/employees";

export const dynamic = "force-dynamic";

export async function GET() {
  const employees = await loadEmployees();
  return NextResponse.json({ employees: Object.values(employees) });
}

export async function PUT(req: NextRequest) {
  let raw: string;
  try {
    const body = await req.json();
    raw = String(body.raw ?? "");
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  let parsed: Employee[];
  try {
    parsed = parseEmployeeInput(raw);
  } catch {
    return NextResponse.json(
      { error: "parse_failed", message: "Could not parse input as CSV or JSON" },
      { status: 400 }
    );
  }
  if (parsed.length === 0) {
    return NextResponse.json(
      {
        error: "no_rows",
        message:
          "No valid rows found. Expected CSV (code,name,email) or JSON array.",
      },
      { status: 400 }
    );
  }

  const existing = await loadEmployees();
  for (const e of parsed) existing[e.code.toUpperCase()] = e;
  await saveEmployees(existing);

  return NextResponse.json({ ok: true, count: parsed.length, total: Object.keys(existing).length });
}
