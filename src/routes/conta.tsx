import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, Camera, Loader2, LogOut, UserRound } from "lucide-react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/incident/Badges";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getAccountIncidents } from "@/lib/incidents.functions";

export const Route = createFileRoute("/conta")({
  head: () => ({
    meta: [
      { title: "Minha conta · Zelo" },
      {
        name: "description",
        content: "Acesse seus dados e acompanhe os chamados registrados na sua conta.",
      },
    ],
  }),
  component: AccountPage,
});

type AccountUser = {
  id: string;
  email: string;
  name: string;
};

function AccountPage() {
  const loadIncidents = useServerFn(getAccountIncidents);
  const [user, setUser] = useState<AccountUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const setAccountUser = (
      authUser: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"],
    ) => {
      if (!active) return;
      if (!authUser) {
        setUser(null);
        return;
      }
      const metadata = authUser.user_metadata as { full_name?: string; name?: string };
      setUser({
        id: authUser.id,
        email: authUser.email ?? "",
        name: metadata.full_name || metadata.name || authUser.email?.split("@")[0] || "Usuário",
      });
    };

    void (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        setAccountUser(data.user);
      } catch {
        toast.error("Não foi possível verificar sua sessão.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      setAccountUser(session?.user ?? null),
    );
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const {
    data: incidents = [],
    isPending,
    isError,
  } = useQuery({
    queryKey: ["account-incidents", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (!data.session) throw new Error("Sua sessão expirou. Entre novamente.");
      return loadIncidents({ data: { accessToken: data.session.access_token } });
    },
  });

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) toast.error("Não foi possível sair da conta.");
  }

  return (
    <div className="dark min-h-dvh bg-background text-foreground">
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <Link
          to="/"
          className="grid size-10 place-items-center rounded-full hover:bg-secondary"
          aria-label="Voltar"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-xl font-bold">Minha conta</h1>
      </header>

      <main className="mx-auto max-w-xl space-y-6 px-4 py-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : user ? (
          <>
            <section className="flex items-center justify-between gap-4 rounded-2xl border bg-card p-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                  <UserRound className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{user.name}</p>
                  <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={signOut}>
                <LogOut className="size-4" /> Sair
              </Button>
            </section>

            <section>
              <h2 className="mb-1 text-lg font-bold">Seus chamados</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Chamados desta conta ficam salvos e podem ser acessados em outros aparelhos.
              </p>
              {isError && (
                <p
                  role="alert"
                  className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
                >
                  Não foi possível carregar seus chamados. Tente novamente.
                </p>
              )}
              {!isPending && !isError && incidents.length === 0 && (
                <div className="rounded-2xl border border-dashed p-8 text-center">
                  <p className="text-muted-foreground">
                    Ainda não há chamados registrados nesta conta.
                  </p>
                  <Button asChild className="mt-4">
                    <Link to="/">
                      <Camera className="size-4" /> Registrar ocorrência
                    </Link>
                  </Button>
                </div>
              )}
              <div className="space-y-3">
                {incidents.map((incident) => (
                  <article key={incident.id} className="rounded-2xl border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold">{incident.title}</h3>
                        <p className="truncate text-sm text-muted-foreground">
                          {incident.location}
                        </p>
                      </div>
                      <StatusBadge status={incident.status} />
                    </div>
                    {incident.status === "concluido" && incident.resolutionNote && (
                      <p className="mt-3 rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">
                        Nota da equipe: {incident.resolutionNote}
                      </p>
                    )}
                    <div className="mt-3 flex justify-between font-mono text-[11px] text-muted-foreground">
                      <span>#{incident.protocol}</span>
                      <span>
                        {format(new Date(incident.createdAt), "dd/MM/yy", { locale: ptBR })}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </>
        ) : (
          <section className="space-y-5 rounded-2xl border bg-card p-6 text-center">
            <div>
              <div className="flex justify-center text-primary">
                <UserRound className="size-5" />
              </div>
              <h2 className="mt-3 text-2xl font-extrabold">Acesse sua conta pelo menu Equipe</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Use o mesmo login para todos. Sua conta define se você verá seus chamados ou o
                painel da equipe.
              </p>
            </div>
            <Button asChild size="lg">
              <Link to="/auth">Entrar ou criar conta</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/">Registrar ocorrência sem login</Link>
            </Button>
          </section>
        )}
      </main>
    </div>
  );
}
