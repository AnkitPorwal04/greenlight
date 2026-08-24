export const EMAIL_RE = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/;

export function isEmailAddress(value: string | null | undefined): boolean {
  return typeof value === "string" && EMAIL_RE.test(value.trim());
}
