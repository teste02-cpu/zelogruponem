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
      location("4", "BLOCO 1", null),
      location("5", "BLOCO 1", "GINASIO GRUPONEM"),
      location("6", "BLOCO 2 ANDA", null),
      location("7", "BLOCO 2 ANDA", "SALA 24"),
      location("8", "Área Externa", "Quadra"),
      location("9", "Bloco A 1º ANDAR", "Sala 02"),
      location("10", "Biblioteca", null),
    ];

    expect(groupCampusLocationsByFloor(locations)).toEqual([
      ["1º ANDAR", [locations[0], locations[1], locations[3], locations[4]]],
      ["2º ANDAR", [locations[2], locations[5], locations[6]]],
    ]);
    expect(locations).toHaveLength(10);
  });

  it("keeps both floor groups available when no locations are registered", () => {
    expect(groupCampusLocationsByFloor([])).toEqual([
      ["1º ANDAR", []],
      ["2º ANDAR", []],
    ]);
  });
});
