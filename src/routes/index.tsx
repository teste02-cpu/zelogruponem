import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Bell,
  CheckCircle2,
  Loader2,
  Mic,
  QrCode,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Square,
} from "lucide-react";

import { CameraView } from "@/components/capture/CameraView";
import { QrScannerDialog } from "@/components/capture/QrScannerDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  analyzeIncidentPhoto,
  createIncident,
  getTrackedIncidents,
  regenerateIncidentDescription,
  transcribeIncidentDescriptionAudio,
} from "@/lib/incidents.functions";
import { CATEGORIES, parseLocationCode } from "@/lib/incident-meta";
import { useLocations } from "@/hooks/use-locations";
import {
  CAMPUS_FLOORS,
  campusFloorForBlock,
  removeCampusFloorLabel,
  type CampusFloor,
} from "@/lib/campus-location-groups";
import {
  addTrackedTicket,
  readReporter,
  readSeenResolved,
  readTrackedTickets,
  saveReporter,
} from "@/lib/tracked-tickets";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Registrar ocorrência · Infraestrutura NEM" },
      {
        name: "description",
        content:
          "Abra a câmera, fotografe o problema e registre a ocorrência em segundos, sem precisar de login.",
      },
      { property: "og:title", content: "Registrar ocorrência · Infraestrutura NEM" },
      {
        property: "og:description",
        content: "Fotografe o problema do campus e a IA preenche o chamado para você.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CapturePage,
});

type Step = "camera" | "review" | "done";

