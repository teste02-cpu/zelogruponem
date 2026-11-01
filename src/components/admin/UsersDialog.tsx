import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserRoundCog } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";

export function UsersDialog({ currentUserId }: { currentUserId: string }) {
  const qc = useQueryClient();
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const {
    data: users = [],
    isPending,
    isError,
  } = useQuery({
    queryKey: ["managed-users"],
    queryFn: async () => {
      const [{ data: profiles, error: profilesError }, { data: roles, error: rolesError }] =
        await Promise.all([
          supabase.from("profiles").select("id, full_name, email").order("full_name"),
          supabase.from("user_roles").select("user_id, role"),
        ]);
      if (profilesError) throw profilesError;
      if (rolesError) throw rolesError;
      return (profiles ?? []).map((profile) => ({
        ...profile,
        roles: (roles ?? []).filter((role) => role.user_id === profile.id).map((role) => role.role),
      }));
    },
  });

  async function setAdministrator(userId: string, isAdministrator: boolean) {
    setUpdatingUserId(userId);
    try {
      const result = isAdministrator
        ? await supabase.from("user_roles").insert({ user_id: userId, role: "admin" })
        : await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "admin");
      if (result.error) throw result.error;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["managed-users"] }),
        qc.invalidateQueries({ queryKey: ["team-people"] }),
        qc.invalidateQueries({ queryKey: ["staff"] }),
        qc.invalidateQueries({ queryKey: ["current-user"] }),
      ]);
      toast.success(
        isAdministrator
          ? "Usuário promovido a administrador."
          : "Acesso de administrador removido.",
      );
    } catch {
      toast.error("Não foi possível alterar o nível de acesso.");
    } finally {
      setUpdatingUserId(null);
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserRoundCog /> Usuários
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Usuários do sistema</DialogTitle>
          <DialogDescription>
            Novos cadastros do Google entram como usuários comuns. Apenas administradores podem
            conceder ou remover acesso administrativo.
          </DialogDescription>
        </DialogHeader>
        {isPending && <p className="py-4 text-sm text-muted-foreground">Carregando usuários…</p>}
        {isError && (
          <p role="alert" className="py-4 text-sm text-destructive">
            Não foi possível carregar os usuários. Tente novamente.
          </p>
        )}
        {!isPending && !isError && users.length === 0 && (
          <p className="py-4 text-sm text-muted-foreground">Nenhum usuário cadastrado.</p>
        )}
        <ul className="divide-y">
          {users.map((user) => {
            const isAdministrator = user.roles.includes("admin");
            const isMaintenance = user.roles.includes("maintenance");
            const isCurrentUser = user.id === currentUserId;
            return (
              <li key={user.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{user.full_name || "Sem nome"}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {isAdministrator
                      ? "Administrador"
                      : isMaintenance
                        ? "Equipe de manutenção"
                        : "Usuário"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted-foreground">Admin</span>
                  <Switch
                    checked={isAdministrator}
                    disabled={isCurrentUser || updatingUserId !== null}
                    onCheckedChange={(checked) => setAdministrator(user.id, checked)}
                    aria-label={`${isAdministrator ? "Remover administrador de" : "Promover a administrador"} ${user.full_name || user.email}`}
                  />
                </div>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted-foreground">
          Seu próprio acesso de administrador não pode ser alterado por aqui.
        </p>
      </DialogContent>
    </Dialog>
  );
}
