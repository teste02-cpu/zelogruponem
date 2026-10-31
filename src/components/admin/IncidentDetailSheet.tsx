import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";

import { PriorityBadge } from "@/components/incident/Badges";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { updateIncident } from "@/lib/incidents.functions";
import { STATUS_LABEL, type IncidentStatus } from "@/lib/incident-meta";
import { cn } from "@/lib/utils";
import type { IncidentRow, StaffMember } from "./types";

type Props = {
  incident: IncidentRow | null;
  photoUrl?: string;
  staff: StaffMember[];
  onOpenChange: (open: boolean) => void;
};

const STATUSES: IncidentStatus[] = ["pendente", "em_andamento", "concluido"];

export function IncidentDetailSheet({ incident, photoUrl, staff, onOpenChange }: Props) {
  const update = useServerFn(updateIncident);
  const qc = useQueryClient();
  const [status, setStatus] = useState<IncidentStatus>("pendente");
  const [assignee, setAssignee] = useState<string>("none");
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!incident) return;
    setStatus(incident.status);
    setAssignee(incident.assigned_to ?? "none");
    setNote(incident.resolution_note ?? "");
    setNotify(true);
  }, [incident]);

  async function save() {
    if (!incident) return;
    setSaving(true);
    try {
      const res = await update({
        data: {
          id: incident.id,
          status,
          assignedTo: assignee === "none" ? null : assignee,
          resolutionNote: note.trim() || null,
          notify,
        },
      });
      toast.success(res.notified ? "Chamado atualizado e solicitante notificado" : "Chamado atualizado");
      qc.invalidateQueries({ queryKey: ["admin-incidents"] });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  const statusChanged = incident && status !== incident.status && status !== "pendente";

  return (
    <Sheet open={!!incident} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {incident && (
          <>
            <SheetHeader className="text-left">
              <div className="flex items-center gap-2">
                <PriorityBadge priority={incident.priority} />
                <span className="font-mono text-xs text-muted-foreground">#{incident.id.slice(0, 8).toUpperCase()}</span>
              </div>
              <SheetTitle className="font-display text-2xl">{incident.title}</SheetTitle>
              <SheetDescription>{incident.category}</SheetDescription>
            </SheetHeader>

            <div className="mt-4 space-y-5">
              {photoUrl && (
                <a href={photoUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl bg-muted">
                  <img src={photoUrl} alt="Foto da ocorrência" className="max-h-80 w-full object-cover" />
                </a>
              )}

              <div className="rounded-xl border border-primary/30 bg-accent p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent-foreground">
                  <Sparkles className="size-3.5" /> Por que esta prioridade?
                </p>
                <p className="mt-1 text-sm text-accent-foreground">{incident.priority_reason ?? "Sem justificativa."}</p>
              </div>

              <dl className="grid grid-cols-2 gap-3 text-sm">
                <Info label="Local" value={incident.location} />
                <Info label="Solicitante" value={incident.reporter_name} />
                <Info label="Aberto em" value={format(new Date(incident.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })} />
                <Info
                  label="Resolvido em"
                  value={incident.resolved_at ? format(new Date(incident.resolved_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—"}
                />
              </dl>

              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Descrição</Label>
                <p className="mt-1 text-sm leading-relaxed">{incident.description}</p>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s)}
                      className={cn(
                        "rounded-md px-2 py-2 text-xs font-medium transition",
                        status === s ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Responsável</Label>
                <Select value={assignee} onValueChange={setAssignee}>
                  <SelectTrigger>
                    <SelectValue placeholder="Atribuir a…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem responsável</SelectItem>
                    {staff.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Nota da equipe {status === "concluido" && "(enviada ao solicitante)"}</Label>
                <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: Maçaneta substituída." />
              </div>

              {statusChanged && (
                <label className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  Notificar o solicitante sobre a mudança
                  <Switch checked={notify} onCheckedChange={setNotify} />
                </label>
              )}

              <Button className="w-full" size="lg" onClick={save} disabled={saving}>
                {saving && <Loader2 className="animate-spin" />}
                {statusChanged && notify ? "Salvar e notificar" : "Salvar"}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