function CapturePage() {
  const analyze = useServerFn(analyzeIncidentPhoto);
  const create = useServerFn(createIncident);
  const tracked = useServerFn(getTrackedIncidents);
  const regenerateDescription = useServerFn(regenerateIncidentDescription);
  const transcribeAudio = useServerFn(transcribeIncidentDescriptionAudio);

  const { roomsOfFloor } = useLocations();
  const [step, setStep] = useState<Step>("camera");
  const [photo, setPhoto] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [reporterName, setReporterName] = useState("");
  const [reporterEmail, setReporterEmail] = useState("");
  const [block, setBlock] = useState<CampusFloor | "">("");
  const [room, setRoom] = useState("");
  const [category, setCategory] = useState<string>("Outros");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [protocol, setProtocol] = useState<string | null>(null);
  const [sentWithEmail, setSentWithEmail] = useState(false);
  const [regeneratingDescription, setRegeneratingDescription] = useState(false);
  const [audioState, setAudioState] = useState<"idle" | "recording" | "transcribing">("idle");
  const titleEditTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRequestSequenceRef = useRef(0);
  const titleWasEditedManuallyRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    return () => {
      if (titleEditTimerRef.current) clearTimeout(titleEditTimerRef.current);
      titleRequestSequenceRef.current++;
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const regenerateDescriptionFromTitle = useCallback(async (nextTitle: string) => {
    const cleanTitle = nextTitle.trim();
    if (cleanTitle.length < 2) {
      titleRequestSequenceRef.current++;
      setRegeneratingDescription(false);
      return;
    }

    const sequence = ++titleRequestSequenceRef.current;
    setRegeneratingDescription(true);
    try {
      const res = await regenerateDescription({
        data: {
          category,
          title: cleanTitle,
          location: [block, room].filter(Boolean).join(" - "),
        },
      });
      if (sequence !== titleRequestSequenceRef.current) return;
      if (res.ok) {
        setDescription(res.description);
        setAiNote(null);
      } else {
        setAiNote(res.error);
      }
    } catch {
      if (sequence === titleRequestSequenceRef.current) {
        setAiNote("Não foi possível atualizar a descrição. Edite-a manualmente.");
      }
    } finally {
      if (sequence === titleRequestSequenceRef.current) setRegeneratingDescription(false);
    }
  }, [block, category, regenerateDescription, room]);

  const scheduleTitleDescriptionRegeneration = useCallback((nextTitle: string) => {
    if (titleEditTimerRef.current) clearTimeout(titleEditTimerRef.current);
    titleEditTimerRef.current = setTimeout(() => {
      titleEditTimerRef.current = null;
      void regenerateDescriptionFromTitle(nextTitle);
    }, 650);
  }, [regenerateDescriptionFromTitle]);

  const finishTitleEdit = useCallback((nextTitle: string) => {
    if (titleEditTimerRef.current) {
      clearTimeout(titleEditTimerRef.current);
      titleEditTimerRef.current = null;
    }
    if (titleWasEditedManuallyRef.current) {
      void regenerateDescriptionFromTitle(nextTitle);
    }
  }, [regenerateDescriptionFromTitle]);

  function stopAudioCapture() {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    } else {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }

  async function startAudioCapture() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Gravação de áudio não é suportada neste navegador.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType =
        ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"]
          .find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;

        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        audioChunksRef.current = [];
        if (blob.size === 0) {
          setAudioState("idle");
          toast.error("Não foi possível capturar o áudio.");
          return;
        }

        setAudioState("transcribing");
        try {
          const audioDataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          });
          const res = await transcribeAudio({ data: { audioDataUrl } });
          if (!res.ok) {
            toast.error(res.error);
            setAiNote(res.error);
          } else {
            const text = res.text.trim();
            if (text) {
              setDescription((current) => current.trim() ? `${current.trim()} ${text}` : text);
              setAiNote(null);
            } else {
              toast.error("Não foi possível reconhecer fala no áudio.");
            }
          }
        } catch {
          const message = "Não foi possível transcrever o áudio.";
          toast.error(message);
          setAiNote(message);
        } finally {
          setAudioState("idle");
        }
      };
      recorder.start();
      setAudioState("recording");
      setAiNote(null);
    } catch (error) {
      const permissionDenied =
        error instanceof DOMException &&
        (error.name === "NotAllowedError" || error.name === "PermissionDeniedError");
      const message = permissionDenied
        ? "Permissão do microfone negada. Libere o acesso nas configurações do navegador."
        : "Não foi possível acessar o microfone.";
      toast.error(message);
      setAiNote(message);
      setAudioState("idle");
    }
  }

  useEffect(() => {
    let active = true;
    const saved = readReporter();
    setReporterName(saved.name);
    setReporterEmail(saved.email);
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          toast.error("Não foi possível carregar os dados da sua conta.");
          return;
        }
        const user = data.session?.user;
        if (!user) return;
        const metadata = user.user_metadata as { full_name?: string; name?: string };
        setReporterName(metadata.full_name || metadata.name || saved.name);
        setReporterEmail(user.email ?? saved.email);
      })
      .catch(() => {
        if (active) toast.error("Não foi possível carregar os dados da sua conta.");
      });
    return () => {
      active = false;
    };
  }, []);

  // Badge: tickets from this device that were resolved since the reporter last looked.
  const { data: unread = 0 } = useQuery({
    queryKey: ["tracked-unread"],
    queryFn: async () => {
      const tokens = readTrackedTickets().map((t) => t.token);
      if (!tokens.length) return 0;
      const rows = await tracked({ data: { tokens } });
      const seen = new Set(readSeenResolved());
      return rows.filter((r) => r.status === "concluido" && !seen.has(r.token)).length;
    },
  });

  async function handleCapture(dataUrl: string) {
    titleWasEditedManuallyRef.current = false;
    titleRequestSequenceRef.current++;
    if (titleEditTimerRef.current) {
      clearTimeout(titleEditTimerRef.current);
      titleEditTimerRef.current = null;
    }
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
        if (!res.analysis.is_maintenance_issue)
          setAiNote("A IA não identificou um problema claro. Revise a descrição.");
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
    const floor =
      campusFloorForBlock(parsed.block ?? "") ??
      campusFloorForBlock(parsed.room) ??
      campusFloorForBlock(text);
    setBlock(floor ?? "");
    setRoom(
      floor
        ? removeCampusFloorLabel(parsed.room)
        : [parsed.block, parsed.room].filter(Boolean).join(" - "),
    );
    toast.success("Local identificado pelo QR Code");
  }, []);

  function reset() {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
    setAudioState("idle");
    titleWasEditedManuallyRef.current = false;
    titleRequestSequenceRef.current++;
    if (titleEditTimerRef.current) {
      clearTimeout(titleEditTimerRef.current);
      titleEditTimerRef.current = null;
    }
    setRegeneratingDescription(false);
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
    if (!photo) return;
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
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const res = await create({
        data: {
          imageDataUrl: photo,
          reporterName,
          reporterEmail,
          ...(sessionData.session ? { accessToken: sessionData.session.access_token } : {}),
          block,
          room,
          category,
          title,
          description,
        },
      });
      saveReporter({ name: reporterName.trim(), email: reporterEmail.trim() });
      addTrackedTicket({
        token: res.token,
        protocol: res.protocol,
        title: title || category,
        createdAt: new Date().toISOString(),
      });
      setProtocol(res.protocol);
      setSentWithEmail(!!reporterEmail.trim());
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
        <span className="font-display text-sm font-extrabold tracking-tight">Infraestrutura NEM</span>
        <nav className="flex items-center gap-1">
          <Link
            to="/admin"
            className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground hover:bg-secondary"
            aria-label="Área da equipe"
          >
            <ShieldCheck className="size-4" /> Equipe
          </Link>
          <Link
            to="/meus-chamados"
            className="relative grid size-10 place-items-center rounded-full hover:bg-secondary"
            aria-label="Meus chamados"
          >
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
            {aiNote && (
              <p className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">
                {aiNote}
              </p>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="reporter-name">
                  Seu nome <span className="font-normal text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="reporter-name"
                  value={reporterName}
                  onChange={(e) => setReporterName(e.target.value)}
                  placeholder="Pode deixar em branco"
                  autoComplete="name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reporter-email">
                  E-mail <span className="font-normal text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="reporter-email"
                  type="email"
                  value={reporterEmail}
                  onChange={(e) => setReporterEmail(e.target.value)}
                  placeholder="Para receber o aviso de resolução"
                  autoComplete="email"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Quer salvar seus dados e acompanhar chamados em outros aparelhos?{" "}
              <Link
                to="/conta"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Crie sua conta
              </Link>
              . O login é opcional.
            </p>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Localização</Label>
                <button
                  type="button"
                  onClick={() => setQrOpen(true)}
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary"
                >
                  <QrCode className="size-4" /> Ler QR Code
                </button>
              </div>
              <div className="grid grid-cols-[1fr_1.2fr] gap-2">
                <Select
                  value={block}
                  onValueChange={(value) => {
                    const floor = CAMPUS_FLOORS.find((candidate) => candidate === value);
                    if (floor) setBlock(floor);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Andar" />
                  </SelectTrigger>
                  <SelectContent className="dark">
                    {CAMPUS_FLOORS.map((floor) => (
                      <SelectItem key={floor} value={floor}>
                        {floor}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  list="room-options"
                  placeholder={
                    block && roomsOfFloor(block).length
                      ? "Escolha ou digite a sala"
                      : "Sala 05, Banheiro…"
                  }
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                />
                <datalist id="room-options">
                  {(block ? roomsOfFloor(block) : []).map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
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
                <Input
                  value={title}
                  onChange={(e) => {
                    const nextTitle = e.target.value;
                    titleWasEditedManuallyRef.current = true;
                    setTitle(nextTitle);
                    scheduleTitleDescriptionRegeneration(nextTitle);
                  }}
                  onBlur={(e) => finishTitleEdit(e.target.value)}
                  placeholder={analyzing ? "Gerando…" : "Ex.: Maçaneta danificada"}
                  disabled={analyzing}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <Label className="flex items-center gap-1.5">
                  Descrição do problema <AiTag loading={analyzing || regeneratingDescription} />
                </Label>
                {audioState === "recording" ? (
                  <button
                    type="button"
                    onClick={stopAudioCapture}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-destructive px-3 text-sm font-medium text-destructive-foreground"
                  >
                    <Square className="size-3.5 fill-current" /> Parar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void startAudioCapture()}
                    disabled={analyzing || audioState === "transcribing"}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-sm font-medium text-primary disabled:opacity-50"
                  >
                    {audioState === "transcribing" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Mic className="size-4" />
                    )}
                    {audioState === "transcribing" ? "Transcrevendo…" : "Falar"}
                  </button>
                )}
              </div>
              <Textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={
                  analyzing ? "A IA está descrevendo o problema…" : "Descreva o que aconteceu"
                }
                disabled={analyzing}
              />
              <p className="text-xs text-muted-foreground">Sugestão da IA — edite à vontade.</p>
            </div>
          </div>

          <div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-background via-background to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6">
            <Button
              type="submit"
              size="lg"
              className="h-14 w-full rounded-2xl text-base font-semibold"
              disabled={submitting || analyzing || audioState !== "idle"}
            >
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
            A equipe de manutenção já recebeu seu chamado. Acompanhe o andamento em "Meus chamados"
            neste aparelho
            {sentWithEmail ? " — e avisaremos no seu e-mail quando for resolvido." : "."}
          </p>
          {protocol && (
            <p className="font-mono text-sm text-muted-foreground">Protocolo #{protocol}</p>
          )}
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
      {loading ? <Loader2 className="size-2.5 animate-spin" /> : <Sparkles className="size-2.5" />}{" "}
      IA
    </span>
  );
}
