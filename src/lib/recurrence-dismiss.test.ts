import { beforeEach, describe, expect, it } from "vitest";
import type { RecurrenceAlert } from "./recurrence";
import {
  dismissalKey,
  dismissRecurrences,
  readDismissedRecurrences,
  restoreRecurrences,
  splitRecurrences,
} from "./recurrence-dismiss";

const alert = (key: string, count: number): RecurrenceAlert => ({
  key,
  reporter: "Marcelo",
  category: "Pintura",
  ids: Array.from({ length: count }, (_, i) => `${key}-${i}`),
});

beforeEach(() => localStorage.clear());

describe("recurrence alert dismissal", () => {
  it("hides the alert the manager closed", () => {
    const a = alert("e:marcelo@x.com|pintura", 2);
    const dismissed = dismissRecurrences([a], [dismissalKey(a)]);
    expect(splitRecurrences([a], dismissed).visible).toHaveLength(0);
    expect(splitRecurrences([a], dismissed).hidden).toHaveLength(1);
  });

  it("shows the alert again when a new report raises the count", () => {
    const a = alert("e:marcelo@x.com|pintura", 2);
    const dismissed = dismissRecurrences([a], [dismissalKey(a)]);
    const b = alert("e:marcelo@x.com|pintura", 3);
    expect(splitRecurrences([b], dismissed).visible).toHaveLength(1);
  });

  it("keeps the alert closed after the page reloads", () => {
    const a = alert("e:marcelo@x.com|pintura", 2);
    dismissRecurrences([a], [dismissalKey(a)]);
    expect(readDismissedRecurrences()).toEqual([dismissalKey(a)]);
    expect(splitRecurrences([a], readDismissedRecurrences()).visible).toHaveLength(0);
  });

  it("brings back an alert the manager restores", () => {
    const a = alert("e:marcelo@x.com|pintura", 2);
    const dismissed = dismissRecurrences([a], [dismissalKey(a)]);
    const restored = restoreRecurrences([dismissalKey(a)]);
    expect(restored).toEqual([]);
    expect(splitRecurrences([a], restored).visible).toHaveLength(1);
  });

  it("drops dismissals of problems that stopped recurring", () => {
    const stale = alert("e:old@x.com|vazamento", 2);
    dismissRecurrences([stale], [dismissalKey(stale)]);
    const live = alert("e:marcelo@x.com|pintura", 2);
    const dismissed = dismissRecurrences([live], [dismissalKey(live)]);
    expect(dismissed).toEqual([dismissalKey(live)]);
  });
});
