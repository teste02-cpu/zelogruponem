import { useEffect, useRef, useState } from "react";
import { Camera, ImageUp, RefreshCw } from "lucide-react";

import { drawToJpeg, fileToJpeg } from "@/lib/image";

type Props = { onCapture: (dataUrl: string) => void };

/** Opens the rear camera immediately (WebRTC) with an HTML Media Capture fallback. */
export function CameraView({ onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"starting" | "live" | "unavailable">("starting");
  const [flash, setFlash] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      setState("starting");
      if (!navigator.mediaDevices?.getUserMedia) {
        setState("unavailable");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setState("live");
      } catch {
        if (!cancelled) setState("unavailable");
      }
    }
    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [attempt]);

  function shoot() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
    onCapture(drawToJpeg(video, video.videoWidth, video.videoHeight));
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onCapture(await fileToJpeg(file));
  }

  return (
    <div className="relative flex h-full flex-col">
      <div className="relative flex-1 overflow-hidden bg-card [container-type:size]">
        <video ref={videoRef} playsInline muted className="absolute inset-0 size-full object-cover" />
        {state !== "live" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
            <Camera className="size-10 text-primary" />
            {state === "starting" ? (
              <p className="text-muted-foreground">Abrindo a câmera…</p>
            ) : (
              <>
                <p className="text-lg font-semibold">Não foi possível abrir a câmera aqui</p>
                <p className="text-sm text-muted-foreground">
                  Permita o acesso à câmera no navegador ou toque abaixo para usar a câmera do celular.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => captureRef.current?.click()}
                    className="rounded-full bg-primary px-5 py-2.5 font-medium text-primary-foreground"
                  >
                    Tirar foto
                  </button>
                  <button
                    type="button"
                    onClick={() => setAttempt((n) => n + 1)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2.5 text-sm"
                  >
                    <RefreshCw className="size-4" /> Tentar de novo
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        {state === "live" && (
          <>
            <div className="viewfinder pointer-events-none absolute inset-8 rounded-sm" />
            <p className="pointer-events-none absolute inset-x-0 top-6 text-center text-sm font-medium text-foreground/90 drop-shadow">
              Enquadre o problema
            </p>
          </>
        )}
        {flash && <div className="absolute inset-0 bg-foreground/80" />}
      </div>

      <div className="flex items-center justify-around bg-background px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="grid size-12 place-items-center rounded-full bg-secondary text-secondary-foreground"
          aria-label="Escolher da galeria"
        >
          <ImageUp className="size-5" />
        </button>
        <button
          type="button"
          onClick={state === "live" ? shoot : () => captureRef.current?.click()}
          className="grid size-20 place-items-center rounded-full border-4 border-foreground/90 animate-pulse-ring"
          aria-label="Tirar foto"
        >
          <span className="size-[60px] rounded-full bg-primary transition-transform active:scale-90" />
        </button>
        <span className="size-12" />
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      <input ref={captureRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
    </div>
  );
}
