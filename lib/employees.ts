import { getJSON, setJSON } from "./storage";
import EMPLOYEES_RAW from "./employees-data";

export interface Employee {
  code: string;
  name: string;
  email: string;
}

const EMPLOYEES_KEY = "employees";

let baseline: Record<string, Employee> | null = null;

function baselineEmployees(): Record<string, Employee> {
  if (!baseline) {
    baseline = {};
    for (const e of parseEmployeeInput(EMPLOYEES_RAW)) {
      baseline[e.code.toUpperCase()] = e;
    }
  }
  return baseline;
}

export async function loadEmployees(): Promise<Record<string, Employee>> {
  const overrides =
    (await getJSON<Record<string, Employee>>(EMPLOYEES_KEY)) ?? {};
  return { ...baselineEmployees(), ...overrides };
}

export async function saveEmployees(employees: Record<string, Employee>) {
  await setJSON(EMPLOYEES_KEY, employees);
}

export function parseEmployeeInput(raw: string): Employee[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const data = JSON.parse(trimmed);
    const list = Array.isArray(data) ? data : Object.values(data);
    return list
      .map((e) => ({
        code: String(e.code ?? e.employeeCode ?? e.id ?? "").trim(),
        name: String(e.name ?? e.employeeName ?? "").trim(),
        email: String(e.email ?? e.mail ?? "").trim().toLowerCase(),
      }))
      .filter((e) => e.code && e.email);
  }

  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
  const rows = lines.map((l) => l.split(/[,;\t]/).map((c) => c.trim()));
  const header = rows[0].map((c) => c.toLowerCase());
  const hasHeader =
    header.includes("code") || header.includes("email") || header.includes("name");
  const body = hasHeader ? rows.slice(1) : rows;

  const idx = {
    code: hasHeader ? header.findIndex((h) => h.includes("code") || h === "id") : 0,
    name: hasHeader ? header.findIndex((h) => h.includes("name")) : 1,
    email: hasHeader ? header.findIndex((h) => h.includes("mail")) : 2,
  };

  return body
    .map((cols) => ({
      code: (cols[idx.code] ?? "").trim(),
      name: (cols[idx.name] ?? "").trim(),
      email: (cols[idx.email] ?? "").trim().toLowerCase(),
    }))
    .filter((e) => e.code && e.email.includes("@"));
}
