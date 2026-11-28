import type { StaffMember } from "@/components/admin/types";

export function resolveIncidentAssignee(
  value: string,
  staff: readonly Pick<StaffMember, "id" | "name">[],
): { assignedToId: string | null; assignedToName: string | null } {
  const name = value.trim();
  if (!name) return { assignedToId: null, assignedToName: null };

  const selectedStaff = staff.find((member) => member.name.trim().toLowerCase() === name.toLowerCase());
  if (selectedStaff) return { assignedToId: selectedStaff.id, assignedToName: null };
  return { assignedToId: null, assignedToName: name };
}

export function getIncidentAssigneeName(
  assignedToId: string | null,
  assignedToName: string | null,
  staff: readonly Pick<StaffMember, "id" | "name">[],
): string | undefined {
  const manualName = assignedToName?.trim();
  if (manualName) return manualName;
  return staff.find((member) => member.id === assignedToId)?.name;
}
