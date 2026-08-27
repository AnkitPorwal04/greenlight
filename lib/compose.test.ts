import { describe, it, expect } from "vitest";
import { composeDecisionMail } from "./compose";
import type { LeaveRequest } from "./types";

function request(over: Partial<LeaveRequest> = {}): LeaveRequest {
  return {
    id: "msg1",
    threadId: "thread1",
    employeeName: "Jane Doe",
    employeeCode: "GRP1234",
    employeeEmail: "jane.doe@example.com",
    leaveType: "Casual Leave",
    fromDate: "10 Sep 2026",
    toDate: "12 Sep 2026",
    numberOfDays: 3,
    reason: "Family function",
    leaveBalance: "8",
    fromSession: "Session 1",
    toSession: "Session 2",
    receivedAt: "2026-09-01T05:00:00.000Z",
    ccRecipients: ["hr@example.com"],
    emailVerified: true,
    bodyText: "",
    status: "pending",
    ...over,
  };
}

describe("composeDecisionMail for a greytHR request", () => {
  it("keeps the leave application wording", () => {
    const { subject, body } = composeDecisionMail({
      request: request(),
      action: "approved",
    });
    expect(subject).toBe("Re: Leave Application from Jane Doe [GRP1234].");
    expect(body).toBe(
      "Hi Jane,\n\nYour Casual Leave request for 10 Sep 2026 to 12 Sep 2026 has been approved."
    );
  });

  it("keeps the cancellation wording", () => {
    const { subject, body } = composeDecisionMail({
      request: request({ kind: "cancellation" }),
      action: "rejected",
    });
    expect(subject).toBe("Re: Leave Cancellation from Jane Doe [GRP1234].");
    expect(body).toContain(
      "Your request to cancel your Casual Leave for 10 Sep 2026 to 12 Sep 2026 has been rejected."
    );
  });

  it("collapses a single-day range", () => {
    const { body } = composeDecisionMail({
      request: request({ fromDate: "10 Sep 2026", toDate: "10 Sep 2026" }),
      action: "approved",
    });
    expect(body).toContain("request for 10 Sep 2026 has been approved.");
  });
});

describe("composeDecisionMail for a direct request", () => {
  const direct = (over: Partial<LeaveRequest> = {}) =>
    request({ source: "direct", ...over });

  it("names the request type in the subject", () => {
    const { subject } = composeDecisionMail({
      request: direct(),
      action: "approved",
    });
    expect(subject).toBe("Re: Casual Leave request from Jane Doe [GRP1234].");
  });

  it("greets by first name and states the outcome", () => {
    const { body } = composeDecisionMail({
      request: direct(),
      action: "approved",
    });
    expect(body).toBe(
      "Hi Jane,\n\nYour Casual Leave request for 10 Sep 2026 to 12 Sep 2026 has been approved."
    );
  });

  it("handles a work-from-home request", () => {
    const { subject, body } = composeDecisionMail({
      request: direct({
        leaveType: "Work From Home",
        fromDate: "10 Sep 2026",
        toDate: "10 Sep 2026",
      }),
      action: "approved",
    });
    expect(subject).toBe("Re: Work From Home request from Jane Doe [GRP1234].");
    expect(body).toContain(
      "Your Work From Home request for 10 Sep 2026 has been approved."
    );
  });

  it("uses the cancellation phrasing for a direct cancellation", () => {
    const { body } = composeDecisionMail({
      request: direct({ kind: "cancellation" }),
      action: "approved",
    });
    expect(body).toContain(
      "Your request to cancel your Casual Leave for 10 Sep 2026 to 12 Sep 2026 has been approved."
    );
  });

  it("omits the date range when the mail never gave one", () => {
    const { body } = composeDecisionMail({
      request: direct({ fromDate: "", toDate: "" }),
      action: "rejected",
    });
    expect(body).toBe(
      "Hi Jane,\n\nYour Casual Leave request has been rejected."
    );
    expect(body).not.toContain(" for  ");
  });

  it("omits the date range for an undated cancellation too", () => {
    const { body } = composeDecisionMail({
      request: direct({ kind: "cancellation", fromDate: "", toDate: "" }),
      action: "approved",
    });
    expect(body).toBe(
      "Hi Jane,\n\nYour request to cancel your Casual Leave has been approved."
    );
  });
});
