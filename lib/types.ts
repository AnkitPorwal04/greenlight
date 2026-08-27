export type LeaveStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "withdrawn"
  | "handled";

// "leave" = a normal leave application; "cancellation" = a request to cancel a
// leave the employee had already applied for. Absent means "leave" (backward
// compatible with anything constructed before this field existed).
export type LeaveKind = "leave" | "cancellation";

export type LeaveSource = "greythr" | "direct";

export interface LeaveRequest {
  id: string;
  threadId: string;
  employeeName: string;
  employeeCode: string;
  employeeEmail: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  numberOfDays: number;
  reason: string;
  leaveBalance: string;
  fromSession: string;
  toSession: string;
  receivedAt: string;
  ccRecipients: string[];
  emailVerified: boolean;
  bodyText: string;
  status: LeaveStatus;
  kind?: LeaveKind;
  source?: LeaveSource;
  needsReview?: boolean;
  decidedAt?: string;
  decisionNote?: string;
  mailSent?: boolean;
}

export interface Decision {
  status: Exclude<LeaveStatus, "pending">;
  decidedAt: string;
  note?: string;
  sentTo?: string;
  cc?: string[];
}
