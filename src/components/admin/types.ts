import type { Database } from "@/integrations/supabase/types";

export type IncidentRow = Database["public"]["Tables"]["incidents"]["Row"];
export type StaffMember = { id: string; name: string; email: string | null; roles: string[] };
