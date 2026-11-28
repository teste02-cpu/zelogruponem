import { describe, expect, it } from "vitest";

import { getIncidentAssigneeName, resolveIncidentAssignee } from "./incident-assignee";

const staff = [
  { id: "staff-1", name: "Ana Silva" },
  { id: "staff-2", name: "João Lima" },
];

describe("incident assignee", () => {
  it("resolves a registered staff name to its profile id", () => {
    expect(resolveIncidentAssignee(" Ana Silva ", staff)).toEqual({
      assignedToId: "staff-1",
      assignedToName: null,
    });
  });

  it("preserves an unregistered responsible as a trimmed name", () => {
    expect(resolveIncidentAssignee("  Carlos Souza  ", staff)).toEqual({
      assignedToId: null,
      assignedToName: "Carlos Souza",
    });
  });

  it("clears the assignment and allows reassigning it", () => {
    expect(resolveIncidentAssignee("  ", staff)).toEqual({
      assignedToId: null,
      assignedToName: null,
    });
    expect(resolveIncidentAssignee("João Lima", staff)).toEqual({
      assignedToId: "staff-2",
      assignedToName: null,
    });
  });

  it("displays the manual name, falling back to the registered staff name", () => {
    expect(getIncidentAssigneeName(null, "Carlos Souza", staff)).toBe("Carlos Souza");
    expect(getIncidentAssigneeName("staff-1", null, staff)).toBe("Ana Silva");
    expect(getIncidentAssigneeName("missing", null, staff)).toBeUndefined();
  });
});
