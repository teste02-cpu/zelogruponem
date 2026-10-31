import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MapPin, User, Wrench } from "lucide-react";

import { PriorityBadge, StatusBadge, priorityBarClass } from "@/components/incident/Badges";
import { cn } from "@/lib/utils";
import type { IncidentRow } from "./types";

type Props = {
  incident: IncidentRow;
  photoUrl?: string;
  assigneeName?: string;
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
      <span className={cn("absolute inset-y-0 left-0 w-1", priorityBarClass[incident.priority])} />
      <div className="ml-1 size-16 shrink-0 overflow-hidden rounded-lg bg-muted">
        {photoUrl && <img src={photoUrl} alt="" className="size-full object-cover" loading="lazy" />}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 font-semibold leading-tight">{incident.title}</h3>
          <PriorityBadge priority={incident.priority} className="shrink-0" />
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
        {showStatus && <StatusBadge status={incident.status} />}
      </div>
    </button>
  );
}
