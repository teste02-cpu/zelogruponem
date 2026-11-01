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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
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
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

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

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/conta`,
            data: { full_name: name.trim(), account_type: "reporter" },
          },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("Conta criada! Confirme pelo link enviado ao seu e-mail.");
          setMode("signin");
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível acessar sua conta.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) toast.error("Não foi possível sair da conta.");
  }

  async function signInWithGoogle() {
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/conta`,
      });
      if (result.error) throw result.error;
    } catch {
      toast.error("Não foi possível continuar com o Google.");
    }
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
          <section className="space-y-5">
            <div>
              <div className="flex items-center gap-2 text-primary">
                <UserRound className="size-5" />
                <span className="font-semibold">Conta de quem registra</span>
              </div>
              <h2 className="mt-3 text-3xl font-extrabold">
                {mode === "signin" ? "Acesse seus chamados" : "Salve seus dados"}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {mode === "signin"
                  ? "Entre com seu e-mail para recuperar seus dados e chamados."
                  : "Crie uma conta opcional para salvar seu nome e acompanhar seus chamados em qualquer aparelho."}{" "}
                O registro de ocorrências continua disponível sem login.
              </p>
            </div>

            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="w-full"
              onClick={signInWithGoogle}
            >
              <GoogleMark /> Continuar com Google
            </Button>
            <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> ou e-mail{" "}
              <span className="h-px flex-1 bg-border" />
            </div>

            <form onSubmit={submit} className="space-y-4">
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <Label htmlFor="account-name">Seu nome</Label>
                  <Input
                    id="account-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                    autoComplete="name"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="account-email">E-mail</Label>
                <Input
                  id="account-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="account-password">Senha</Label>
                <Input
                  id="account-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={6}
                  required
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                />
              </div>
              <Button type="submit" className="w-full" size="lg" disabled={busy}>
                {busy && <Loader2 className="animate-spin" />}
                {mode === "signin" ? "Entrar" : "Criar conta"}
              </Button>
            </form>
            <button
              type="button"
              className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            >
              {mode === "signin" ? "Ainda não tem conta? Criar conta" : "Já tenho uma conta"}
            </button>
          </section>
        )}
      </main>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="currentColor"
        d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3Z"
      />
      <path
        fill="currentColor"
        opacity=".8"
        d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z"
      />
      <path
        fill="currentColor"
        opacity=".6"
        d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14Z"
      />
      <path
        fill="currentColor"
        opacity=".9"
        d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10C7.2 7.7 9.4 6 12 6Z"
      />
    </svg>
  );
}
