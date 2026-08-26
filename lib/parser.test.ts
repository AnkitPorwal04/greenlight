import { describe, it, expect } from "vitest";
import type { gmail_v1 } from "@googleapis/gmail";
import { parseLeaveMail, extractBodyText, guessEmployeeEmail } from "./parser";

const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64url");

function header(name: string, value: string): gmail_v1.Schema$MessagePartHeader {
  return { name, value };
}

/** Build a single-part message (plain text or html). */
function msg(opts: {
  subject?: string;
  to?: string;
  cc?: string;
  plain?: string;
  html?: string;
}): gmail_v1.Schema$Message {
  const headers: gmail_v1.Schema$MessagePartHeader[] = [];
  if (opts.subject !== undefined) headers.push(header("Subject", opts.subject));
  if (opts.to !== undefined) headers.push(header("To", opts.to));
  if (opts.cc !== undefined) headers.push(header("Cc", opts.cc));

  const payload: gmail_v1.Schema$MessagePart = { headers };
  if (opts.plain !== undefined) {
    payload.mimeType = "text/plain";
    payload.body = { data: b64url(opts.plain) };
  } else if (opts.html !== undefined) {
    payload.mimeType = "text/html";
    payload.body = { data: b64url(opts.html) };
  }
  return { payload };
}

const REGULAR = [
  "Hi,",
  "",
  "Aarav Sharma [GRP1042] has applied for a leave. The details are given below.",
  "",
  "Leave type: Casual Leave",
  "From Date: 17 Aug 2026",
  "To Date: 18 Aug 2026",
  "From Session: Session 1",
  "To Session: Session 2",
  "Number of days: 2",
  "Reason: Family function out of town.",
  "Leave Balance: Casual: 6.5",
].join("\n");

const RESTRICTED_HOLIDAY = [
  "Hi,",
  "",
  "Nitin Kumar [GRP1941] has applied for a restricted leave. Please log on to https://ethara-ai.greythr.com/ and review the leave application.",
  "",
  "Details are as follows",
  "Leave balance: 2.0",
  "Employee: Nitin Kumar [GRP1941]",
  "Leave type: Restricted Holiday",
  "Date: 28 Aug 2026",
  "Remarks: Family function at Raksha Bandhan.",
  "",
  "Click here to approve/reject this request.",
  "Note: This is an auto-generated mail. Please do not reply.",
].join("\n");

describe("parseLeaveMail - regular leave", () => {
  const r = parseLeaveMail(
    msg({
      subject: "Leave Application from Aarav Sharma [GRP1042]",
      to: "manager@ethara-ai.com",
      plain: REGULAR,
    }),
    "manager@ethara-ai.com"
  );

  it("parses (not null)", () => expect(r).not.toBeNull());
  it("employee name and code", () => {
    expect(r?.employeeName).toBe("Aarav Sharma");
    expect(r?.employeeCode).toBe("GRP1042");
  });
  it("leave type", () => expect(r?.leaveType).toBe("Casual Leave"));
  it("from/to dates", () => {
    expect(r?.fromDate).toBe("17 Aug 2026");
    expect(r?.toDate).toBe("18 Aug 2026");
  });
  it("number of days", () => expect(r?.numberOfDays).toBe(2));
  it("reason", () => expect(r?.reason).toBe("Family function out of town."));
  it("leave balance", () => expect(r?.leaveBalance).toBe("Casual: 6.5"));
  it("sessions", () => {
    expect(r?.fromSession).toBe("Session 1");
    expect(r?.toSession).toBe("Session 2");
  });
});

describe("parseLeaveMail - restricted holiday (different format)", () => {
  const r = parseLeaveMail(
    msg({
      subject: "Restricted Holiday Leave Application from Nitin Kumar [GRP1941]",
      to: "pradyumn@ethara-ai.com, manager@ethara-ai.com",
      plain: RESTRICTED_HOLIDAY,
    }),
    "manager@ethara-ai.com"
  );

  it("parses (not null)", () => expect(r).not.toBeNull());
  it("employee name and code", () => {
    expect(r?.employeeName).toBe("Nitin Kumar");
    expect(r?.employeeCode).toBe("GRP1941");
  });
  it("leave type", () => expect(r?.leaveType).toBe("Restricted Holiday"));
  it("single Date maps to both from and to", () => {
    expect(r?.fromDate).toBe("28 Aug 2026");
    expect(r?.toDate).toBe("28 Aug 2026");
  });
  it("defaults to 1 day when 'Number of days' is absent", () =>
    expect(r?.numberOfDays).toBe(1));
  it("reads Remarks as the reason", () =>
    expect(r?.reason).toBe("Family function at Raksha Bandhan."));
  it("reads lowercase 'Leave balance'", () =>
    expect(r?.leaveBalance).toBe("2.0"));
});

describe("parseLeaveMail - day counts", () => {
  it("half day (0.5)", () => {
    const body = REGULAR.replace("Number of days: 2", "Number of days: 0.5");
    const r = parseLeaveMail(msg({ plain: body }), "manager@ethara-ai.com");
    expect(r?.numberOfDays).toBe(0.5);
  });
  it("no dates and no day count -> 0", () => {
    const r = parseLeaveMail(
      msg({
        subject: "Leave Application from Priya Menon [GRP0500]",
        plain: "Some unrelated body with no fields.",
      }),
      "manager@ethara-ai.com"
    );
    expect(r?.numberOfDays).toBe(0);
  });
});

