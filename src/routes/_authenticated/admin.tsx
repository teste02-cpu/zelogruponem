import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Camera, Columns3, List, LogOut, Search } from "lucide-react";

import { IncidentCard } from "@/components/admin/IncidentCard";
import { IncidentDetailSheet } from "@/components/admin/IncidentDetailSheet";
import { TeamDialog } from "@/components/admin/TeamDialog";
import type { IncidentRow, StaffMember } from "@/components/admin/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useSignedUrls } from "@/hooks/use-signed-urls";
import { supabase } from "@/integrations/supabase/client";
import { BLOCKS, PRIORITY_LABEL, PRIORITY_RANK, STATUS_LABEL, type IncidentStatus } from "@/lib/incident-meta";
import type { Priority } from "@/lib/priority";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async ({ context }) => {
    const { data } = await supabase.rpc("is_staff", { _user_id: context.userId });
    if (!data) throw redirect({ to: "/" });
  },
  head: () => ({
    meta: [
      { title: "Painel de manutenção · Zelo" },
      { name: "description", content: "Chamados do campus priorizados por IA: filtre, atribua responsáveis e notifique a resolução." },
      { property: "og:title", content: "Painel de manutenção · Zelo" },
      { property: "og:description", content: "Gestão de chamados de infraestrutura universitária com priorização inteligente." },
    ],
  }),
  component: AdminDashboard,
});

const STATUS_COLUMNS: IncidentStatus[] = ["pendente", "em_andamento", "concluido"];

