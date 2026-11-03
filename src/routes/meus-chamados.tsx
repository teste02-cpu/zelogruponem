import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, Camera, CheckCircle2 } from "lucide-react";

import { StatusBadge } from "@/components/incident/Badges";
import { EditIncidentDialog } from "@/components/incident/EditIncidentDialog";
import { editReporterIncident, getTrackedIncidents } from "@/lib/incidents.functions";
import { canReporterEdit } from "@/lib/reporter-edit";
import { markResolvedSeen, readSeenResolved, readTrackedTickets } from "@/lib/tracked-tickets";

export const Route = createFileRoute("/meus-chamados")({
  head: () => ({
    meta: [
      { title: "Meus chamados · Zelo" },
      { name: "description", content: "Acompanhe o status das ocorrências que você registrou neste aparelho." },
      { property: "og:title", content: "Meus chamados · Zelo" },
      { property: "og:description", content: "Acompanhe suas ocorrências de manutenção no campus." },
    ],
  }),
  component: MyIncidents,
});

function MyIncidents() {
  const tracked = useServerFn(getTrackedIncidents);
  const editIncident = useServerFn(editReporterIncident);
  const qc = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: ["tracked-incidents"],
    queryFn: async () => {
      const tokens = readTrackedTickets().map((t) => t.token);
      const rows = tokens.length ? await tracked({ data: { tokens } }) : [];
      return { rows, seen: new Set(readSeenResolved()) };
    },
  });
  const incidents = data?.rows ?? [];

  const newlyResolved = incidents.filter((i) => i.status === "concluido" && !data?.seen.has(i.token)).map((i) => i.token);
  const resolvedKey = newlyResolved.join(",");
  useEffect(() => {
    if (!resolvedKey) return;
    const t = setTimeout(() => {
      markResolvedSeen(resolvedKey.split(","));
      qc.invalidateQueries({ queryKey: ["tracked-unread"] });
    }, 1500);
    return () => clearTimeout(t);
  }, [resolvedKey, qc]);

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background/90 px-4 py-3 backdrop-blur">
        <Link to="/" className="grid size-10 place-items-center rounded-full hover:bg-secondary" aria-label="Voltar">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-xl font-bold">Meus chamados</h1>
      </header>

      <main className="mx-auto max-w-xl space-y-3 px-4 py-5">
        <p className="text-sm text-muted-foreground">Chamados registrados a partir deste aparelho.</p>

        {!isPending && incidents.length === 0 && (
          <div className="rounded-2xl border border-dashed p-8 text-center">
            <p className="text-muted-foreground">Nenhuma ocorrência registrada neste aparelho.</p>
            <Link to="/" className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              <Camera className="size-4" /> Registrar agora
            </Link>
          </div>
        )}

        {incidents.map((i) => {
          const isNew = newlyResolved.includes(i.token);
          return (
            <article key={i.token} className={`rounded-2xl border bg-card p-4 shadow-card ${isNew ? "border-primary/50" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold">{i.title}</h3>
                  <p className="truncate text-sm text-muted-foreground">{i.location}</p>
                </div>
                <StatusBadge status={i.status} />
              </div>
              {i.status === "concluido" && (
                <p className="mt-3 flex items-start gap-2 rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                  <span>
                    Resolvido{i.resolvedAt ? ` em ${format(new Date(i.resolvedAt), "dd/MM 'às' HH:mm", { locale: ptBR })}` : ""}.
                    {i.resolutionNote ? ` Nota da equipe: ${i.resolutionNote}` : ""}
                  </span>
                </p>
              )}
              {i.editedAt && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Editado por você em {format(new Date(i.editedAt), "dd/MM 'às' HH:mm", { locale: ptBR })}
                </p>
              )}
              <div className="mt-3 flex items-center justify-between gap-2 font-mono text-[11px] text-muted-foreground">
                <span>#{i.protocol}</span>
                <div className="flex items-center gap-2">
                  <span>{format(new Date(i.createdAt), "dd/MM/yy", { locale: ptBR })}</span>
                  {canReporterEdit(i.status) && (
                    <EditIncidentDialog
                      initial={{ title: i.title, description: i.description, location: i.location }}
                      onSave={async (fields) => {
                        const res = await editIncident({ data: { ...fields, trackingToken: i.token } });
                        await qc.invalidateQueries({ queryKey: ["tracked-incidents"] });
                        return res;
                      }}
                    />
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </main>
    </div>
  );
}
