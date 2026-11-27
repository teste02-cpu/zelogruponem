import type { CampusLocation } from "@/hooks/use-locations";

export const CAMPUS_FLOORS = ["1º ANDAR", "2º ANDAR"] as const;

export type CampusFloor = (typeof CAMPUS_FLOORS)[number];

const LEGACY_FLOOR_BLOCKS: Record<string, CampusFloor> = {
  "BLOCO 1": "1º ANDAR",
  "BLOCO 2 ANDA": "2º ANDAR",
};

export function campusFloorForBlock(block: string): CampusFloor | undefined {
  const normalizedBlock = block.trim().toLocaleUpperCase("pt-BR");
  const floor = CAMPUS_FLOORS.find((candidate) => candidate === normalizedBlock);
  if (floor) return floor;
  return LEGACY_FLOOR_BLOCKS[normalizedBlock];
}

export function groupCampusLocationsByFloor(
  locations: CampusLocation[],
): [CampusFloor, CampusLocation[]][] {
  return CAMPUS_FLOORS.map((floor) => [
    floor,
    locations.filter((location) => campusFloorForBlock(location.block) === floor),
  ]);
}
