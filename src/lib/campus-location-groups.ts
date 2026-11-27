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
  const legacyFloor = LEGACY_FLOOR_BLOCKS[normalizedBlock];
  if (legacyFloor) return legacyFloor;

  const ordinalFloor = normalizedBlock.match(
    /(?:^|[^0-9])0*([12])\s*(?:\.?\s*[º°ª]|O)?\.?\s*ANDAR\b/,
  );
  if (ordinalFloor) return ordinalFloor[1] === "1" ? CAMPUS_FLOORS[0] : CAMPUS_FLOORS[1];

  return undefined;
}

export function groupCampusLocationsByFloor(
  locations: CampusLocation[],
): [CampusFloor, CampusLocation[]][] {
  return CAMPUS_FLOORS.map((floor) => [
    floor,
    locations.filter((location) => campusFloorForBlock(location.block) === floor),
  ]);
}
