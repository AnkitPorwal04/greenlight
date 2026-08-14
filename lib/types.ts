export type LeaveStatus = "pending" | "approved" | "rejected" | "handled";

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
  decidedAt?: string;
  decisionNote?: string;
}

export interface Decision {
  status: Exclude<LeaveStatus, "pending">;
  decidedAt: string;
  note?: string;
  sentTo?: string;
  cc?: string[];
}
