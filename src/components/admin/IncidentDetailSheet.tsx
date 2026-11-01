import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Loader2, Sparkles, Trash2 } from "lucide-react";

import { PriorityBadge } from "@/components/incident/Badges";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { deleteIncident, updateIncident } from "@/lib/incidents.functions";
import { PRIORITY_LABEL, STATUS_LABEL, type IncidentStatus } from "@/lib/incident-meta";
import type { Priority } from "@/lib/priority";
import { cn } from "@/lib/utils";
import type { IncidentRow, StaffMember } from "./types";

type Props = {
  incident: IncidentRow | null;
  photoUrl?: string | undefined;
  staff: StaffMember[];
  isAdmin: boolean;
  onOpenChange: (open: boolean) => void;
};

const STATUSES: IncidentStatus[] = ["pendente", "em_andamento", "concluido"];
const PRIORITIES: Priority[] = ["alta", "media", "baixa"];
const priorityActiveClass: Record<Priority, string> = {
  alta: "bg-priority-high text-primary-foreground shadow-sm",
  media: "bg-priority-medium text-primary-foreground shadow-sm",
  baixa: "bg-priority-low text-primary-foreground shadow-sm",
};

export function IncidentDetailSheet({ incident, photoUrl, staff, isAdmin, onOpenChange }: Props) {
  const update = useServerFn(updateIncident);
  const removeIncident = useServerFn(deleteIncident);
  const qc = useQueryClient();
  const [status, setStatus] = useState<IncidentStatus>("pendente");
  const [assignee, setAssignee] = useState<string>("none");
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);
  const [priority, setPriority] = useState<Priority>("media");
  const [priorityNote, setPriorityNote] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!incident) return;
    setStatus(incident.status);
    setAssignee(incident.assigned_to ?? "none");
    setNote(incident.resolution_note ?? "");
    setNotify(true);
    setPriority(incident.priority);
    setPriorityNote(incident.manager_priority_note ?? "");
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
          ...(priority !== incident.priority || !incident.priority_confirmed || priorityNote !== (incident.manager_priority_note ?? "")
            ? { priority, priorityNote: priorityNote.trim() || null }
            : {}),
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

  async function remove() {
    if (!incident) return;
    setDeleting(true);
    try {
      const result = await removeIncident({ data: { id: incident.id } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-incidents"] }),
        qc.invalidateQueries({ queryKey: ["account-incidents"] }),
        qc.invalidateQueries({ queryKey: ["tracked-incidents"] }),
        qc.invalidateQueries({ queryKey: ["tracked-unread"] }),
      ]);
      onOpenChange(false);
      if (result.photoCleanupFailed) {
        toast.warning("Chamado excluído, mas não foi possível remover a foto.");
      } else {
        toast.success("Chamado excluído.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir o chamado.");
    } finally {
      setDeleting(false);
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

              <section className="space-y-3 rounded-xl border p-3">
                <div className="rounded-lg bg-accent p-3">
                  <p className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-accent-foreground">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="size-3.5" /> Análise da IA
                    </span>
                    {incident.ai_priority && <PriorityBadge priority={incident.ai_priority} />}
                  </p>
                  <p className="mt-1.5 text-sm text-accent-foreground">
                    {incident.ai_priority_reason ?? incident.priority_reason ?? "Sem análise disponível."}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center justify-between">
                    Prioridade definida pelo gestor
                    {!incident.priority_confirmed && (
                      <span className="font-mono text-[10px] uppercase tracking-wider text-priority-medium">Aguardando triagem</span>
                    )}
                  </Label>
                  <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
                    {PRIORITIES.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPriority(p)}
                        className={cn(
                          "rounded-md px-2 py-2 text-xs font-semibold transition",
                          priority === p ? priorityActiveClass[p] : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {PRIORITY_LABEL[p]}
                      </button>
                    ))}
                  </div>
                  {incident.ai_priority && priority !== incident.ai_priority && (
                    <p className="text-xs text-muted-foreground">Diferente da sugestão da IA — registre o motivo abaixo.</p>
                  )}
                  <Textarea
                    rows={2}
                    value={priorityNote}
                    onChange={(e) => setPriorityNote(e.target.value)}
                    placeholder="Motivo da decisão (opcional)"
                  />
                  {incident.priority_confirmed && incident.priority_set_at && (
                    <p className="text-xs text-muted-foreground">
                      Definida por {staff.find((s) => s.id === incident.priority_set_by)?.name ?? "gestor"} em{" "}
                      {format(new Date(incident.priority_set_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </p>
                  )}
                </div>
              </section>

              <dl className="grid grid-cols-2 gap-3 text-sm">
                <Info label="Local" value={incident.location} />
                <Info label="Solicitante" value={incident.reporter_name} />
                <Info label="E-mail do solicitante" value={incident.reporter_email ?? "Não informado"} />
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
                {!incident.priority_confirmed ? "Confirmar prioridade e salvar" : statusChanged && notify ? "Salvar e notificar" : "Salvar"}
              </Button>
              {isAdmin && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="destructive"
                      className="w-full"
                      disabled={saving || deleting}
                    >
                      <Trash2 /> Excluir chamado
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir este chamado?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta ação é permanente. O chamado será removido do painel e do histórico de quem
                        o registrou.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        disabled={deleting}
                        onClick={(event) => {
                          event.preventDefault();
                          void remove();
                        }}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {deleting && <Loader2 className="animate-spin" />}
                        Excluir definitivamente
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
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
