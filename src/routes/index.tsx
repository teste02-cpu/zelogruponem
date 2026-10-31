import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Bell, CheckCircle2, LayoutDashboard, Loader2, QrCode, RotateCcw, Sparkles } from "lucide-react";

import { CameraView } from "@/components/capture/CameraView";
import { QrScannerDialog } from "@/components/capture/QrScannerDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCurrentUser } from "@/hooks/use-current-user";
import { supabase } from "@/integrations/supabase/client";
import { analyzeIncidentPhoto, createIncident } from "@/lib/incidents.functions";
import { BLOCKS, CATEGORIES, parseLocationCode } from "@/lib/incident-meta";
import { dataUrlToBlob } from "@/lib/image";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Registrar ocorrência · Zelo" },
      { name: "description", content: "Abra a câmera, fotografe o problema e registre a ocorrência em segundos." },
      { property: "og:title", content: "Registrar ocorrência · Zelo" },
      { property: "og:description", content: "Fotografe o problema do campus e a IA preenche o chamado para você." },
    ],
  }),
  component: CapturePage,
});

type Step = "camera" | "review" | "done";

function CapturePage() {
  const { data: me } = useCurrentUser();
  const analyze = useServerFn(analyzeIncidentPhoto);
  const create = useServerFn(createIncident);

  const [step, setStep] = useState<Step>("camera");
  const [photo, setPhoto] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [block, setBlock] = useState("");
  const [room, setRoom] = useState("");
  const [category, setCategory] = useState<string>("Outros");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [protocol, setProtocol] = useState<string | null>(null);

  const { data: unread = 0 } = useQuery({
    queryKey: ["notifications-unread"],
    queryFn: async () => {
      const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("read", false);
      return count ?? 0;
    },
  });

  async function handleCapture(dataUrl: string) {
    setPhoto(dataUrl);
    setStep("review");
    setAnalyzing(true);
    setAiNote(null);
    try {
      const res = await analyze({ data: { imageDataUrl: dataUrl } });
      if (res.ok) {
        setCategory(res.analysis.category);
        setTitle(res.analysis.title);
        setDescription(res.analysis.description);
        if (!res.analysis.is_maintenance_issue) setAiNote("A IA não identificou um problema claro. Revise a descrição.");
      } else {
        setAiNote(res.error);
      }
    } catch {
      setAiNote("Não foi possível analisar a foto. Preencha manualmente.");
    } finally {
      setAnalyzing(false);
    }
  }

  const onQr = useCallback((text: string) => {
    const parsed = parseLocationCode(text);
    if (parsed.block) setBlock(parsed.block);
    setRoom(parsed.room);
    toast.success("Local identificado pelo QR Code");
  }, []);

  function reset() {
    setStep("camera");
    setPhoto(null);
    setTitle("");
    setDescription("");
    setCategory("Outros");
    setAiNote(null);
    setProtocol(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!photo || !me) return;
    if (!block && !room.trim()) {
      toast.error("Informe a localização.");
      return;
    }
    if (description.trim().length < 5) {
      toast.error("Descreva o problema.");
      return;
    }
    setSubmitting(true);
    try {
      const path = `${me.id}/${crypto.randomUUID()}.jpg`;
      const blob = await dataUrlToBlob(photo);
      const { error: upErr } = await supabase.storage
        .from("incident-photos")
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (upErr) throw new Error("Falha ao enviar a foto.");
      const res = await create({ data: { photoPath: path, block, room, category, title, description } });
      setProtocol(res.id.slice(0, 8).toUpperCase());
      setStep("done");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível registrar.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dark flex h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2">
          <span className="font-display text-xl font-extrabold">zelo</span>
          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground">{me?.name ?? "…"}</span>
        </div>
        <nav className="flex items-center gap-1">
          {me?.isStaff && (
            <Link to="/admin" className="grid size-10 place-items-center rounded-full hover:bg-secondary" aria-label="Painel">
              <LayoutDashboard className="size-5" />
            </Link>
          )}
          <Link to="/meus-chamados" className="relative grid size-10 place-items-center rounded-full hover:bg-secondary" aria-label="Meus chamados">
            <Bell className="size-5" />
            {unread > 0 && (
              <span className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {unread}
              </span>
            )}
          </Link>
        </nav>
      </header>

      {step === "camera" && (
        <div className="min-h-0 flex-1">
          <CameraView onCapture={handleCapture} />
        </div>
      )}

      {step === "review" && photo && (
        <form onSubmit={submit} className="min-h-0 flex-1 overflow-y-auto">
          <div className="relative mx-4 aspect-[4/3] overflow-hidden rounded-2xl bg-card [container-type:size]">
            <img src={photo} alt="Foto do problema" className="size-full object-cover" />
            {analyzing && (
              <>
                <div className="absolute inset-0 bg-background/30" />
                <div className="absolute inset-x-0 top-0 h-1 bg-primary shadow-glow animate-scan" />
                <div className="absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-full bg-background/85 px-3 py-1.5 text-sm">
                  <Sparkles className="size-4 text-primary" /> Analisando a foto…
                </div>
              </>
            )}
            <button
              type="button"
              onClick={reset}
              className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-background/85 px-3 py-1.5 text-sm"
            >
              <RotateCcw className="size-4" /> Refazer
            </button>
          </div>

          <div className="space-y-4 px-4 pb-32 pt-5">
            {aiNote && <p className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">{aiNote}</p>}

            <div className="space-y-1.5">
              <Label>Solicitante</Label>
              <Input value={me?.name ?? ""} readOnly className="bg-muted text-muted-foreground" />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Localização</Label>
                <button type="button" onClick={() => setQrOpen(true)} className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                  <QrCode className="size-4" /> Ler QR Code
                </button>
              </div>
              <div className="grid grid-cols-[1fr_1.2fr] gap-2">
                <Select value={block} onValueChange={setBlock}>
                  <SelectTrigger>
                    <SelectValue placeholder="Bloco" />
                  </SelectTrigger>
                  <SelectContent className="dark">
                    {BLOCKS.map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input placeholder="Sala 05, Banheiro 2º andar…" value={room} onChange={(e) => setRoom(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  Categoria <AiTag loading={analyzing} />
                </Label>
                <Select value={category} onValueChange={setCategory} disabled={analyzing}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark">
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  Título <AiTag loading={analyzing} />
                </Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={analyzing ? "Gerando…" : "Ex.: Maçaneta danificada"} disabled={analyzing} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                Descrição do problema <AiTag loading={analyzing} />
              </Label>
              <Textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={analyzing ? "A IA está descrevendo o problema…" : "Descreva o que aconteceu"}
                disabled={analyzing}
              />
              <p className="text-xs text-muted-foreground">Sugestão da IA — edite à vontade.</p>
            </div>
          </div>

          <div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-background via-background to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6">
            <Button type="submit" size="lg" className="h-14 w-full rounded-2xl text-base font-semibold" disabled={submitting || analyzing}>
              {submitting && <Loader2 className="animate-spin" />}
              Registrar Ocorrência
            </Button>
          </div>
        </form>
      )}

      {step === "done" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <span className="grid size-20 place-items-center rounded-full bg-priority-low-soft">
            <CheckCircle2 className="size-10 text-priority-low" />
          </span>
          <h1 className="text-3xl font-extrabold">Ocorrência registrada</h1>
          <p className="text-muted-foreground">
            A equipe de manutenção já recebeu seu chamado. Você será avisado aqui quando for resolvido.
          </p>
          {protocol && <p className="font-mono text-sm text-muted-foreground">Protocolo #{protocol}</p>}
          <div className="mt-4 flex w-full max-w-xs flex-col gap-2">
            <Button size="lg" onClick={reset}>
              Registrar outro problema
            </Button>
            <Button size="lg" variant="secondary" asChild>
              <Link to="/meus-chamados">Ver meus chamados</Link>
            </Button>
          </div>
        </div>
      )}

      <QrScannerDialog open={qrOpen} onOpenChange={setQrOpen} onResult={onQr} />
    </div>
  );
}

function AiTag({ loading }: { loading: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-accent-foreground">
      {loading ? <Loader2 className="size-2.5 animate-spin" /> : <Sparkles className="size-2.5" />} IA
    </span>
  );
}
