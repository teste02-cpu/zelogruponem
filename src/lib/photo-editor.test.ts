import { describe, expect, it } from "vitest";

import {
  PHOTO_EDITOR_MAX_SIDE,
  rotatedImageSize,
  photoCoverScale,
  photoOutputDimensions,
} from "./photo-editor";

describe("photo editor transforms", () => {
  it("swaps image dimensions for quarter-turn rotations", () => {
    expect(rotatedImageSize(1600, 1200, 90)).toEqual({ width: 1200, height: 1600 });
    expect(rotatedImageSize(1600, 1200, 270)).toEqual({ width: 1200, height: 1600 });
    expect(rotatedImageSize(1600, 1200, 180)).toEqual({ width: 1600, height: 1200 });
  });

  it("scales to cover the crop after rotation", () => {
    expect(photoCoverScale(1600, 1200, 0, 960, 720, 1)).toBe(0.6);
    expect(photoCoverScale(1600, 1200, 90, 960, 720, 1)).toBe(0.8);
  });

  it("caps output dimensions to the configured maximum side", () => {
    const output = photoOutputDimensions();
    expect(Math.max(output.width, output.height)).toBeLessThanOrEqual(PHOTO_EDITOR_MAX_SIDE);
    expect(output).toEqual({ width: 1280, height: 960 });
  });
});