describe("parseLeaveMail - subject fallback", () => {
  it("uses subject when the body has no 'has applied for' line", () => {
    const r = parseLeaveMail(
      msg({
        subject: "Leave Application from Priya Menon [GRP0500]",
        plain: "This body intentionally has no application sentence.",
      }),
      "manager@ethara-ai.com"
    );
    expect(r?.employeeName).toBe("Priya Menon");
    expect(r?.employeeCode).toBe("GRP0500");
  });
});

describe("parseLeaveMail - html body", () => {
  it("strips html and still parses", () => {
    const html =
      "<p>Hi,</p><p>Rahul Roy [GRP0777] has applied for a leave.</p>" +
      "<p>Leave type: Sick Leave<br>From Date: 01 Sep 2026<br>" +
      "To Date: 01 Sep 2026<br>Number of days: 1<br>Reason: Fever.<br>" +
      "Leave Balance: Sick 3</p>";
    const r = parseLeaveMail(msg({ html }), "manager@ethara-ai.com");
    expect(r?.employeeName).toBe("Rahul Roy");
    expect(r?.leaveType).toBe("Sick Leave");
    expect(r?.fromDate).toBe("01 Sep 2026");
    expect(r?.numberOfDays).toBe(1);
    expect(r?.reason).toBe("Fever.");
  });
});

describe("parseLeaveMail - CC handling", () => {
  it("drops self and no-reply, dedupes, lowercases", () => {
    const r = parseLeaveMail(
      msg({
        subject: "Leave Application from Aarav Sharma [GRP1042]",
        to: "Manager@ethara-ai.com",
        cc: "HR@ethara-ai.com, priya@ethara-ai.com, no-reply@greythr.com, hr@ethara-ai.com",
        plain: REGULAR,
      }),
      "manager@ethara-ai.com"
    );
    expect(r?.ccRecipients).toEqual([
      "hr@ethara-ai.com",
      "priya@ethara-ai.com",
    ]);
  });
});

describe("parseLeaveMail - returns null", () => {
  it("when no employee can be identified", () => {
    const r = parseLeaveMail(
      msg({ subject: "Weekly newsletter", plain: "Nothing to see here." }),
      "manager@ethara-ai.com"
    );
    expect(r).toBeNull();
  });
});

describe("guessEmployeeEmail", () => {
  it("builds first.last@domain from the first recipient", () => {
    expect(guessEmployeeEmail("Nitin Kumar", ["hr@ethara-ai.com"])).toBe(
      "nitin.kumar@ethara-ai.com"
    );
  });
  it("strips punctuation from the name", () => {
    expect(guessEmployeeEmail("O'Brien Smith", ["x@acme.co"])).toBe(
      "obrien.smith@acme.co"
    );
  });
  it("returns empty when there is no recipient domain", () => {
    expect(guessEmployeeEmail("Nitin Kumar", [])).toBe("");
  });
  it("returns empty when the name is blank", () => {
    expect(guessEmployeeEmail("", ["x@acme.co"])).toBe("");
  });
});

describe("extractBodyText", () => {
  it("prefers the plain-text part over html", () => {
    const message: gmail_v1.Schema$Message = {
      payload: {
        mimeType: "multipart/alternative",
        parts: [
          { mimeType: "text/plain", body: { data: b64url("PLAIN VERSION") } },
          {
            mimeType: "text/html",
            body: { data: b64url("<p>HTML VERSION</p>") },
          },
        ],
      },
    };
    expect(extractBodyText(message)).toContain("PLAIN VERSION");
    expect(extractBodyText(message)).not.toContain("HTML VERSION");
  });
});

const CANCELLATION = [
  "Hi,",
  "",
  "Isha Nair [GRP0987] has applied for a leave cancellation. Please log on to greytHR and review the request.",
  "",
  "Leave type: Sick Leave",
  "From Date: 20 Aug 2026",
  "To Date: 21 Aug 2026",
  "Number of days: 2",
  "Reason: Recovered earlier than expected.",
  "Leave Balance: Sick: 4",
].join("\n");

describe("parseLeaveMail - kind", () => {
  it("tags a normal application as kind 'leave'", () => {
    const r = parseLeaveMail(
      msg({ subject: "Leave Application from Aarav Sharma [GRP1042]", plain: REGULAR }),
      "manager@ethara-ai.com"
    );
    expect(r?.kind).toBe("leave");
  });

  it("tags a cancellation mail as kind 'cancellation'", () => {
    const r = parseLeaveMail(
      msg({
        subject: "Leave Cancellation from Isha Nair [GRP0987]",
        to: "manager@ethara-ai.com",
        plain: CANCELLATION,
      }),
      "manager@ethara-ai.com"
    );
    expect(r?.kind).toBe("cancellation");
    expect(r?.employeeName).toBe("Isha Nair");
    expect(r?.employeeCode).toBe("GRP0987");
    expect(r?.leaveType).toBe("Sick Leave");
    expect(r?.fromDate).toBe("20 Aug 2026");
    expect(r?.toDate).toBe("21 Aug 2026");
  });

  it("uses the subject, not the reason text, to detect a cancellation", () => {
    const body = REGULAR.replace(
      "Reason: Family function out of town.",
      "Reason: Rebooking a cancelled flight."
    );
    const r = parseLeaveMail(
      msg({ subject: "Leave Application from Aarav Sharma [GRP1042]", plain: body }),
      "manager@ethara-ai.com"
    );
    expect(r?.kind).toBe("leave");
  });
});
