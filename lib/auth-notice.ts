const AUTH_PARAM = "auth";

export type AuthNoticeTone = "success" | "error";

export interface AuthNotice {
  message: string;
  tone: AuthNoticeTone;
}

const AUTH_NOTICES = new Map<string, AuthNotice>([
  ["success", { message: "Gmail connected", tone: "success" }],
  ["denied", { message: "Gmail was not connected — you cancelled", tone: "error" }],
  [
    "error",
    { message: "Could not connect Gmail — please try again", tone: "error" },
  ],
  [
    "forbidden",
    {
      message: "That Google account is not allowed to use Greenlight",
      tone: "error",
    },
  ],
]);

export function authNotice(
  value: string | null | undefined
): AuthNotice | null {
  if (!value) return null;
  return AUTH_NOTICES.get(value) ?? null;
}

export function searchWithoutAuthParam(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(AUTH_PARAM);
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}

export function authParamFromSearch(search: string): string | null {
  return new URLSearchParams(search).get(AUTH_PARAM);
}
