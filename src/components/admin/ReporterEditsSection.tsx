import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Pencil } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { REPORTER_FIELD_LABEL, type ReporterEditChange } from "@/lib/reporter-edit";
import type { IncidentRow } from "./types";

/** Shows what the reporter changed and marks the update as seen by the admin. */
export function ReporterEditsSection({ incident }: { incident: IncidentRow }) {
  const qc = useQueryClient();
  const { data: edits = [] } = useQuery({
    queryKey: ["incident-edits", incident.id, incident.reporter_edited_at],
    enabled: !!incident.reporter_edited_at,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incident_edits")
        .select("id, changes, created_at")
        .eq("incident_id", incident.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []).map((e) => ({ ...e, changes: e.changes as unknown as ReporterEditChange[] }));
    },
  });

  useEffect(() => {
    if (incident.reporter_edit_seen) return;
    void supabase
      .from("incidents")
      .update({ reporter_edit_seen: true })
      .eq("id", incident.id)
      .then(() => qc.invalidateQueries({ queryKey: ["admin-incidents"] }));
  }, [incident.id, incident.reporter_edit_seen, qc]);

  if (!incident.reporter_edited_at) return null;

  return (
    <section className="space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
        <Pencil className="size-3.5" /> Atualizado pelo colaborador
      </p>
      {edits.map((edit) => (
        <div key={edit.id} className="space-y-1 border-t border-primary/20 pt-2 text-sm first:border-0 first:pt-0">
          <p className="font-mono text-[11px] text-muted-foreground">
            {format(new Date(edit.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
          </p>
          {edit.changes.map((c) => (
            <div key={c.field}>
              <span className="font-medium">{REPORTER_FIELD_LABEL[c.field]}:</span>{" "}
              <span className="text-muted-foreground line-through">{c.from}</span> → <span>{c.to}</span>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
