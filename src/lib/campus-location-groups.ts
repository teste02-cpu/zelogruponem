import type { CampusLocation } from "@/hooks/use-locations";

export const CAMPUS_FLOORS = ["1º ANDAR", "2º ANDAR"] as const;

export type CampusFloor = (typeof CAMPUS_FLOORS)[number];

export function groupCampusLocationsByFloor(
  locations: CampusLocation[],
): [CampusFloor, CampusLocation[]][] {
  return CAMPUS_FLOORS.map((floor) => [
    floor,
    locations.filter((location) => location.block.trim().toLocaleUpperCase("pt-BR") === floor),
  ]);
}
