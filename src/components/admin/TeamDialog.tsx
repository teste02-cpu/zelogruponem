import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users } from "lucide-react";

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

/** Admin-only: mark which people are part of the maintenance team. */
export function TeamDialog({ currentUserId }: { currentUserId: string }) {
  const qc = useQueryClient();
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const {
    data = [],
    isPending,
    isError,
  } = useQuery({
    queryKey: ["team-people"],
    queryFn: async () => {
      const [{ data: profiles, error: profilesError }, { data: roles, error: rolesError }] =
        await Promise.all([
          supabase.from("profiles").select("id, full_name, email").order("full_name"),
          supabase.from("user_roles").select("user_id, role"),
        ]);
      if (profilesError) throw profilesError;
      if (rolesError) throw rolesError;
      return (profiles ?? []).map((p) => ({
        ...p,
        roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as string),
      }));
    },
  });
  const administratorCount = data.filter((person) => person.roles.includes("admin")).length;

  async function toggleRole(userId: string, role: "admin" | "maintenance", on: boolean) {
    setUpdatingUserId(userId);
    try {
      if (role === "admin" && !on && administratorCount <= 1) {
        toast.error("O sistema precisa manter pelo menos um administrador.");
        return;
      }
      const { error } = on
        ? await supabase.from("user_roles").insert({ user_id: userId, role })
        : await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
      if (error) throw error;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["team-people"] }),
        qc.invalidateQueries({ queryKey: ["managed-users"] }),
        qc.invalidateQueries({ queryKey: ["staff"] }),
        qc.invalidateQueries({ queryKey: ["current-user"] }),
      ]);
      toast.success(
        role === "admin"
          ? on
            ? "Usuário promovido a administrador."
            : "Usuário agora tem acesso normal."
          : on
            ? "Usuário adicionado à equipe de manutenção."
            : "Acesso à equipe de manutenção removido.",
      );
    } catch {
      toast.error("Não foi possível alterar as permissões do usuário.");
    } finally {
      setUpdatingUserId(null);
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Users /> Equipe
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Equipe de manutenção</DialogTitle>
          <DialogDescription>
            Defina quem é administrador e quem pode acessar o painel de manutenção.
          </DialogDescription>
        </DialogHeader>
        {isPending && <p className="py-4 text-sm text-muted-foreground">Carregando usuários…</p>}
        {isError && (
          <p role="alert" className="py-4 text-sm text-destructive">
            Não foi possível carregar os usuários. Tente novamente.
          </p>
        )}
        <ul className="divide-y">
          {data.map((p) => {
            const isAdmin = p.roles.includes("admin");
            const isMaintenance = p.roles.includes("maintenance");
            const isCurrentUser = p.id === currentUserId;
            const cannotRemoveLastAdmin = isAdmin && administratorCount <= 1;
            return (
              <li key={p.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.full_name || "Sem nome"}</p>
                  <p className="truncate text-xs text-muted-foreground">{p.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {isAdmin ? "Administrador" : isMaintenance ? "Equipe de manutenção" : "Usuário"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    Administrador
                    <Switch
                      checked={isAdmin}
                      disabled={isCurrentUser || updatingUserId !== null || cannotRemoveLastAdmin}
                      onCheckedChange={(checked) => toggleRole(p.id, "admin", checked)}
                      aria-label={`${isAdmin ? "Manter como administrador" : "Promover a administrador"} ${p.full_name || p.email}`}
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    Manutenção
                    <Switch
                      checked={isMaintenance}
                      disabled={updatingUserId !== null}
                      onCheckedChange={(checked) => toggleRole(p.id, "maintenance", checked)}
                      aria-label={`${isMaintenance ? "Remover da equipe de manutenção" : "Adicionar à equipe de manutenção"} ${p.full_name || p.email}`}
                    />
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted-foreground">
          Não é possível remover o próprio acesso ou o último administrador do sistema.
        </p>
      </DialogContent>
    </Dialog>
  );
}
