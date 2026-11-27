import { describe, expect, it } from "vitest";

import type { CampusLocation } from "@/hooks/use-locations";
import { groupCampusLocationsByFloor } from "@/lib/campus-location-groups";

const location = (id: string, block: string, room: string | null): CampusLocation => ({
  id,
  block,
  room,
  active: true,
});

describe("groupCampusLocationsByFloor", () => {
  it("shows only the two confirmed floors without assigning other locations", () => {
    const locations = [
      location("1", "1º ANDAR", null),
      location("2", "1º andar", "Sala 01"),
      location("3", "2º ANDAR", "Auditório"),
      location("4", "Área Externa", "Quadra"),
      location("5", "Bloco A 1º ANDAR", "Sala 02"),
      location("6", "Biblioteca", null),
    ];

    expect(groupCampusLocationsByFloor(locations)).toEqual([
      ["1º ANDAR", [locations[0], locations[1]]],
      ["2º ANDAR", [locations[2]]],
    ]);
    expect(locations).toHaveLength(6);
  });

  it("keeps both floor groups available when no locations are registered", () => {
    expect(groupCampusLocationsByFloor([])).toEqual([
      ["1º ANDAR", []],
      ["2º ANDAR", []],
    ]);
  });
});
