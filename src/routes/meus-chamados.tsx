import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, Bell, Camera } from "lucide-react";

import { StatusBadge } from "@/components/incident/Badges";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useSignedUrls } from "@/hooks/use-signed-urls";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/meus-chamados")({
  head: () => ({
    meta: [
      { title: "Meus chamados · Zelo" },
      { name: "description", content: "Acompanhe o status das ocorrências que você registrou e veja os avisos de resolução." },
      { property: "og:title", content: "Meus chamados · Zelo" },
      { property: "og:description", content: "Acompanhe suas ocorrências de manutenção no campus." },
    ],
  }),
  component: MyIncidents,
});

function MyIncidents() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();

  const { data: incidents = [] } = useQuery({
    queryKey: ["my-incidents", me?.id],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incidents")
        .select("id, title, location, status, created_at, photo_path, resolution_note")
        .eq("user_id", me!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications", me?.id],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id, message, read, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id).join(",");
  useEffect(() => {
    if (!unreadIds) return;
    const t = setTimeout(async () => {
      await supabase.from("notifications").update({ read: true }).in("id", unreadIds.split(","));
      qc.invalidateQueries({ queryKey: ["notifications-unread"] });
    }, 1500);
    return () => clearTimeout(t);
  }, [unreadIds, qc]);

  const { data: urls = {} } = useSignedUrls(incidents.map((i) => i.photo_path));

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background/90 px-4 py-3 backdrop-blur">
        <Link to="/" className="grid size-10 place-items-center rounded-full hover:bg-secondary" aria-label="Voltar">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-xl font-bold">Meus chamados</h1>
      </header>

      <main className="mx-auto max-w-xl space-y-6 px-4 py-5">
        {notifications.length > 0 && (
          <section className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <Bell className="size-4" /> Avisos
            </h2>
            {notifications.map((n) => (
              <div key={n.id} className={`rounded-xl border p-3 text-sm ${n.read ? "bg-card" : "border-primary/40 bg-accent"}`}>
                <p>{n.message}</p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  {format(new Date(n.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                </p>
              </div>
            ))}
          </section>
        )}

        <section className="space-y-3">
          {incidents.length === 0 && (
            <div className="rounded-2xl border border-dashed p-8 text-center">
              <p className="text-muted-foreground">Você ainda não registrou ocorrências.</p>
              <Link to="/" className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                <Camera className="size-4" /> Registrar agora
              </Link>
            </div>
          )}
          {incidents.map((i) => (
            <article key={i.id} className="flex gap-3 rounded-2xl border bg-card p-3 shadow-card">
              <div className="size-20 shrink-0 overflow-hidden rounded-xl bg-muted">
                {i.photo_path && urls[i.photo_path] && <img src={urls[i.photo_path]} alt="" className="size-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-semibold">{i.title}</h3>
                <p className="truncate text-sm text-muted-foreground">{i.location}</p>
                <div className="mt-2 flex items-center justify-between">
                  <StatusBadge status={i.status} />
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {format(new Date(i.created_at), "dd/MM/yy", { locale: ptBR })}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
