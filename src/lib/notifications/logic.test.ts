import { describe, expect, it } from "vitest";

import {
  isIncidentOverdue,
  newlyCompleted,
  notificationIdempotencyKey,
  overdueHoursFromConfig,
  selectNotificationRecipients,
} from "./logic";

describe("notification logic", () => {
  it("normalizes and deduplicates admin and reporter recipients for completion", () => {
    expect(
      selectNotificationRecipients(
        "completed",
        [" ADMIN@EXAMPLE.COM ", "admin@example.com"],
        " reporter@example.com ",
      ),
    ).toEqual(["admin@example.com", "reporter@example.com"]);
    expect(
      selectNotificationRecipients("new_incident", ["admin@example.com"], "reporter@example.com"),
    ).toEqual(["admin@example.com"]);
  });

  it("uses a stable idempotency key per incident, event, and normalized recipient", () => {
    expect(notificationIdempotencyKey("completed", "incident-1", " ADMIN@example.com ")).toBe(
      notificationIdempotencyKey("completed", "incident-1", "admin@example.com"),
    );
    expect(notificationIdempotencyKey("completed", "incident-1", "admin@example.com")).not.toBe(
      notificationIdempotencyKey("new_incident", "incident-1", "admin@example.com"),
    );
    expect(
      notificationIdempotencyKey(
        "completed",
        "incident-1",
        "admin@example.com",
        "2026-11-27T12:00:00Z",
      ),
    ).not.toBe(
      notificationIdempotencyKey(
        "completed",
        "incident-1",
        "admin@example.com",
        "2026-11-28T12:00:00Z",
      ),
    );
  });

  it("detects only overdue open incidents", () => {
    const now = new Date("2026-11-27T12:00:00Z");
    expect(
      isIncidentOverdue(
        { id: "old", status: "pendente", created_at: "2026-11-26T11:00:00Z" },
        now,
        24,
      ),
    ).toBe(true);
    expect(
      isIncidentOverdue(
        { id: "new", status: "em_andamento", created_at: "2026-11-27T11:00:00Z" },
        now,
        24,
      ),
    ).toBe(false);
    expect(
      isIncidentOverdue(
        { id: "done", status: "concluido", created_at: "2026-11-20T00:00:00Z" },
        now,
        24,
      ),
    ).toBe(false);
  });

  it("identifies a completion transition once", () => {
    expect(newlyCompleted("em_andamento", "concluido")).toBe(true);
    expect(newlyCompleted("concluido", "concluido")).toBe(false);
  });

  it("validates the configurable overdue threshold", () => {
    expect(overdueHoursFromConfig(undefined)).toBe(24);
    expect(overdueHoursFromConfig("72")).toBe(72);
    expect(() => overdueHoursFromConfig("0")).toThrow();
    expect(() => overdueHoursFromConfig("invalid")).toThrow();
  });
});
