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

export function parseFilterTerms(query: string): string[] {
  return [
    ...new Set(
      query
        .split(/[\s,;|]+/)
        .map((part) => normalizeTerm(part))
        .filter(Boolean)
    ),
  ];
}

export function personCodes(people: PersonLike[]): string[] {
  return people
    .map((person) => normalizeText(person.code).toUpperCase())
    .filter(Boolean);
}

export function filterPeople<T extends PersonLike>(
  people: T[],
  query: string
): T[] {
  const terms = parseFilterTerms(query);
  if (terms.length === 0) return people;
  return people.filter((person) =>
    terms.some((term) => matchesPerson(person, term))
  );
}
