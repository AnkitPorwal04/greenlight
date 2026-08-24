import { describe, it, expect } from "vitest";
import {
  buildRawMessage,
  encodeSubjectHeader,
  sanitizeHeaderValue,
} from "./mailer";

const base = {
  to: "jane.doe@example.com",
  cc: [] as string[],
  subject: "Re: Leave Application from Jane Doe",
  inReplyTo: "<abc123@mail.gmail.com>",
  htmlBody: "<div>Approved</div>",
};

function headerLines(raw: string): string[] {
  return raw.split("\r\n\r\n")[0].split("\r\n");
}

describe("sanitizeHeaderValue", () => {
  it("strips carriage returns and newlines", () => {
    expect(sanitizeHeaderValue("<id@x>\r\nBcc: evil@x.com")).toBe(
      "<id@x>Bcc: evil@x.com"
    );
    expect(sanitizeHeaderValue("<id@x>\nBcc: evil@x.com")).toBe(
      "<id@x>Bcc: evil@x.com"
    );
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeHeaderValue("  <id@x>  ")).toBe("<id@x>");
  });

  it("leaves a clean value alone", () => {
    expect(sanitizeHeaderValue("<abc123@mail.gmail.com>")).toBe(
      "<abc123@mail.gmail.com>"
    );
  });
});

describe("buildRawMessage", () => {
  it("keeps the expected headers for a normal reply", () => {
    const raw = buildRawMessage(base);
    expect(headerLines(raw)).toEqual([
      "To: jane.doe@example.com",
      "Subject: Re: Leave Application from Jane Doe",
      "In-Reply-To: <abc123@mail.gmail.com>",
      "References: <abc123@mail.gmail.com>",
      'Content-Type: text/html; charset="UTF-8"',
      "MIME-Version: 1.0",
    ]);
    expect(raw.endsWith("\r\n\r\n<div>Approved</div>")).toBe(true);
  });

  it("does not let a Message-ID inject a Bcc header", () => {
    const raw = buildRawMessage({
      ...base,
      inReplyTo: "<abc123@mail.gmail.com>\r\nBcc: evil@x.com",
    });
    const lines = headerLines(raw);
    expect(lines.some((l) => /^Bcc:/i.test(l))).toBe(false);
    expect(raw).not.toContain("\r\nBcc:");
    expect(lines).toContain(
      "In-Reply-To: <abc123@mail.gmail.com>Bcc: evil@x.com"
    );
  });

  it("does not let a Message-ID smuggle in a body", () => {
    const raw = buildRawMessage({
      ...base,
      inReplyTo: "<abc@x>\r\n\r\nyou have been hacked",
    });
    expect(raw.split("\r\n\r\n")).toHaveLength(2);
  });

  it("does not let the recipient inject a header", () => {
    const raw = buildRawMessage({
      ...base,
      to: "jane.doe@example.com\r\nBcc: evil@x.com",
    });
    expect(headerLines(raw).some((l) => /^Bcc:/i.test(l))).toBe(false);
  });

  it("does not let a cc entry inject a header", () => {
    const raw = buildRawMessage({
      ...base,
      cc: ["ok@example.com", "bad@example.com\r\nBcc: evil@x.com"],
    });
    const lines = headerLines(raw);
    expect(lines.some((l) => /^Bcc:/i.test(l))).toBe(false);
    expect(lines).toContain(
      "Cc: ok@example.com, bad@example.comBcc: evil@x.com"
    );
  });

  it("omits In-Reply-To and References when there is no Message-ID", () => {
    const raw = buildRawMessage({ ...base, inReplyTo: "" });
    const lines = headerLines(raw);
    expect(lines.some((l) => l.startsWith("In-Reply-To:"))).toBe(false);
    expect(lines.some((l) => l.startsWith("References:"))).toBe(false);
  });

  it("omits In-Reply-To when the Message-ID is only whitespace", () => {
    const raw = buildRawMessage({ ...base, inReplyTo: "\r\n  " });
    expect(headerLines(raw).some((l) => l.startsWith("In-Reply-To:"))).toBe(
      false
    );
  });
});

describe("encodeSubjectHeader", () => {
  it("leaves printable ASCII as-is", () => {
    expect(encodeSubjectHeader("Re: Leave Application")).toBe(
      "Re: Leave Application"
    );
  });

  it("base64-encodes a subject containing CRLF", () => {
    const encoded = encodeSubjectHeader("Approved\r\nBcc: evil@x.com");
    expect(encoded).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
    expect(encoded).not.toContain("\r");
    expect(encoded).not.toContain("\n");
  });

  it("base64-encodes non-ASCII subjects", () => {
    const encoded = encodeSubjectHeader("Leave approved ✅");
    expect(encoded).toBe(
      `=?UTF-8?B?${Buffer.from("Leave approved ✅", "utf8").toString("base64")}?=`
    );
  });

  it("keeps an encoded subject on one header line", () => {
    const raw = buildRawMessage({
      ...base,
      subject: "Approved\r\nBcc: evil@x.com",
    });
    expect(headerLines(raw).some((l) => /^Bcc:/i.test(l))).toBe(false);
  });
});
