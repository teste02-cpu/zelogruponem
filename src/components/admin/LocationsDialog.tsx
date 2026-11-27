import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MapPin, Plus, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { locationsQueryKey, useLocations, type CampusLocation } from "@/hooks/use-locations";
import { supabase } from "@/integrations/supabase/client";
import {
  CAMPUS_FLOORS,
  campusFloorForBlock,
  groupCampusLocationsByFloor,
} from "@/lib/campus-location-groups";
import { campusLocationKey, parseCampusLocationFile, type ImportedCampusLocation } from "@/lib/campus-location-import";

/** Staff: register the campus floors and rooms offered in the report form. */
export function LocationsDialog() {
  const qc = useQueryClient();
  const { all } = useLocations();
  const fileInput = useRef<HTMLInputElement>(null);
  const [block, setBlock] = useState<(typeof CAMPUS_FLOORS)[number]>(CAMPUS_FLOORS[0]);
  const [room, setRoom] = useState("");
  const [busy, setBusy] = useState(false);

  const grouped = useMemo(() => groupCampusLocationsByFloor(all), [all]);

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
    const existingBlock =
      all.find((location) => location.block.trim().toLocaleUpperCase("pt-BR") === b)?.block ??
      all.find((location) => campusFloorForBlock(location.block) === b)?.block;
    const targetBlock = existingBlock ?? b;
    // A room in a new floor also registers the floor itself.
    if (r && !all.some((location) => location.block === targetBlock)) {
      rows.push({ block: targetBlock, room: null });
    }
    rows.push({ block: targetBlock, room: r || null });
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

  async function importLocations(e: ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("O arquivo deve ter no máximo 10 MB.");
      return;
    }

    setBusy(true);
    try {
      const imported = await parseCampusLocationFile(file);
      const known = new Set(all.map((location) => campusLocationKey(location.block, location.room)));
      const additions: ImportedCampusLocation[] = [];
      let ignored = imported.duplicates;
      for (const location of imported.locations) {
        const key = campusLocationKey(location.block, location.room);
        if (known.has(key)) {
          ignored++;
          continue;
        }
        known.add(key);
        additions.push(location);
      }

      if (additions.length === 0) {
        toast.info("Todos os ambientes do arquivo já estão cadastrados.");
        return;
      }

      const { error } = await supabase.from("locations").insert(additions);
      if (error) {
        toast.error(error.code === "23505"
          ? "Algum ambiente do arquivo já foi cadastrado. Atualize a lista e tente novamente."
          : "Não foi possível importar os ambientes.");
        return;
      }

      const ignoredMessage = ignored ? ` ${ignored} duplicado(s) ignorado(s).` : "";
      toast.success(`${additions.length} ambiente(s) importado(s).${ignoredMessage}`);
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível ler o arquivo.");
    } finally {
      setBusy(false);
    }
  }

  async function setActive(id: string, active: boolean) {
    const { error } = await supabase.from("locations").update({ active }).eq("id", id);
    if (error) toast.error("Não foi possível alterar o local.");
    refresh();
  }

  async function setFloorActive(heads: CampusLocation[], active: boolean) {
    const { error } = await supabase
      .from("locations")
      .update({ active })
      .in(
        "id",
        heads.map((head) => head.id),
      );
    if (error) toast.error("Não foi possível alterar o local.");
    refresh();
  }

  async function removeFloor(floor: string, items: CampusLocation[]) {
    if (!window.confirm(`Excluir ${floor} e todas as salas dele? Chamados já registrados não são afetados.`)) return;
    const blocks = Array.from(new Set(items.map((location) => location.block)));
    const { error } = await supabase.from("locations").delete().in("block", blocks);
    if (error) toast.error("Não foi possível excluir o local.");
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
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <DialogTitle>Localizações do campus</DialogTitle>
          <DialogDescription>
            Exibimos apenas os locais cadastrados em 1º e 2º andar. Os demais cadastros permanecem salvos e ocultos até que o andar seja definido. Locais desativados somem do formulário.
          </DialogDescription>
        </DialogHeader>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            ref={fileInput}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={importLocations}
            aria-label="Arquivo CSV ou XLSX com ambientes"
          />
          <Button type="button" variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}>
            <Upload /> Importar ambientes (CSV/XLSX)
          </Button>
          <p className="text-xs text-muted-foreground">Colunas necessárias: Nome e Localização. Máximo de 10 MB.</p>
        </div>

        <form onSubmit={add} className="grid shrink-0 grid-cols-1 gap-2 rounded-xl border bg-muted/40 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="loc-block">Andar</Label>
            <Select
              value={block}
              onValueChange={(value) => {
                const floor = CAMPUS_FLOORS.find((candidate) => candidate === value);
                if (floor) setBlock(floor);
              }}
            >
              <SelectTrigger id="loc-block" aria-label="Andar">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CAMPUS_FLOORS.map((floor) => (
                  <SelectItem key={floor} value={floor}>
                    {floor}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain">
          {grouped.map(([b, items]) => {
            const heads = items.filter((l) => !l.room);
            const rooms = items.filter((l) => l.room);
            return (
              <section key={b} className="rounded-xl border">
                <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                  <p className="font-semibold">{b}</p>
                  <div className="flex items-center gap-2">
                    {heads.length > 0 && (
                      <Switch
                        checked={heads.every((head) => head.active)}
                        onCheckedChange={(active) => setFloorActive(heads, active)}
                        aria-label={`Ativar ${b}`}
                      />
                    )}
                    {heads.length > 0 && (
                      <Button variant="ghost" size="icon" onClick={() => removeFloor(b, items)} aria-label={`Excluir ${b}`}>
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
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    {heads.length > 0
                      ? "Sem salas cadastradas — quem reporta digita o local."
                      : "Nenhum local cadastrado neste andar."}
                  </p>
                )}
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