function AdminDashboard() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [view, setView] = useState<"kanban" | "lista">("kanban");
  const [priority, setPriority] = useState<"all" | Priority>("all");
  const [block, setBlock] = useState<string>("all");
  const [status, setStatus] = useState<"all" | IncidentStatus>("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: incidents = [] } = useQuery({
    queryKey: ["admin-incidents"],
    queryFn: async () => {
      const { data, error } = await supabase.from("incidents").select("*").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data as IncidentRow[];
    },
  });

  const { data: staff = [] } = useQuery({
    queryKey: ["staff"],
    queryFn: async (): Promise<StaffMember[]> => {
      const { data: roles } = await supabase.from("user_roles").select("user_id, role").in("role", ["admin", "maintenance"]);
      const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
      if (!ids.length) return [];
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      return (profiles ?? []).map((p) => ({
        id: p.id,
        name: p.full_name,
        email: p.email,
        roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as string),
      }));
    },
  });

  // Live updates when new tickets arrive or change.
  useEffect(() => {
    const channel = supabase
      .channel(`admin-incidents-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "incidents" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-incidents"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const staffName = useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s.name])), [staff]);
  const { data: urls = {} } = useSignedUrls(incidents.map((i) => i.photo_path));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return incidents
      .filter((i) => priority === "all" || i.priority === priority)
      .filter((i) => block === "all" || i.block === block)
      .filter((i) => status === "all" || i.status === status)
      .filter(
        (i) =>
          !q ||
          [i.title, i.description, i.location, i.reporter_name, i.category].some((f) => f?.toLowerCase().includes(q)),
      )
      .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || +new Date(b.created_at) - +new Date(a.created_at));
  }, [incidents, priority, block, status, search]);

  const stats = useMemo(() => {
    const open = incidents.filter((i) => i.status !== "concluido");
    const today = new Date().toDateString();
    return {
      open: open.length,
      high: open.filter((i) => i.priority === "alta").length,
      progress: incidents.filter((i) => i.status === "em_andamento").length,
      doneToday: incidents.filter((i) => i.resolved_at && new Date(i.resolved_at).toDateString() === today).length,
    };
  }, [incidents]);

  const selected = incidents.find((i) => i.id === openId) ?? null;

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-dvh bg-background paper-grid">
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="font-display text-2xl font-extrabold">zelo</span>
            <span className="hidden rounded-full bg-ink px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-ink-foreground sm:inline">
              Painel de manutenção
            </span>
          </div>
          <div className="flex items-center gap-2">
            {me?.isAdmin && <TeamDialog />}
            <Button variant="outline" size="sm" asChild>
              <Link to="/">
                <Camera /> <span className="hidden sm:inline">Registrar</span>
              </Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut} aria-label="Sair">
              <LogOut />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Abertos" value={stats.open} />
          <Stat label="Alta prioridade" value={stats.high} tone="high" />
          <Stat label="Em andamento" value={stats.progress} />
          <Stat label="Concluídos hoje" value={stats.doneToday} tone="low" />
        </section>

        <section className="flex flex-col gap-2 rounded-2xl border bg-card p-3 shadow-card lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar por título, local, solicitante…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-2 lg:flex">
            <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
              <SelectTrigger className="lg:w-36">
                <SelectValue placeholder="Prioridade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toda prioridade</SelectItem>
                {(["alta", "media", "baixa"] as Priority[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={block} onValueChange={setBlock}>
              <SelectTrigger className="lg:w-36">
                <SelectValue placeholder="Bloco" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os locais</SelectItem>
                {BLOCKS.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger className="lg:w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo status</SelectItem>
                {STATUS_COLUMNS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex rounded-lg bg-muted p-1">
            <ViewButton active={view === "kanban"} onClick={() => setView("kanban")} icon={<Columns3 className="size-4" />} label="Kanban" />
            <ViewButton active={view === "lista"} onClick={() => setView("lista")} icon={<List className="size-4" />} label="Lista" />
          </div>
        </section>

        {view === "kanban" ? (
          <section className="grid gap-4 md:grid-cols-3">
            {STATUS_COLUMNS.filter((c) => status === "all" || c === status).map((col) => {
              const items = filtered.filter((i) => i.status === col);
              return (
                <div key={col} className="rounded-2xl bg-muted/70 p-3">
                  <div className="mb-3 flex items-center justify-between px-1">
                    <h2 className="font-display text-lg font-bold">{STATUS_LABEL[col]}</h2>
                    <span className="rounded-full bg-card px-2 py-0.5 font-mono text-xs">{items.length}</span>
                  </div>
                  <div className="space-y-2">
                    {items.map((i) => (
                      <IncidentCard
                        key={i.id}
                        incident={i}
                        photoUrl={i.photo_path ? urls[i.photo_path] : undefined}
                        assigneeName={i.assigned_to ? staffName[i.assigned_to] : undefined}
                        onOpen={() => setOpenId(i.id)}
                      />
                    ))}
                    {items.length === 0 && <p className="px-1 py-6 text-center text-sm text-muted-foreground">Nenhum chamado</p>}
                  </div>
                </div>
              );
            })}
          </section>
        ) : (
          <section className="space-y-2">
            {filtered.map((i) => (
              <IncidentCard
                key={i.id}
                incident={i}
                photoUrl={i.photo_path ? urls[i.photo_path] : undefined}
                assigneeName={i.assigned_to ? staffName[i.assigned_to] : undefined}
                onOpen={() => setOpenId(i.id)}
                showStatus
              />
            ))}
            {filtered.length === 0 && (
              <p className="rounded-2xl border border-dashed bg-card py-12 text-center text-muted-foreground">
                Nenhum chamado com esses filtros.
              </p>
            )}
          </section>
        )}
      </main>

      <IncidentDetailSheet
        incident={selected}
        photoUrl={selected?.photo_path ? urls[selected.photo_path] : undefined}
        staff={staff}
        onOpenChange={(o) => !o && setOpenId(null)}
      />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "high" | "low" }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-card">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 font-display text-4xl font-extrabold",
          tone === "high" && "text-priority-high",
          tone === "low" && "text-priority-low",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function ViewButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium",
        active ? "bg-card shadow-sm" : "text-muted-foreground",
      )}
    >
      {icon} {label}
    </button>
  );
}
