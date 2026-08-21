// Keep only items belonging to people on the manager's team. An empty team
// means "not configured yet", so everything is returned unchanged and the
// feature stays backward compatible until it is set up.
export function teamCode(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function teamCodeSet(team: string[]): Set<string> {
  const set = new Set<string>();
  for (const code of Array.isArray(team) ? team : []) {
    const clean = teamCode(code);
    if (clean) set.add(clean);
  }
  return set;
}

export function filterByTeam<T extends { employeeCode: string }>(
  items: T[],
  team: string[]
): T[] {
  const set = teamCodeSet(team);
  if (!set.size) return items;
  return items.filter((item) => set.has(teamCode(item.employeeCode)));
}
