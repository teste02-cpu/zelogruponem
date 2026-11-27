import { describe, expect, it } from "vitest";

import {
  syncSubmittedDrafts,
  type OfflineDraftStore,
  type OfflineIncidentDraft,
} from "./offline-drafts";

function draft(id: string, submittedAt?: string): OfflineIncidentDraft {
  return {
    id,
    photo: new Blob(["photo"], { type: "image/jpeg" }),
    reporterName: "",
    reporterEmail: "",
    accountUserId: null,
    block: "Bloco A",
    room: "",
    category: "Outros",
    title: "Lâmpada queimada",
    description: "A lâmpada está queimada.",
    updatedAt: "2026-11-27T10:00:00.000Z",
    ...(submittedAt ? { submittedAt } : {}),
  };
}

function memoryStore(items: OfflineIncidentDraft[]): OfflineDraftStore {
  return {
    async list() {
      return [...items];
    },
    async put(item) {
      const index = items.findIndex((entry) => entry.id === item.id);
      if (index < 0) items.push(item);
      else items[index] = item;
    },
    async delete(id) {
      const index = items.findIndex((item) => item.id === id);
      if (index >= 0) items.splice(index, 1);
    },
  };
}

describe("offline draft synchronization", () => {
  it("persists draft content locally before marking it for submission", async () => {
    const saved: OfflineIncidentDraft[] = [];
    const store = memoryStore(saved);
    await store.put(draft("local-draft"));

    expect(await store.list()).toMatchObject([
      { id: "local-draft", title: "Lâmpada queimada", description: "A lâmpada está queimada." },
    ]);
    expect(await syncSubmittedDrafts(store, async () => "ticket")).toMatchObject({
      sent: [],
      failed: [],
    });
    expect(saved).toHaveLength(1);
  });

  it("only syncs drafts that the reporter explicitly submitted", async () => {
    const saved = [draft("draft-only"), draft("confirmed", "2026-11-27T10:01:00.000Z")];
    const sent: string[] = [];
    const result = await syncSubmittedDrafts(memoryStore(saved), async (item) => {
      sent.push(item.id);
      return "ticket";
    });

    expect(sent).toEqual(["confirmed"]);
    expect(result.sent).toEqual([{ id: "confirmed", result: "ticket" }]);
    expect(saved.map((item) => item.id)).toEqual(["draft-only"]);
  });

  it("retains confirmed submissions when synchronization fails for a later retry", async () => {
    const saved = [draft("confirmed", "2026-11-27T10:01:00.000Z")];
    const store = memoryStore(saved);
    const failed = await syncSubmittedDrafts(store, async () => {
      throw new Error("offline");
    });

    expect(failed.failed).toEqual(["confirmed"]);
    expect(saved).toHaveLength(1);

    const retried = await syncSubmittedDrafts(store, async (item) => item.id);
    expect(retried.sent).toEqual([{ id: "confirmed", result: "confirmed" }]);
    expect(saved).toHaveLength(0);
  });
});
