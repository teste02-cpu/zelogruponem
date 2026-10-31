import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MapPin, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { locationsQueryKey, useLocations, type CampusLocation } from "@/hooks/use-locations";
import { supabase } from "@/integrations/supabase/client";

/** Staff: register the campus blocks/buildings and rooms offered in the report form. */
export function LocationsDialog() {
  const qc = useQueryClient();
  const { all } = useLocations();
  const [block, setBlock] = useState("");
  const [room, setRoom] = useState("");
  const [busy, setBusy] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, CampusLocation[]>();
    for (const l of all) map.set(l.block, [...(map.get(l.block) ?? []), l]);
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, "pt-BR"));
  }, [all]);
  const blockNames = grouped.map(([b]) => b);

  const refresh = () => qc.invalidateQueries({ queryKey: locationsQueryKey });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const b = block.trim();
    const r = room.trim();
    if (!b) {
      toast.error("Informe o bloco ou prédio.");
      return;
    }
    setBusy(true);
    const rows: { block: string; room: string | null }[] = [];
    // A room in a new block also registers the block itself.
    if (r && !blockNames.some((n) => n.toLowerCase() === b.toLowerCase())) rows.push({ block: b, room: null });
    rows.push({ block: b, room: r || null });
    const { error } = await supabase.from("locations").insert(rows);
    setBusy(false);
    if (error) {
      toast.error(error.code === "23505" ? "Esse local já está cadastrado." : "Não foi possível cadastrar o local.");
      return;
    }
    toast.success(r ? `${b} - ${r} cadastrado` : `${b} cadastrado`);
    setRoom("");
    refresh();
  }

  async function setActive(id: string, active: boolean) {
    const { error } = await supabase.from("locations").update({ active }).eq("id", id);
    if (error) toast.error("Não foi possível alterar o local.");
    refresh();
  }

  async function remove(l: CampusLocation) {
    const label = l.room ? `${l.block} - ${l.room}` : `${l.block} (e todas as salas dele)`;
    if (!window.confirm(`Excluir ${label}? Chamados já registrados não são afetados.`)) return;
    const q = supabase.from("locations").delete();
    const { error } = l.room ? await q.eq("id", l.id) : await q.eq("block", l.block);
    if (error) toast.error("Não foi possível excluir o local.");
    refresh();
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <MapPin /> <span className="hidden sm:inline">Locais</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Localizações do campus</DialogTitle>
          <DialogDescription>
            Blocos, prédios e salas que aparecem para quem registra um chamado. Locais desativados somem do formulário.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={add} className="grid grid-cols-1 gap-2 rounded-xl border bg-muted/40 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="loc-block">Bloco / prédio</Label>
            <Input id="loc-block" list="loc-blocks" value={block} onChange={(e) => setBlock(e.target.value)} placeholder="Ex.: Bloco F" />
            <datalist id="loc-blocks">
              {blockNames.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loc-room">
              Sala / espaço <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Input id="loc-room" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="Ex.: Sala 05" />
          </div>
          <Button type="submit" disabled={busy}>
            <Plus /> Adicionar
          </Button>
        </form>

        <div className="space-y-4">
          {grouped.length === 0 && <p className="text-sm text-muted-foreground">Nenhum local cadastrado.</p>}
          {grouped.map(([b, items]) => {
            const head = items.find((l) => !l.room);
            const rooms = items.filter((l) => l.room);
            return (
              <section key={b} className="rounded-xl border">
                <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                  <p className="font-semibold">{b}</p>
                  <div className="flex items-center gap-2">
                    {head && <Switch checked={head.active} onCheckedChange={(v) => setActive(head.id, v)} aria-label={`Ativar ${b}`} />}
                    {head && (
                      <Button variant="ghost" size="icon" onClick={() => remove(head)} aria-label={`Excluir ${b}`}>
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                </div>
                {rooms.length > 0 ? (
                  <ul className="divide-y">
                    {rooms.map((l) => (
                      <li key={l.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                        <span className={l.active ? "" : "text-muted-foreground line-through"}>{l.room}</span>
                        <div className="flex items-center gap-2">
                          <Switch checked={l.active} onCheckedChange={(v) => setActive(l.id, v)} aria-label={`Ativar ${l.room}`} />
                          <Button variant="ghost" size="icon" onClick={() => remove(l)} aria-label={`Excluir ${l.room}`}>
                            <Trash2 />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-3 py-2 text-xs text-muted-foreground">Sem salas cadastradas — quem reporta digita o local.</p>
                )}
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
