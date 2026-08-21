// Keep only items belonging to people on the manager's team. An empty team
// means "not configured yet", so everything is returned unchanged and the
// feature stays backward compatible until it is set up.
export function filterByTeam<T extends { employeeCode: string }>(
  items: T[],
  team: string[]
): T[] {
  if (!team.length) return items;
  const set = new Set(team.map((c) => c.toUpperCase()));
  return items.filter((item) => set.has(item.employeeCode.toUpperCase()));
}
