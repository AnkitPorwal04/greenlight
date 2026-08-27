import { describe, it, expect } from "vitest";
import {
  headerValue,
  messageIdTokens,
  replyCoversApplication,
  type ThreadMessage,
} from "./thread-reply";

const SELF = "manager@corp.com";

function msg(
  id: string,
  internalDate: number,
  headers: Record<string, string>,
): ThreadMessage {
  return {
    id,
    internalDate: String(internalDate),
    payload: {
      headers: Object.entries(headers).map(([name, value]) => ({
        name,
        value,
      })),
    },
  };
}

function application(
  id: string,
  internalDate: number,
  messageId: string,
): ThreadMessage {
  return msg(id, internalDate, {
    From: "no-reply@greythr.com",
    "Message-ID": messageId,
  });
}

function reply(
  id: string,
  internalDate: number,
  extra: Record<string, string> = {},
): ThreadMessage {
  return msg(id, internalDate, {
    From: `Manager Name <${SELF}>`,
    "Message-ID": `<reply-${id}@mail.gmail.com>`,
    ...extra,
  });
}

describe("messageIdTokens", () => {
  it("strips angle brackets", () => {
    expect(messageIdTokens("<abc@mail.gmail.com>")).toEqual([
      "abc@mail.gmail.com",
    ]);
  });

  it("splits a chain of ids", () => {
    expect(messageIdTokens("<a@x.com> <b@y.com>")).toEqual([
      "a@x.com",
      "b@y.com",
    ]);
  });

  it("tolerates a bare id without brackets", () => {
    expect(messageIdTokens("  abc@x.com ")).toEqual(["abc@x.com"]);
  });

  it("returns nothing for an empty header", () => {
    expect(messageIdTokens("")).toEqual([]);
    expect(messageIdTokens("   ")).toEqual([]);
  });
});

describe("headerValue", () => {
  it("looks headers up case-insensitively", () => {
    const m = msg("m1", 1, { "MESSAGE-id": "<a@x.com>" });
    expect(headerValue(m, "Message-ID")).toBe("<a@x.com>");
  });

  it("returns an empty string when the header is absent", () => {
    expect(headerValue(msg("m1", 1, {}), "in-reply-to")).toBe("");
  });
});

