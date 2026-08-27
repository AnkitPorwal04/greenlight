import { describe, it, expect } from "vitest";
import {
  buildDirectQueries,
  buildDirectQuery,
  classificationToRequest,
  cleanDirectAddresses,
  directLeaveType,
  replyAllCc,
  DIRECT_MAX_ADDRESSES,
} from "./direct";
import { parseLeaveDate } from "./leave-dates";
import { trimDismissed, MAX_DISMISSED } from "./store";
import { isUnclassifiable, UNCLASSIFIABLE } from "./classify";
import type { DirectClassification } from "./classify";
import type { DirectMail, DirectPerson } from "./direct";

const person: DirectPerson = {
  code: "GRP1234",
  name: "Jane Doe",
  email: "jane.doe@example.com",
};

const mail: DirectMail = {
  id: "msg1",
  threadId: "thread1",
  subject: "Leave on Thursday",
  bodyText: "Hi, taking Thursday off for a family function.",
  receivedAt: "2026-09-01T05:00:00.000Z",
  senderEmail: "jane.doe@example.com",
  recipients: ["manager@example.com", "hr@example.com", "jane.doe@example.com"],
  selfEmail: "manager@example.com",
};

function classification(
  over: Partial<DirectClassification> = {}
): DirectClassification {
  return {
    isRequest: true,
    kind: "leave",
    fromDate: "2026-09-10",
    toDate: "2026-09-12",
    leaveType: "Casual Leave",
    confidence: 0.9,
    ...over,
  };
}

describe("cleanDirectAddresses", () => {
  it("keeps only well-formed addresses, lowercased and unique", () => {
    expect(
      cleanDirectAddresses([
        "Jane.Doe@Example.com",
        "jane.doe@example.com",
        "not-an-email",
        "  bob@example.co.in  ",
        "",
      ])
    ).toEqual(["jane.doe@example.com", "bob@example.co.in"]);
  });
});

describe("buildDirectQuery", () => {
  it("quotes every sender and scopes the search", () => {
    expect(
      buildDirectQuery(["a@x.com", "b@y.com"], "2026/08/01")
    ).toBe(
      'from:("a@x.com" OR "b@y.com") (leave OR WFH OR "work from home" OR "day off" OR "time off") after:2026/08/01 -from:no-reply@greythr.com'
    );
  });

  it("always excludes the greytHR sender", () => {
    expect(buildDirectQuery(["a@x.com"], "2026/08/01")).toContain(
      "-from:no-reply@greythr.com"
    );
  });

  it("drops addresses that are not valid emails", () => {
    const q = buildDirectQuery(["a@x.com", "nope", "a b@x.com"], "2026/08/01");
    expect(q).toContain('"a@x.com"');
    expect(q).not.toContain("nope");
    expect(q).not.toContain("a b@x.com");
  });

  it("returns an empty query when no address survives validation", () => {
    expect(buildDirectQuery(["nope", ""], "2026/08/01")).toBe("");
    expect(buildDirectQuery([], "2026/08/01")).toBe("");
  });

  it("omits a malformed after: clause rather than corrupting the query", () => {
    const q = buildDirectQuery(["a@x.com"], "last tuesday");
    expect(q).not.toContain("after:");
    expect(q).toContain('from:("a@x.com")');
  });

  it("caps the sender list", () => {
    const many = Array.from({ length: 60 }, (_, i) => `p${i}@x.com`);
    const q = buildDirectQuery(many, "2026/08/01");
    expect(q.match(/@x\.com/g)).toHaveLength(DIRECT_MAX_ADDRESSES);
  });
});

describe("buildDirectQueries", () => {
  it("returns a single query for a small team", () => {
    expect(buildDirectQueries(["a@x.com", "b@x.com"], "2026/08/01")).toHaveLength(
      1
    );
  });

  it("chunks a large team into whole queries", () => {
    const many = Array.from({ length: 95 }, (_, i) => `p${i}@x.com`);
    const queries = buildDirectQueries(many, "2026/08/01");
    expect(queries).toHaveLength(3);
    expect(queries[0].match(/@x\.com/g)).toHaveLength(40);
    expect(queries[1].match(/@x\.com/g)).toHaveLength(40);
    expect(queries[2].match(/@x\.com/g)).toHaveLength(15);
  });

  it("covers every valid address across the chunks", () => {
    const many = Array.from({ length: 45 }, (_, i) => `p${i}@x.com`);
    const joined = buildDirectQueries(many, "2026/08/01").join(" ");
    for (const addr of many) expect(joined).toContain(`"${addr}"`);
  });

  it("returns nothing for an empty team", () => {
    expect(buildDirectQueries([], "2026/08/01")).toEqual([]);
  });
});

