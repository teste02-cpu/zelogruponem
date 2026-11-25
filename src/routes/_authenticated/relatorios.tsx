import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format, subDays } from "date-fns";
import { AlertTriangle, ArrowLeft, Download, Printer, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { adminIncidentsOptions } from "@/lib/admin-incidents";
import { filterReport, summarizeReport, reportRecurrences, maintenanceCsv, type ReportFilters } from "@/lib/maintenance-report";
import { RECURRENCE_WINDOW_DAYS } from "@/lib/recurrence";
import { STATUS_LABEL, PRIORITY_LABEL } from "@/lib/incident-meta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { IncidentRow } from "@/components/admin/types";

export const Route = createFileRoute("/_authenticated/relatorios")({
  beforeLoad: async ({ context }) => {
    const { data, error } = await supabase.rpc("is_staff", { _user_id: context.userId });
    if (error || !data) throw redirect({ to: "/conta" });
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(adminIncidentsOptions),
  head: () => ({ meta: [
    { title: "Relatórios de manutenção · Zelo" },
    { name: "description", content: "Relatórios das manutenções do campus, status dos chamados e problemas recorrentes." },
    { property: "og:title", content: "Relatórios de manutenção · Zelo" },
    { property: "og:description", content: "Indicadores de manutenção e acompanhamento de problemas recorrentes no campus." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex, nofollow" },
  ] }),
  component: MaintenanceReports,
  pendingComponent: () => <p className="p-8 text-muted-foreground">Carregando relatório…</p>,
  errorComponent: () => <div className="space-y-4 p-8"><h1 className="text-xl font-bold">Não foi possível carregar o relatório.</h1><Button asChild variant="outline"><Link to="/admin">Voltar ao painel</Link></Button></div>,
});

function MaintenanceReports() {
  const { data: incidents, refetch, isFetching, isRefetchError } = useSuspenseQuery(adminIncidentsOptions);
  const [filters, setFilters] = useState<ReportFilters>(() => ({
    from: format(subDays(new Date(), RECURRENCE_WINDOW_DAYS), "yyyy-MM-dd"),
    to: format(new Date(), "yyyy-MM-dd"), block: "all", category: "all", status: "all",
  }));
  const [page, setPage] = useState(0);
  const [onlyRecurring, setOnlyRecurring] = useState(false);
  const invalidDates = !!filters.from && !!filters.to && filters.from > filters.to;
  const recurrences = useMemo(() => reportRecurrences(incidents, filters), [incidents, filters]);
  const recurringIds = useMemo(() => new Set(recurrences.flatMap((r) => r.ids)), [recurrences]);
  const rows = useMemo(() => invalidDates ? [] : filterReport(incidents, filters).filter((r) => !onlyRecurring || recurringIds.has(r.id)), [incidents, filters, invalidDates, onlyRecurring, recurringIds]);
  const summary = useMemo(() => summarizeReport(rows), [rows]);
  const blocks = [...new Set(incidents.map((r) => r.block).filter((b): b is string => !!b))].sort();
  const categories = [...new Set(incidents.map((r) => r.category))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const pageCount = Math.max(1, Math.ceil(rows.length / 25));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleRows = rows.slice(currentPage * 25, (currentPage + 1) * 25);
  function update(key: keyof ReportFilters, value: string) {
    setFilters((f) => ({ ...f, [key]: value })); setPage(0);
  }
  function exportCsv() {
    const url = URL.createObjectURL(new Blob([maintenanceCsv(rows, recurringIds)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url;
    link.download = `zelo-manutencoes-${filters.from || "inicio"}-${filters.to || "hoje"}.csv`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="maintenance-report min-h-dvh bg-background text-foreground">
      <header className="border-b print:hidden">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <span className="font-display text-2xl font-extrabold">zelo</span>
          <Button asChild variant="outline" size="sm"><Link to="/admin"><ArrowLeft />Painel</Link></Button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-7 px-4 py-6 print:p-0">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0"><h1 className="font-display text-3xl font-bold tracking-normal">Relatórios de manutenção</h1><p className="mt-2 text-sm text-muted-foreground">{filters.from ? format(new Date(`${filters.from}T12:00:00`), "dd/MM/yyyy") : "Início"} — {filters.to ? format(new Date(`${filters.to}T12:00:00`), "dd/MM/yyyy") : "Hoje"} · Abertura dos chamados</p></div>
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button variant="ghost" size="icon" title="Atualizar dados" aria-label="Atualizar dados" disabled={isFetching} onClick={() => void refetch()}><RefreshCw className={isFetching ? "animate-spin" : ""} /></Button>
            <Button variant="outline" onClick={() => window.print()} disabled={invalidDates || !rows.length}><Printer />Imprimir / PDF</Button>
            <Button onClick={exportCsv} disabled={invalidDates || !rows.length}><Download />Exportar CSV</Button>
          </div>
        </div>
        <section className="grid gap-3 border-y py-4 sm:grid-cols-2 lg:grid-cols-5 print:hidden" aria-label="Filtros do relatório">
          <div className="space-y-1.5"><Label htmlFor="report-from">Data inicial</Label><Input id="report-from" type="date" value={filters.from} onChange={(e) => update("from", e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="report-to">Data final</Label><Input id="report-to" type="date" value={filters.to} onChange={(e) => update("to", e.target.value)} /></div>
          <ReportSelect label="Local" value={filters.block} onChange={(v) => update("block", v)} options={blocks.map((b) => [b, b])} all="Todos os locais" />
          <ReportSelect label="Categoria" value={filters.category} onChange={(v) => update("category", v)} options={categories.map((c) => [c, c])} all="Todas as categorias" />
          <ReportSelect label="Status" value={filters.status} onChange={(v) => update("status", v)} options={Object.entries(STATUS_LABEL)} all="Todos os status" />
        </section>
        {invalidDates && <p role="alert" className="text-destructive">A data final deve ser igual ou posterior à data inicial.</p>}
        {isRefetchError && <p role="alert" className="text-destructive">Não foi possível atualizar os dados. Tente novamente.</p>}
        <dl className="grid grid-cols-2 gap-5 border-b pb-6 sm:grid-cols-3 lg:grid-cols-6">
          {[["Total", summary.total], ["Pendentes", summary.pending], ["Em andamento", summary.progress], ["Concluídos", summary.done], ["Aguardando triagem", summary.triage], ["Prioridade alta", summary.high]].map(([label, value]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 font-display text-3xl font-bold">{value}</dd></div>)}
        </dl>
        <section className="border-l-4 border-priority-high bg-priority-high-soft p-4" aria-label="Problemas recorrentes">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="flex items-center gap-2 text-xl font-bold text-priority-high"><AlertTriangle className="size-5" />Problemas recorrentes <span className="font-mono text-sm">({recurrences.length})</span></h2><p className="mt-1 text-sm text-muted-foreground">Últimos {RECURRENCE_WINDOW_DAYS} dias · Mesmo colaborador e categoria</p></div>
            <Button variant={onlyRecurring ? "secondary" : "outline"} aria-pressed={onlyRecurring} onClick={() => { setOnlyRecurring((v) => !v); setPage(0); }} className="print:hidden">{onlyRecurring ? "Mostrar todos" : "Somente recorrentes"}</Button>
          </div>
          {recurrences.length ? <ul className="divide-y divide-priority-high/20">{recurrences.map((r) => <li key={r.key} className="flex flex-wrap items-center justify-between gap-2 py-3"><div className="min-w-0 break-words"><strong>{r.reporter}</strong><p className="text-sm">{r.category}</p></div><span className="font-mono font-semibold text-priority-high">{r.ids.length} chamados</span></li>)}</ul> : <p className="text-sm text-muted-foreground">Nenhum problema recorrente nos locais e categorias selecionados.</p>}
        </section>
        <section aria-label="Manutenções por categoria" className="space-y-3">
          <h2 className="text-xl font-bold">Manutenções por categoria</h2>
          {summary.categories.length ? <div className="grid gap-x-10 gap-y-3 md:grid-cols-2">{summary.categories.map(([category, count]) => <div key={category} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"><span className="text-sm">{category}</span><strong className="font-mono text-sm">{count}</strong><meter className="col-span-2 h-2 w-full accent-primary" min={0} max={summary.total || 1} value={count} aria-label={`${category}: ${count}`} /></div>)}</div> : <p className="text-sm text-muted-foreground">Nenhuma manutenção no período selecionado.</p>}
        </section>
        <section className="space-y-3" aria-label="Detalhamento das manutenções">
          <h2 className="text-xl font-bold">Detalhamento <span className="font-mono text-base text-muted-foreground">({rows.length})</span></h2>
          <div className="overflow-x-auto print:hidden"><ReportTable rows={visibleRows} recurringIds={recurringIds} /></div>
          <div className="hidden print:block"><ReportTable rows={rows} recurringIds={recurringIds} /></div>
          {!rows.length && !invalidDates && <p className="py-6 text-center text-muted-foreground">Nenhum chamado com esses filtros.</p>}
          <div className="flex items-center justify-end gap-3 print:hidden"><span className="text-sm text-muted-foreground">Página {currentPage + 1} de {pageCount}</span><Button variant="outline" size="icon" aria-label="Página anterior" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft /></Button><Button variant="outline" size="icon" aria-label="Próxima página" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight /></Button></div>
        </section>
        <p className="border-t pt-3 text-xs text-muted-foreground">Zelo · Gerado em {format(new Date(), "dd/MM/yyyy HH:mm")} · Local: {filters.block === "all" ? "Todos" : filters.block} · Categoria: {filters.category === "all" ? "Todas" : filters.category} · Status: {filters.status === "all" ? "Todos" : STATUS_LABEL[filters.status as keyof typeof STATUS_LABEL]}{onlyRecurring ? " · Somente recorrentes" : ""}</p>
      </main>
    </div>
  );
}

function ReportSelect({ label, value, onChange, options, all }: { label: string; value: string; onChange: (value: string) => void; options: string[][]; all: string }) {
  return <div className="min-w-0 space-y-1.5"><Label>{label}</Label><Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label} className="w-full [&>span]:truncate"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{all}</SelectItem>{options.map(([key, name]) => key && <SelectItem key={key} value={key}>{name}</SelectItem>)}</SelectContent></Select></div>;
}

function ReportTable({ rows, recurringIds }: { rows: IncidentRow[]; recurringIds: Set<string> }) {
  return <table className="w-full min-w-[760px] border-collapse text-left text-sm print:min-w-0 print:text-xs"><thead className="border-y bg-muted/50"><tr>{["Chamado / abertura", "Local / categoria", "Colaborador", "Status / prioridade", "Conclusão"].map((h) => <th key={h} className="px-3 py-3 font-medium">{h}</th>)}</tr></thead><tbody>{rows.map((r) => <tr key={r.id} className={`border-b align-top ${recurringIds.has(r.id) ? "bg-priority-high-soft/50" : ""}`}><td className="max-w-64 px-3 py-3 break-words"><span className="font-mono text-xs text-muted-foreground">#{r.id.slice(0, 8).toUpperCase()} · {format(new Date(r.created_at), "dd/MM/yyyy")}</span><p className="mt-1 font-medium">{r.title}</p>{recurringIds.has(r.id) && <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-priority-high"><AlertTriangle className="size-3" />Recorrente</span>}</td><td className="max-w-48 px-3 py-3 break-words">{r.location}<p className="mt-1 text-xs text-muted-foreground">{r.category}</p></td><td className="max-w-40 px-3 py-3 break-words">{r.reporter_name}</td><td className="px-3 py-3">{STATUS_LABEL[r.status]}<p className="mt-1 text-xs text-muted-foreground">{r.priority_confirmed ? PRIORITY_LABEL[r.priority] : "Aguardando triagem"}</p></td><td className="max-w-52 px-3 py-3 break-words">{r.resolved_at ? format(new Date(r.resolved_at), "dd/MM/yyyy") : "—"}{r.status === "concluido" && r.resolution_note && <p className="mt-1 text-xs text-muted-foreground">{r.resolution_note}</p>}</td></tr>)}</tbody></table>;
}