import type { LeaveStatus } from "./types";

export type RecordedStatus = Exclude<LeaveStatus, "pending">;

export const RECORDED_STATUSES: RecordedStatus[] = [
  "approved",
  "rejected",
  "handled",
];

export function isRecordedStatus(value: unknown): value is RecordedStatus {
  return (
    typeof value === "string" &&
    (RECORDED_STATUSES as string[]).includes(value)
  );
}

export function recordedNote(status: RecordedStatus): string {
  if (status === "approved") {
    return "Recorded as accepted (dealt with outside Greenlight)";
  }
  if (status === "rejected") {
    return "Recorded as rejected (dealt with outside Greenlight)";
  }
  return "Marked as handled (dealt with outside Greenlight)";
}

export function recordedToast(status: RecordedStatus, count: number): string {
  if (count > 1) {
    const verb =
      status === "handled" ? "marked as handled" : `recorded as ${status}`;
    return `${count} requests ${verb}`;
  }
  if (status === "approved") return "Recorded as accepted — no mail sent";
  if (status === "rejected") return "Recorded as rejected — no mail sent";
  return "Marked as handled — no mail sent";
}
