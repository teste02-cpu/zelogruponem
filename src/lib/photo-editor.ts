export const PHOTO_EDITOR_WIDTH = 960;
export const PHOTO_EDITOR_HEIGHT = 720;
export const PHOTO_EDITOR_MAX_SIDE = 1280;
export const PHOTO_EDITOR_MAX_BYTES = 1_500_000;

export type PhotoRotation = 0 | 90 | 180 | 270;

export function rotatedImageSize(
  width: number,
  height: number,
  rotation: PhotoRotation,
): { width: number; height: number } {
  return rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height };
}

export function photoCoverScale(
  sourceWidth: number,
  sourceHeight: number,
  rotation: PhotoRotation,
  targetWidth: number,
  targetHeight: number,
  zoom: number,
): number {
  const rotated = rotatedImageSize(sourceWidth, sourceHeight, rotation);
  return Math.max(targetWidth / rotated.width, targetHeight / rotated.height) * zoom;
}

export function photoOutputDimensions(maxSide = PHOTO_EDITOR_MAX_SIDE) {
  const scale = maxSide / PHOTO_EDITOR_WIDTH;
  return {
    width: Math.round(PHOTO_EDITOR_WIDTH * scale),
    height: Math.round(PHOTO_EDITOR_HEIGHT * scale),
  };
}