describe("replyAllCc", () => {
  it("drops the manager and the sender, keeping HR looped in", () => {
    expect(
      replyAllCc(
        ["manager@example.com", "hr@example.com", "jane.doe@example.com"],
        "manager@example.com",
        "jane.doe@example.com"
      )
    ).toEqual(["hr@example.com"]);
  });

  it("ignores case when removing the manager and the sender", () => {
    expect(
      replyAllCc(
        ["Manager@Example.com", "HR@Example.com", "Jane.Doe@Example.com"],
        "manager@example.com",
        "jane.doe@example.com"
      )
    ).toEqual(["hr@example.com"]);
  });

  it("filters out anything that is not a valid address", () => {
    expect(
      replyAllCc(
        ["hr@example.com", "undisclosed-recipients", "a b@x.com", ""],
        "manager@example.com",
        "jane.doe@example.com"
      )
    ).toEqual(["hr@example.com"]);
  });

  it("drops no-reply mailboxes and duplicates", () => {
    expect(
      replyAllCc(
        ["hr@example.com", "HR@example.com", "no-reply@greythr.com"],
        "manager@example.com",
        "jane.doe@example.com"
      )
    ).toEqual(["hr@example.com"]);
  });
});

describe("directLeaveType", () => {
  it("labels a work-from-home request", () => {
    expect(directLeaveType(classification({ kind: "wfh" }))).toBe(
      "Work From Home"
    );
    expect(
      directLeaveType(classification({ kind: "wfh", leaveType: "remote" }))
    ).toBe("Work From Home");
  });

  it("uses the stated type when there is one", () => {
    expect(directLeaveType(classification({ leaveType: "Sick Leave" }))).toBe(
      "Sick Leave"
    );
  });

  it("falls back to a plain label", () => {
    expect(directLeaveType(classification({ leaveType: null }))).toBe("Leave");
  });
});

describe("classificationToRequest", () => {
  it("maps a confident request onto a leave request", () => {
    const r = classificationToRequest(mail, person, classification());
    expect(r).not.toBeNull();
    expect(r!.id).toBe("msg1");
    expect(r!.threadId).toBe("thread1");
    expect(r!.employeeCode).toBe("GRP1234");
    expect(r!.employeeEmail).toBe("jane.doe@example.com");
    expect(r!.source).toBe("direct");
    expect(r!.status).toBe("pending");
    expect(r!.emailVerified).toBe(true);
    expect(r!.needsReview).toBe(false);
  });

  it("renders dates in the format the rest of the app parses", () => {
    const r = classificationToRequest(mail, person, classification())!;
    expect(r.fromDate).toBe("10 Sep 2026");
    expect(r.toDate).toBe("12 Sep 2026");
    expect(parseLeaveDate(r.fromDate)).toBe("2026-09-10");
    expect(parseLeaveDate(r.toDate)).toBe("2026-09-12");
  });

  it("counts days inclusively", () => {
    expect(
      classificationToRequest(mail, person, classification())!.numberOfDays
    ).toBe(3);
    expect(
      classificationToRequest(
        mail,
        person,
        classification({ fromDate: "2026-09-10", toDate: "2026-09-10" })
      )!.numberOfDays
    ).toBe(1);
    expect(
      classificationToRequest(
        mail,
        person,
        classification({ fromDate: "2026-12-30", toDate: "2027-01-02" })
      )!.numberOfDays
    ).toBe(4);
  });

  it("survives a reversed date pair", () => {
    expect(
      classificationToRequest(
        mail,
        person,
        classification({ fromDate: "2026-09-12", toDate: "2026-09-10" })
      )!.numberOfDays
    ).toBe(3);
  });

  it("maps a work-from-home request to the matching leave type", () => {
    const r = classificationToRequest(
      mail,
      person,
      classification({ kind: "wfh", leaveType: null })
    )!;
    expect(r.leaveType).toBe("Work From Home");
    expect(r.kind).toBe("leave");
  });

  it("keeps a cancellation kind", () => {
    expect(
      classificationToRequest(mail, person, classification({ kind: "cancellation" }))!
        .kind
    ).toBe("cancellation");
  });

  it("carries the reply-all cc list", () => {
    expect(classificationToRequest(mail, person, classification())!.ccRecipients).toEqual(
      ["hr@example.com"]
    );
  });

  it("flags a middling confidence for review", () => {
    expect(
      classificationToRequest(mail, person, classification({ confidence: 0.5 }))!
        .needsReview
    ).toBe(true);
    expect(
      classificationToRequest(mail, person, classification({ confidence: 0.7 }))!
        .needsReview
    ).toBe(false);
    expect(
      classificationToRequest(mail, person, classification({ confidence: 0.69 }))!
        .needsReview
    ).toBe(true);
  });

  it("flags a confident request with no dates for review", () => {
    const r = classificationToRequest(
      mail,
      person,
      classification({ confidence: 0.99, fromDate: null, toDate: null })
    )!;
    expect(r.needsReview).toBe(true);
    expect(r.fromDate).toBe("");
    expect(r.toDate).toBe("");
    expect(r.numberOfDays).toBe(1);
  });

  it("excludes anything below the floor", () => {
    expect(
      classificationToRequest(mail, person, classification({ confidence: 0.39 }))
    ).toBeNull();
    expect(
      classificationToRequest(mail, person, classification({ confidence: 0 }))
    ).toBeNull();
    expect(
      classificationToRequest(mail, person, classification({ confidence: 0.4 }))
    ).not.toBeNull();
  });

  it("excludes a mail that is not a request at all", () => {
    expect(
      classificationToRequest(
        mail,
        person,
        classification({ isRequest: false, confidence: 1 })
      )
    ).toBeNull();
  });

  it("excludes a sender who is not in the directory", () => {
    expect(classificationToRequest(mail, null, classification())).toBeNull();
  });

  it("uses the subject as the reason, falling back to the body", () => {
    expect(classificationToRequest(mail, person, classification())!.reason).toBe(
      "Leave on Thursday"
    );
    expect(
      classificationToRequest(
        { ...mail, subject: "   " },
        person,
        classification()
      )!.reason
    ).toBe("Hi, taking Thursday off for a family function.");
  });

  it("caps an absurd date span", () => {
    expect(
      classificationToRequest(
        mail,
        person,
        classification({ fromDate: "2026-01-01", toDate: "2099-01-01" })
      )!.numberOfDays
    ).toBe(365);
  });
});

