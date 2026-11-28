import { describe, expect, it } from "vitest";
import type { IncidentRow } from "@/components/admin/types";
import {
  csvCell,
  filterReport,
  maintenanceCsv,
  reportRecurrences,
  summarizeReport,
  type ReportFilters,
} from "./maintenance-report";

const now = new Date("2026-11-25T12:00:00Z");
const filters: ReportFilters = {
  from: "2026-11-01",
  to: "2026-11-25",
  block: "all",
  category: "all",
  status: "all",
};
function row(id: string, overrides: Partial<IncidentRow> = {}): IncidentRow {
  return {
    id,
    title: "Pintura descascada",
    description: "Parede danificada",
    category: "Pintura e Acabamento",
    created_at: "2026-11-24T12:00:00Z",
    updated_at: "2026-11-24T12:00:00Z",
    location: "Bloco A - Sala 1",
    block: "Bloco A",
    user_id: "u1",
    reporter_name: "Marcelo",
    reporter_email: "marcelo@example.test",
    reporter_ip_hash: "private-ip-hash",
    submission_key: null,
    tracking_token: "private-tracking-token",
    photo_path: "private-photo-path",
    status: "pendente",
    assigned_to: null,
    assigned_to_name: null,
    priority: "alta",
    priority_confirmed: false,
    priority_reason: null,
    priority_set_at: null,
    priority_set_by: null,
    ai_priority: "alta",
    ai_priority_reason: null,
    manager_priority_note: null,
    reporter_edit_seen: true,
    reporter_edited_at: null,
    resolution_note: null,
    resolved_at: null,
    ...overrides,
  };
}
describe("maintenance reports", () => {
  it("filters dates, location, category and status without changing records", () => {
    const rows = [
      row("a"),
      row("b", { block: "Bloco B" }),
      row("c", { created_at: "2026-10-01T12:00:00Z" }),
      row("d", { status: "concluido" }),
      row("e", { category: "Elétrica" }),
    ];
    const before = structuredClone(rows);
    expect(
      filterReport(rows, {
        ...filters,
        block: "Bloco A",
        category: "Pintura e Acabamento",
        status: "pendente",
      }).map((r) => r.id),
    ).toEqual(["a"]);
    expect(rows).toEqual(before);
  });
  it("includes the entire selected final day", () => {
    const date = new Date(2026, 10, 25, 23, 59, 59, 999).toISOString();
    expect(filterReport([row("a", { created_at: date })], filters).map((r) => r.id)).toEqual(["a"]);
  });
  it("counts high priority only after the manager confirms it", () => {
    expect(summarizeReport([row("a"), row("b", { priority_confirmed: true })])).toMatchObject({
      total: 2,
      pending: 2,
      high: 1,
      triage: 1,
    });
  });
  it("uses the dashboard's 2-report / 90-day recurrence even with a shorter report date filter", () => {
    const rows = [
      row("a", { created_at: "2026-11-03T12:00:00Z" }),
      row("b", { user_id: "00000000-0000-0000-0000-000000000000" }),
    ];
    expect(
      reportRecurrences(rows, { ...filters, from: "2026-11-20", status: "concluido" }, now).map(
        (r) => r.ids,
      ),
    ).toEqual([["a", "b"]]);
    expect(
      reportRecurrences(
        [rows[0] ?? row("a"), row("old", { created_at: "2026-07-01T12:00:00Z" })],
        filters,
        now,
      ),
    ).toHaveLength(0);
  });
  it("does not mix different locations when scoped to one location", () => {
    expect(
      reportRecurrences(
        [row("a"), row("b", { block: "Bloco B" })],
        { ...filters, block: "Bloco A" },
        now,
      ),
    ).toHaveLength(0);
  });
  it("excludes tracking secrets, IP hashes, photo paths and e-mail from exports", () => {
    const csv = maintenanceCsv([row("a")], new Set(["a"]));
    for (const privateValue of [
      "private-tracking-token",
      "private-ip-hash",
      "private-photo-path",
      "marcelo@example.test",
    ])
      expect(csv).not.toContain(privateValue);
  });
  it("neutralizes spreadsheet formulas in user-provided values", () => {
    expect(csvCell('=HYPERLINK("malicious")')).toBe('"\'=HYPERLINK(""malicious"")"');
    expect(csvCell("  +1+2")).toBe('"\'  +1+2"');
    expect(csvCell("@SUM(1)")).toBe('"\'@SUM(1)"');
  });
});
