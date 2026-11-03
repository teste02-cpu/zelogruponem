import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Camera, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

type Search = { redirect?: string | undefined };

function safePath(value: unknown): string {
  if (typeof value !== "string") return "/admin";
  try {
    const url = new URL(value, "http://x");
    if (
      value.startsWith("http") &&
      typeof window !== "undefined" &&
      url.origin !== window.location.origin
    )
      return "/admin";
    const path = url.pathname + url.search;
    return path.startsWith("/") &&
      !path.startsWith("//") &&
      !path.startsWith("/auth") &&
      path !== "/"
      ? path
      : "/admin";
  } catch {
    return "/admin";
  }
}

function defaultPathForRoles(roles: string[], requestedPath: string): string {
  // Only administrators enter the dashboard; everyone else goes to their own tickets.
  if (roles.includes("admin")) return requestedPath;
  const requestedRoute = requestedPath.split("?")[0];
  return requestedRoute === "/conta" || requestedRoute === "/meus-chamados"
    ? requestedPath
    : "/conta";
}

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    redirect: typeof s["redirect"] === "string" ? s["redirect"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Entrar · Zelo" },
      { name: "description", content: "Entre na sua conta ou acesse o painel da equipe do Zelo." },
      { property: "og:title", content: "Entrar · Zelo" },
      { property: "og:description", content: "Acesse seus chamados ou o painel da equipe." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const target = safePath(redirect);

  const continueAfterLogin = useCallback(
    async (userId: string, requestedPath: string) => {
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      if (error) {
        toast.error("Não foi possível verificar o acesso da sua conta.");
        return;
      }
      const next = defaultPathForRoles(
        (roles ?? []).map((role) => role.role as string),
        requestedPath,
      );
      sessionStorage.removeItem("zelo:after-login");
      await navigate({ to: next, replace: true });
    },
    [navigate],
  );

  useEffect(() => {
    if (redirect) sessionStorage.setItem("zelo:after-login", target);
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) throw error;
        if (data.session) {
          void continueAfterLogin(
            data.session.user.id,
            sessionStorage.getItem("zelo:after-login") ?? target,
          ).catch(() => toast.error("Não foi possível abrir sua conta."));
        }
      })
      .catch(() => toast.error("Não foi possível verificar sua sessão."));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        const next = sessionStorage.getItem("zelo:after-login") ?? target;
        window.setTimeout(() => {
          void continueAfterLogin(session.user.id, next).catch(() => {
            toast.error("Não foi possível abrir sua conta.");
          });
        }, 0);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [continueAfterLogin, redirect, target]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
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
            emailRedirectTo: `${window.location.origin}/auth`,
            data: { full_name: name, account_type: "reporter" },
          },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("Conta criada! Confirme pelo link enviado ao seu e-mail.");
          setMode("signin");
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/auth",
    });
    if (result.error) toast.error("Não foi possível entrar com essa conta.");
  }

  return (
    <div className="dark min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-between px-6 py-10">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Camera className="size-5" />
            </span>
            <span className="font-display text-2xl font-extrabold">zelo</span>
          </div>
          <h1 className="mt-10 text-4xl font-extrabold leading-[1.05]">
            Entrar no Zelo
            <span className="block text-primary">Sua conta e seus chamados.</span>
          </h1>
          <p className="mt-4 text-muted-foreground">
            Entre com sua conta. Usuários comuns acompanham seus chamados; administradores e equipe
            de manutenção acessam o painel. Para registrar um problema, o login continua opcional.
          </p>
          <Link
            to="/"
            className="mt-3 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            ← Registrar um problema sem login
          </Link>
        </div>

        <div className="mt-10 space-y-4">
          <Button variant="secondary" size="lg" className="w-full" onClick={signInWithGoogle}>
            <GoogleMark /> Continuar com Google
          </Button>

          <div className="flex items-center gap-3 py-2 text-xs uppercase tracking-widest text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> ou e-mail{" "}
            <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Nome completo</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
              />
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              {mode === "signin" ? "Entrar" : "Criar conta"}
            </Button>
          </form>
          <button
            type="button"
            className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin" ? "Primeiro acesso? Criar conta" : "Já tenho conta"}
          </button>
        </div>
      </div>
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
