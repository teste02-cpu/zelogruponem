import { describe, expect, it } from "vitest";
import { isVisibleOnAdminDashboard } from "./admin-dashboard";

describe("admin dashboard daily completion view", () => {
  it("shows only completions from the current local day and rolls over at midnight", () => {
    const justBeforeMidnight = new Date(2026, 10, 26, 23, 59);
    const justAfterMidnight = new Date(2026, 10, 27, 0, 1);
    const completedBeforeMidnight = new Date(2026, 10, 26, 23, 58).toISOString();
    const completedAfterMidnight = new Date(2026, 10, 27, 0, 0).toISOString();

    expect(
      isVisibleOnAdminDashboard(
        { status: "concluido", resolved_at: completedBeforeMidnight },
        justBeforeMidnight,
      ),
    ).toBe(true);
    expect(
      isVisibleOnAdminDashboard(
        { status: "concluido", resolved_at: completedBeforeMidnight },
        justAfterMidnight,
      ),
    ).toBe(false);
    expect(
      isVisibleOnAdminDashboard(
        { status: "concluido", resolved_at: completedAfterMidnight },
        justAfterMidnight,
      ),
    ).toBe(true);
  });

  it("keeps pending and in-progress incidents visible regardless of age", () => {
    const now = new Date(2026, 10, 27, 12);
    const oldResolution = new Date(2026, 10, 1, 12).toISOString();

    expect(isVisibleOnAdminDashboard({ status: "pendente", resolved_at: null }, now)).toBe(true);
    expect(
      isVisibleOnAdminDashboard({ status: "em_andamento", resolved_at: oldResolution }, now),
    ).toBe(true);
  });

  it("hides completed incidents without a reliable resolution timestamp", () => {
    expect(
      isVisibleOnAdminDashboard({ status: "concluido", resolved_at: null }, new Date(2026, 10, 27)),
    ).toBe(false);
  });
});
