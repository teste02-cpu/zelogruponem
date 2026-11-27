import type { CampusLocation } from "@/hooks/use-locations";

export const CAMPUS_FLOORS = ["1º ANDAR", "2º ANDAR"] as const;

export type CampusFloor = (typeof CAMPUS_FLOORS)[number];

const LEGACY_FLOOR_BLOCKS: Record<string, CampusFloor> = {
  "BLOCO 1": "1º ANDAR",
  "BLOCO 2 ANDA": "2º ANDAR",
};

const FLOOR_LABEL = /(?:^|[^0-9])0*([12])\s*(?:\.?\s*[º°ª]|O)?\.?\s*ANDAR\b/;

export function campusFloorForBlock(block: string): CampusFloor | undefined {
  const normalizedBlock = block.trim().toLocaleUpperCase("pt-BR");
  const floor = CAMPUS_FLOORS.find((candidate) => candidate === normalizedBlock);
  if (floor) return floor;
  const legacyFloor = Object.entries(LEGACY_FLOOR_BLOCKS).find(
    ([label]) =>
      normalizedBlock === label ||
      (normalizedBlock.startsWith(label) &&
        /^[\s\-–,:|]/.test(normalizedBlock.slice(label.length))),
  )?.[1];
  if (legacyFloor) return legacyFloor;

  const ordinalFloor = normalizedBlock.match(FLOOR_LABEL);
  if (ordinalFloor) return ordinalFloor[1] === "1" ? CAMPUS_FLOORS[0] : CAMPUS_FLOORS[1];

  return undefined;
}

export function incidentMatchesCampusFloor(
  block: string | null,
  location: string | null,
  floor: CampusFloor,
  campusLocations: readonly CampusLocation[] = [],
): boolean {
  const blockFloor = campusFloorForBlock(block ?? "");
  const locationFloor = campusFloorForBlock(location ?? "");

  if (blockFloor && locationFloor && blockFloor !== locationFloor) return false;
  const explicitFloor = blockFloor ?? locationFloor;
  if (explicitFloor) return explicitFloor === floor;

  const roomLabel = normalizeRoomLabel(location ?? "");
  if (!roomLabel) return false;

  const matchingFloors = new Set(
    campusLocations
      .filter((campusLocation) => normalizeRoomLabel(campusLocation.room ?? "") === roomLabel)
      .map((campusLocation) => campusFloorForBlock(campusLocation.block))
      .filter((campusFloor): campusFloor is CampusFloor => campusFloor !== undefined),
  );

  return matchingFloors.size === 1 && matchingFloors.has(floor);
}

function normalizeRoomLabel(room: string): string {
  return room.normalize("NFKC").toLocaleUpperCase("pt-BR").replace(/\s+/g, " ").trim();
}

export function removeCampusFloorLabel(detail: string): string {
  return detail
    .replace(new RegExp(FLOOR_LABEL.source, "gi"), " ")
    .replace(/^[\s\-–,:]+|[\s\-–,:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function roomsForCampusFloor(locations: CampusLocation[], floor: CampusFloor): string[] {
  const rooms = locations.flatMap((location) =>
    campusFloorForBlock(location.block) === floor && location.room ? [location.room] : [],
  );
  return Array.from(new Set(rooms)).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
}

export function groupCampusLocationsByFloor(
  locations: CampusLocation[],
): [CampusFloor, CampusLocation[]][] {
  return CAMPUS_FLOORS.map((floor) => [
    floor,
    locations.filter((location) => campusFloorForBlock(location.block) === floor),
  ]);
}
