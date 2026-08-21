export interface Person {
  code: string;
  name: string;
  email: string;
}

export function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function normalizeTerm(value: unknown): string {
  return normalizeText(value)
    .replace(/^[<("']+/, "")
    .replace(/[>)"',;.]+$/, "");
}

export type PersonLike = Partial<Person>;

export function matchesPerson(person: PersonLike, term: string): boolean {
  const needle = normalizeTerm(term);
  if (!needle) return true;
  return (
    normalizeText(person.name).includes(needle) ||
    normalizeText(person.code).includes(needle) ||
    normalizeText(person.email).includes(needle)
  );
}
