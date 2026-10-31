import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";

/** Admin-only: mark which people are part of the maintenance team. */
export function TeamDialog() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["team-people"],
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email").order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      return (profiles ?? []).map((p) => ({
        ...p,
        roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as string),
      }));
    },
  });

  async function toggle(userId: string, on: boolean) {
    const { error } = on
      ? await supabase.from("user_roles").insert({ user_id: userId, role: "maintenance" })
      : await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "maintenance");
    if (error) {
      toast.error("Não foi possível alterar a equipe.");
      return;
    }
    qc.invalidateQueries({ queryKey: ["team-people"] });
    qc.invalidateQueries({ queryKey: ["staff"] });
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
          <DialogDescription>Quem estiver marcado pode ver o painel e receber chamados.</DialogDescription>
        </DialogHeader>
        <ul className="divide-y">
          {data.map((p) => {
            const isAdmin = p.roles.includes("admin");
            return (
              <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.full_name}</p>
                  <p className="truncate text-xs text-muted-foreground">{p.email}</p>
                </div>
                {isAdmin ? (
                  <span className="font-mono text-[11px] uppercase text-muted-foreground">Administrador</span>
                ) : (
                  <Switch checked={p.roles.includes("maintenance")} onCheckedChange={(v) => toggle(p.id, v)} />
                )}
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
