import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MapPin, Pencil, User, Wrench } from "lucide-react";

import { PriorityBadge, StatusBadge, priorityBarClass } from "@/components/incident/Badges";
import { cn } from "@/lib/utils";
import type { IncidentRow } from "./types";

type Props = {
  incident: IncidentRow;
  photoUrl?: string | undefined;
  assigneeName?: string | undefined;
  onOpen: () => void;
  showStatus?: boolean;
};

export function IncidentCard({ incident, photoUrl, assigneeName, onOpen, showStatus }: Props) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex w-full gap-3 overflow-hidden rounded-xl border bg-card p-3 text-left shadow-card transition hover:-translate-y-0.5 hover:border-primary/40"
    >
      <span className={cn("absolute inset-y-0 left-0 w-1", incident.priority_confirmed ? priorityBarClass[incident.priority] : "bg-border")} />
      <div className="ml-1 size-16 shrink-0 overflow-hidden rounded-lg bg-muted">
        {photoUrl && <img src={photoUrl} alt="" className="size-full object-cover" loading="lazy" />}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 font-semibold leading-tight">{incident.title}</h3>
          {incident.priority_confirmed ? (
            <PriorityBadge priority={incident.priority} className="shrink-0" />
          ) : (
            <span className="shrink-0 rounded-full border border-dashed border-priority-medium px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-priority-medium">
              Triagem · IA: {incident.ai_priority ?? incident.priority}
            </span>
          )}
        </div>
        <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
          <MapPin className="size-3 shrink-0" /> {incident.location}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <User className="size-3" /> {incident.reporter_name}
          </span>
          {assigneeName && (
            <span className="flex items-center gap-1 text-foreground">
              <Wrench className="size-3" /> {assigneeName}
            </span>
          )}
          <span className="font-mono">{formatDistanceToNow(new Date(incident.created_at), { locale: ptBR, addSuffix: true })}</span>
        </div>
        {!incident.reporter_edit_seen && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
            <Pencil className="size-3" /> Editado pelo colaborador
          </span>
        )}
        {showStatus && <StatusBadge status={incident.status} />}
      </div>
    </button>
  );
}
