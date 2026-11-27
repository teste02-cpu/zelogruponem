import { describe, expect, it } from "vitest";

import type { CampusLocation } from "@/hooks/use-locations";
import {
  CAMPUS_FLOORS,
  groupCampusLocationsByFloor,
  incidentMatchesCampusFloor,
  removeCampusFloorLabel,
  roomsForCampusFloor,
  type CampusFloor,
} from "@/lib/campus-location-groups";

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
      location("9", "BLOCO A 1º ANDAR", "Sala 02"),
      location("10", "BLOCO B 2° ANDAR", "Biblioteca"),
      location("11", "BLOCO C", "Quadra"),
      location("12", "BIBLIOTECA", null),
      location("13", "BLOCO C 1 . º   andar", "Sala 03"),
      location("14", "BLOCO D 2OANDAR", "Sala 04"),
    ];

    expect(groupCampusLocationsByFloor(locations)).toEqual([
      [
        "1º ANDAR",
        [locations[0], locations[1], locations[3], locations[4], locations[8], locations[12]],
      ],
      ["2º ANDAR", [locations[2], locations[5], locations[6], locations[9], locations[13]]],
    ]);
    expect(locations).toHaveLength(14);
  });

  it("keeps both floor groups available when no locations are registered", () => {
    expect(groupCampusLocationsByFloor([])).toEqual([
      ["1º ANDAR", []],
      ["2º ANDAR", []],
    ]);
  });

  it("offers room suggestions from all persisted labels classified to the selected floor", () => {
    const locations = [
      location("1", "BLOCO A 1º ANDAR", "Sala 05"),
      location("2", "BLOCO B 1° ANDAR", "Sala 05"),
      location("3", "BLOCO B 2º ANDAR", "Biblioteca"),
      location("4", "Área Externa", "Quadra"),
    ];

    expect(roomsForCampusFloor(locations, "1º ANDAR")).toEqual(["Sala 05"]);
    expect(roomsForCampusFloor(locations, "2º ANDAR")).toEqual(["Biblioteca"]);
  });

  it("switches environment options when changing between the two floors", () => {
    const locations = [
      location("1", "BLOCO A 1º ANDAR", "Sala 05"),
      location("2", "BLOCO B 2° ANDAR", "Biblioteca"),
      location("3", "Área Externa", "Quadra"),
    ];
    const selectedFloors: CampusFloor[] = ["1º ANDAR", "2º ANDAR", "1º ANDAR"];

    expect(CAMPUS_FLOORS).toEqual(["1º ANDAR", "2º ANDAR"]);
    expect(selectedFloors.map((floor) => roomsForCampusFloor(locations, floor))).toEqual([
      ["Sala 05"],
      ["Biblioteca"],
      ["Sala 05"],
    ]);
  });

  it("removes a recognized floor label from a scanned room detail", () => {
    expect(removeCampusFloorLabel("1º ANDAR - Sala 05")).toBe("Sala 05");
    expect(removeCampusFloorLabel("Sala 24 - 2° ANDAR")).toBe("Sala 24");
  });

  it("matches historical incidents by normalized block or saved location", () => {
    expect(incidentMatchesCampusFloor("BLOCO 1", "BLOCO 1 - GINASIO GRUPONEM", "1º ANDAR")).toBe(
      true,
    );
    expect(incidentMatchesCampusFloor(null, "BLOCO B 2° ANDAR - BIBLIOTECA", "2º ANDAR")).toBe(
      true,
    );
    expect(incidentMatchesCampusFloor("BLOCO A 1 . º ANDAR", "Sala 05", "1º ANDAR")).toBe(true);
    expect(incidentMatchesCampusFloor("Área Externa", "Área Externa - Quadra", "1º ANDAR")).toBe(
      false,
    );
    expect(incidentMatchesCampusFloor("BLOCO C", "BLOCO C - Sala 02", "2º ANDAR")).toBe(false);
  });
});
