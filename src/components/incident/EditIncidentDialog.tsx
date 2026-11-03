import { useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ReporterEditFields } from "@/lib/reporter-edit";

type Props = {
  initial: ReporterEditFields;
  onSave: (fields: ReporterEditFields) => Promise<{ changed: boolean }>;
};

/** Lets a reporter correct their own ticket while it is still open. */
export function EditIncidentDialog({ initial, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await onSave(fields);
      toast.success(res.changed ? "Chamado atualizado. A equipe foi avisada." : "Nada foi alterado.");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setFields(initial);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <Pencil className="size-4" /> Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="dark bg-background text-foreground">
        <DialogHeader>
          <DialogTitle>Editar chamado</DialogTitle>
          <DialogDescription>
            Você pode corrigir o chamado até ele ser concluído. A equipe verá que houve uma atualização.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-title">Título</Label>
            <Input
              id="edit-title"
              value={fields.title}
              maxLength={120}
              onChange={(e) => setFields({ ...fields, title: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-location">Local</Label>
            <Input
              id="edit-location"
              value={fields.location}
              maxLength={140}
              onChange={(e) => setFields({ ...fields, location: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-description">Descrição</Label>
            <Textarea
              id="edit-description"
              rows={5}
              value={fields.description}
              maxLength={2000}
              onChange={(e) => setFields({ ...fields, description: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />} Salvar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