describe("replyCoversApplication", () => {
  it("counts a reply whose In-Reply-To names the application", () => {
    const messages = [
      application("a1", 1000, "<app-1@greythr.com>"),
      reply("r1", 2000, { "In-Reply-To": "<app-1@greythr.com>" }),
    ];
    expect(
      replyCoversApplication({
        messages,
        applicationMsgId: "a1",
        selfEmail: SELF,
        applicationsInThread: 1,
      }),
    ).toBe(true);
  });

  it("does not sweep a second application sharing the thread", () => {
    const messages = [
      application("a1", 1000, "<app-1@greythr.com>"),
      application("a2", 1500, "<app-2@greythr.com>"),
      reply("r1", 2000, { "In-Reply-To": "<app-1@greythr.com>" }),
    ];
    expect(
      replyCoversApplication({
        messages,
        applicationMsgId: "a1",
        selfEmail: SELF,
        applicationsInThread: 2,
      }),
    ).toBe(true);
    expect(
      replyCoversApplication({
        messages,
        applicationMsgId: "a2",
        selfEmail: SELF,
        applicationsInThread: 2,
      }),
    ).toBe(false);
  });

  it("matches an In-Reply-To carrying several ids", () => {
    const messages = [
      application("a1", 1000, "<app-1@greythr.com>"),
      reply("r1", 2000, {
        "In-Reply-To": "<other@x.com> <app-1@greythr.com>",
      }),
    ];
    expect(
      replyCoversApplication({
        messages,
        applicationMsgId: "a1",
        selfEmail: SELF,
        applicationsInThread: 2,
      }),
    ).toBe(true);
  });

  it("falls back to the timestamp rule in a single-application thread", () => {
    const messages = [
      application("a1", 1000, "<app-1@greythr.com>"),
      reply("r1", 2000),
    ];
    expect(
      replyCoversApplication({
        messages,
        applicationMsgId: "a1",
        selfEmail: SELF,
        applicationsInThread: 1,
      }),
    ).toBe(true);
  });

  it("refuses the timestamp fallback in a multi-application thread", () => {
    const messages = [
      application("a1", 1000, "<app-1@greythr.com>"),
      application("a2", 1500, "<app-2@greythr.com>"),
      reply("r1", 2000),
    ];
    expect(
      replyCoversApplication({
        messages,
        applicationMsgId: "a1",
        selfEmail: SELF,
        applicationsInThread: 2,
      }),
    ).toBe(false);
    expect(
      replyCoversApplication({
        messages,
        applicationMsgId: "a2",
        selfEmail: SELF,
        applicationsInThread: 2,
      }),
    ).toBe(false);
  });

  it("ignores a self mail older than the application in the fallback", () => {
    const messages = [
      reply("r1", 500),
      application("a1", 1000, "<app-1@greythr.com>"),
    ];
    expect(
      replyCoversApplication({
        messages,
        applicationMsgId: "a1",
        selfEmail: SELF,
        applicationsInThread: 1,
      }),
    ).toBe(false);
  });

  it("does not count a References-only match", () => {
    const messages = [
      application("a1", 1000, "<app-1@greythr.com>"),
      application("a2", 1500, "<app-2@greythr.com>"),
      reply("r1", 2000, {
        References: "<app-1@greythr.com> <app-2@greythr.com>",
        "In-Reply-To": "<app-1@greythr.com>",
      }),
    ];
    expect(
      replyCoversApplication({
        messages,
        applicationMsgId: "a2",
        selfEmail: SELF,
        applicationsInThread: 2,
      }),
    ).toBe(false);
  });

  it("ignores References even when no In-Reply-To targets the application", () => {
    const messages = [
      application("a1", 1000, "<app-1@greythr.com>"),
      application("a2", 1500, "<app-2@greythr.com>"),
      reply("r1", 2000, { "In-Reply-To": "<app-1@greythr.com>" }),
    ];
    expect(
      replyCoversApplication({
        messages,
        applicationMsgId: "a2",
        selfEmail: SELF,
        applicationsInThread: 2,
      }),
    ).toBe(false);
  });

  it("matches the self address case-insensitively", () => {
    const messages = [
      application("a1", 1000, "<app-1@greythr.com>"),
      msg("r1", 2000, {
        From: "Manager Name <MANAGER@Corp.com>",
        "In-Reply-To": "<APP-1@greythr.com>",
      }),
    ];
    expect(
      replyCoversApplication({
        messages,
        applicationMsgId: "a1",
        selfEmail: "Manager@Corp.COM",
        applicationsInThread: 3,
      }),
    ).toBe(true);
  });

  it("ignores mail sent by anyone else", () => {
    const messages = [
      application("a1", 1000, "<app-1@greythr.com>"),
      msg("x1", 2000, {
        From: "colleague@corp.com",
        "In-Reply-To": "<app-1@greythr.com>",
      }),
    ];
    expect(
      replyCoversApplication({
        messages,
        applicationMsgId: "a1",
        selfEmail: SELF,
        applicationsInThread: 1,
      }),
    ).toBe(false);
  });

  it("returns false without a self address", () => {
    const messages = [
      application("a1", 1000, "<app-1@greythr.com>"),
      reply("r1", 2000, { "In-Reply-To": "<app-1@greythr.com>" }),
    ];
    expect(
      replyCoversApplication({
        messages,
        applicationMsgId: "a1",
        selfEmail: "",
        applicationsInThread: 1,
      }),
    ).toBe(false);
  });

  it("refuses when the application carries no Message-ID and the reply is targeted", () => {
    const messages = [
      msg("a1", 1000, { From: "no-reply@greythr.com" }),
      reply("r1", 2000, { "In-Reply-To": "<app-1@greythr.com>" }),
    ];
    expect(
      replyCoversApplication({
        messages,
        applicationMsgId: "a1",
        selfEmail: SELF,
        applicationsInThread: 1,
      }),
    ).toBe(false);
  });
});
