import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Props = { open: boolean; onOpenChange: (open: boolean) => void; onResult: (text: string) => void };

/** Reads the room QR code (works on Android Chrome and iOS Safari via jsQR). */
export function QrScannerDialog({ open, onOpenChange, onResult }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    setError(null);

    const tick = () => {
      if (stopped) return;
      const video = videoRef.current;
      if (video && ctx && video.readyState === video.HAVE_ENOUGH_DATA) {
        const w = 480;
        const h = Math.round((video.videoHeight / video.videoWidth) * w) || 360;
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(video, 0, 0, w, h);
        const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
        if (code?.data) {
          onResult(code.data);
          onOpenChange(false);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then(async (s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play().catch(() => undefined);
        }
        raf = requestAnimationFrame(tick);
      })
      .catch(() => setError("Não foi possível abrir a câmera para ler o QR Code."));

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, onOpenChange, onResult]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dark bg-background text-foreground">
        <DialogHeader>
          <DialogTitle>Ler QR Code do local</DialogTitle>
          <DialogDescription>Aponte para a placa com QR Code na porta da sala.</DialogDescription>
        </DialogHeader>
        <div className="relative aspect-square overflow-hidden rounded-lg bg-card">
          <video ref={videoRef} playsInline muted className="size-full object-cover" />
          <div className="viewfinder pointer-events-none absolute inset-10" />
          {error && <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