describe("classificationToRequest, unclassifiable mail", () => {
  it("surfaces the mail for review instead of dropping it", () => {
    const r = classificationToRequest(mail, person, UNCLASSIFIABLE);
    expect(r).not.toBeNull();
    expect(r!.id).toBe("msg1");
    expect(r!.threadId).toBe("thread1");
    expect(r!.source).toBe("direct");
    expect(r!.needsReview).toBe(true);
    expect(r!.status).toBe("pending");
  });

  it("describes the absence in the neutral way the row renders", () => {
    const r = classificationToRequest(mail, person, UNCLASSIFIABLE)!;
    expect(r.kind).toBe("leave");
    expect(r.leaveType).toBe("Leave");
    expect(r.fromDate).toBe("");
    expect(r.toDate).toBe("");
    expect(r.numberOfDays).toBe(1);
  });

  it("uses the subject as the reason, falling back to the body", () => {
    expect(classificationToRequest(mail, person, UNCLASSIFIABLE)!.reason).toBe(
      "Leave on Thursday"
    );
    expect(
      classificationToRequest({ ...mail, subject: "  " }, person, UNCLASSIFIABLE)!
        .reason
    ).toBe("Hi, taking Thursday off for a family function.");
  });

  it("carries the employee and the reply-all cc list", () => {
    const r = classificationToRequest(mail, person, UNCLASSIFIABLE)!;
    expect(r.employeeCode).toBe("GRP1234");
    expect(r.employeeEmail).toBe("jane.doe@example.com");
    expect(r.emailVerified).toBe(true);
    expect(r.ccRecipients).toEqual(["hr@example.com"]);
    expect(r.bodyText).toBe(mail.bodyText);
  });

  it("still excludes a sender who is not in the directory", () => {
    expect(classificationToRequest(mail, null, UNCLASSIFIABLE)).toBeNull();
  });

  it("outranks the isRequest and confidence gates that would drop it", () => {
    expect(UNCLASSIFIABLE.isRequest).toBe(false);
    expect(UNCLASSIFIABLE.confidence).toBe(0);
    expect(
      classificationToRequest(
        mail,
        person,
        classification({ isRequest: false, confidence: 0 })
      )
    ).toBeNull();
  });

  it("keeps producing the review row after a cache round trip", () => {
    const cached = JSON.parse(
      JSON.stringify(UNCLASSIFIABLE)
    ) as DirectClassification;
    expect(isUnclassifiable(cached)).toBe(true);
    expect(classificationToRequest(mail, person, cached)!.needsReview).toBe(true);
  });

  it("ignores stray fields on a marked classification", () => {
    const r = classificationToRequest(
      mail,
      person,
      classification({
        unclassifiable: true,
        kind: "cancellation",
        leaveType: "Sick Leave",
        confidence: 0.99,
      })
    )!;
    expect(r.kind).toBe("leave");
    expect(r.leaveType).toBe("Leave");
    expect(r.fromDate).toBe("");
    expect(r.needsReview).toBe(true);
  });

  it("leaves an ordinary answer unmarked", () => {
    expect(isUnclassifiable(classification())).toBe(false);
    expect(isUnclassifiable(null)).toBe(false);
    expect(
      classificationToRequest(mail, person, classification())!.needsReview
    ).toBe(false);
  });
});

describe("trimDismissed", () => {
  it("keeps the list under the cap, newest first", () => {
    const ids = Array.from({ length: MAX_DISMISSED + 120 }, (_, i) => `id${i}`);
    const kept = trimDismissed(ids);
    expect(kept).toHaveLength(MAX_DISMISSED);
    expect(kept.at(-1)).toBe(`id${MAX_DISMISSED + 119}`);
    expect(kept).not.toContain("id0");
  });

  it("leaves a short list alone", () => {
    expect(trimDismissed(["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("de-duplicates and drops blanks", () => {
    expect(trimDismissed(["a", "b", "a", "", "  "])).toEqual(["b", "a"]);
  });

  it("tolerates a missing or broken stored value", () => {
    expect(trimDismissed([])).toEqual([]);
    expect(trimDismissed(undefined as unknown as string[])).toEqual([]);
  });
});
