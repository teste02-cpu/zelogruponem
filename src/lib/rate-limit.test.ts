import { describe, expect, it } from "vitest";

import { exceedsLimit, normalizeOptionalEmail } from "./rate-limit";

describe("public report limits", () => {
  it("allows the 8th report in an hour but blocks the 9th", () => {
    expect(exceedsLimit("create", 7)).toBe(false);
    expect(exceedsLimit("create", 8)).toBe(true);
  });

  it("blocks photo analysis after 20 in an hour", () => {
    expect(exceedsLimit("analyze", 19)).toBe(false);
    expect(exceedsLimit("analyze", 20)).toBe(true);
  });
});

describe("optional reporter e-mail", () => {
  it("accepts an empty e-mail as no e-mail", () => {
    expect(normalizeOptionalEmail("  ")).toBeNull();
  });

  it("rejects a malformed e-mail", () => {
    expect(normalizeOptionalEmail("joao@")).toBe("invalid");
  });

  it("normalizes a valid e-mail", () => {
    expect(normalizeOptionalEmail(" Joao@Uni.br ")).toBe("joao@uni.br");
  });
});
