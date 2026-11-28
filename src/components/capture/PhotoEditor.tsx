import { useEffect, useRef, useState } from "react";
import { Check, Crop, RotateCcw, RotateCw, Undo2, X } from "lucide-react";

import {
  PHOTO_EDITOR_HEIGHT,
  PHOTO_EDITOR_MAX_BYTES,
  PHOTO_EDITOR_MAX_SIDE,
  PHOTO_EDITOR_WIDTH,
  photoCoverScale,
  photoOutputDimensions,
  type PhotoRotation,
} from "@/lib/photo-editor";

type Point = { x: number; y: number };
type EditorTransform = { rotation: PhotoRotation; zoom: number; pan: Point };

type Props = {
  original: string;
  onCancel: () => void;
  onConfirm: (photo: Blob) => Promise<void>;
};

const INITIAL_TRANSFORM: EditorTransform = {
  rotation: 0,
  zoom: 1,
  pan: { x: 0, y: 0 },
};

function clampPan(
  pan: Point,
  image: HTMLImageElement,
  transform: EditorTransform,
  width: number,
  height: number,
): Point {
  const scale = photoCoverScale(
    image.naturalWidth,
    image.naturalHeight,
    transform.rotation,
    width,
    height,
    transform.zoom,
  );
  const rotatedWidth =
    transform.rotation === 90 || transform.rotation === 270
      ? image.naturalHeight
      : image.naturalWidth;
  const rotatedHeight =
    transform.rotation === 90 || transform.rotation === 270
      ? image.naturalWidth
      : image.naturalHeight;
  return {
    x: Math.max(
      -Math.max(0, rotatedWidth * scale - width) / 2,
      Math.min(Math.max(0, rotatedWidth * scale - width) / 2, pan.x),
    ),
    y: Math.max(
      -Math.max(0, rotatedHeight * scale - height) / 2,
      Math.min(Math.max(0, rotatedHeight * scale - height) / 2, pan.y),
    ),
  };
}

function drawPhoto(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
  transform: EditorTransform,
  paths: Point[][],
) {
  context.fillStyle = "#111";
  context.fillRect(0, 0, width, height);
  const scale = photoCoverScale(
    image.naturalWidth,
    image.naturalHeight,
    transform.rotation,
    width,
    height,
    transform.zoom,
  );

  context.save();
  context.translate(
    width / 2 + (transform.pan.x / PHOTO_EDITOR_WIDTH) * width,
    height / 2 + (transform.pan.y / PHOTO_EDITOR_HEIGHT) * height,
  );
  context.rotate((transform.rotation * Math.PI) / 180);
  context.scale(scale, scale);
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  context.restore();

  context.save();
  context.strokeStyle = "#facc15";
  context.lineWidth = Math.max(4, (width / PHOTO_EDITOR_WIDTH) * 6);
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const path of paths) {
    const first = path[0];
    if (!first) continue;
    context.beginPath();
    context.moveTo(
      (first.x / PHOTO_EDITOR_WIDTH) * width,
      (first.y / PHOTO_EDITOR_HEIGHT) * height,
    );
    for (const point of path.slice(1)) {
      context.lineTo(
        (point.x / PHOTO_EDITOR_WIDTH) * width,
        (point.y / PHOTO_EDITOR_HEIGHT) * height,
      );
    }
    context.stroke();
  }
  context.restore();
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("NÃ£o foi possÃ­vel processar a foto."))),
      "image/jpeg",
      quality,
    );
  });
}

async function encodePhoto(
  image: HTMLImageElement,
  transform: EditorTransform,
  paths: Point[][],
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas indisponÃ­vel.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  for (let maxSide = PHOTO_EDITOR_MAX_SIDE; maxSide >= 640; maxSide = Math.floor(maxSide * 0.85)) {
    const { width, height } = photoOutputDimensions(maxSide);
    canvas.width = width;
    canvas.height = height;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    drawPhoto(context, image, width, height, transform, paths);
    for (const quality of [0.84, 0.76, 0.68, 0.6, 0.52, 0.44]) {
      const blob = await canvasToBlob(canvas, quality);
      if (blob.size <= PHOTO_EDITOR_MAX_BYTES) return blob;
    }
  }
  throw new Error("NÃ£o foi possÃ­vel reduzir a foto ao limite de tamanho.");
}

export function PhotoEditor({ original, onCancel, onConfirm }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const pointerRef = useRef<{ id: number; start: Point; pan: Point } | null>(null);
  const [transform, setTransform] = useState(INITIAL_TRANSFORM);
  const [paths, setPaths] = useState<Point[][]>([]);
  const [drawing, setDrawing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setImageReady(false);
    setErrorMessage(null);
    const image = new Image();
    image.onload = () => {
      if (active) {
        imageRef.current = image;
        setImageReady(true);
      }
    };
    image.onerror = () => {
      if (active) {
        imageRef.current = null;
        setErrorMessage("NÃ£o foi possÃ­vel abrir esta foto para ediÃ§Ã£o.");
      }
    };
    image.src = original;
    return () => {
      active = false;
    };
  }, [original]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context && image?.complete && image.naturalWidth > 0) {
      drawPhoto(context, image, PHOTO_EDITOR_WIDTH, PHOTO_EDITOR_HEIGHT, transform, paths);
    }
  }, [imageReady, original, paths, transform]);

  function pointFromEvent(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * PHOTO_EDITOR_WIDTH,
      y: ((event.clientY - bounds.top) / bounds.height) * PHOTO_EDITOR_HEIGHT,
    };
  }

  function pointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    pointerRef.current = { id: event.pointerId, start: point, pan: transform.pan };
    if (drawing) setPaths((current) => [...current, [point]]);
  }

  function pointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const point = pointFromEvent(event);
    if (drawing) {
      setPaths((current) => {
        const next = current.slice();
        const path = next[next.length - 1];
        if (path) next[next.length - 1] = [...path, point];
        return next;
      });
    } else {
      const image = imageRef.current;
      if (!image) return;
      setTransform((current) => ({
        ...current,
        pan: clampPan(
          {
            x: pointer.pan.x + point.x - pointer.start.x,
            y: pointer.pan.y + point.y - pointer.start.y,
          },
          image,
          current,
          PHOTO_EDITOR_WIDTH,
          PHOTO_EDITOR_HEIGHT,
        ),
      }));
    }
  }

  function pointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    if (pointerRef.current?.id === event.pointerId) pointerRef.current = null;
  }

  function rotate(amount: 90 | -90) {
    setTransform((current) => ({
      ...current,
      rotation: ((current.rotation + amount + 360) % 360) as PhotoRotation,
      pan: { x: 0, y: 0 },
    }));
  }

  async function confirm() {
    const image = imageRef.current;
    if (!image || !image.naturalWidth) return;
    setSaving(true);
    setErrorMessage(null);
    try {
      await onConfirm(await encodePhoto(image, transform, paths));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "NÃ£o foi possÃ­vel salvar a foto editada.",
      );
    } finally {
      setSaving(false);
    }
  }

  const reset = () => {
    setTransform(INITIAL_TRANSFORM);
    setPaths([]);
    setDrawing(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="photo-editor-title"
    >
      <header className="mx-auto flex w-full max-w-xl items-center justify-between pb-3">
        <h2 id="photo-editor-title" className="text-lg font-semibold">
          Editar foto
        </h2>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="grid size-10 place-items-center rounded-full hover:bg-secondary"
          aria-label="Cancelar edição"
        >
          <X className="size-5" />
        </button>
      </header>

      <div className="mx-auto w-full max-w-xl">
        <div className="overflow-hidden rounded-xl bg-black">
          <canvas
            ref={canvasRef}
            width={PHOTO_EDITOR_WIDTH}
            height={PHOTO_EDITOR_HEIGHT}
            className={`block aspect-[4/3] w-full touch-none ${drawing ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={pointerUp}
          />
        </div>
        {!imageReady && !errorMessage && (
          <p role="status" className="mt-2 text-center text-sm text-muted-foreground">
            Carregando foto…
          </p>
        )}
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Arraste a foto para ajustar o corte 4:3; use o zoom para aproximar.
        </p>
        {errorMessage && (
          <p
            role="alert"
            className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {errorMessage}
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => rotate(-90)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border"
          >
            <RotateCcw className="size-4" /> Girar à esquerda
          </button>
          <button
            type="button"
            onClick={() => rotate(90)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border"
          >
            <RotateCw className="size-4" /> Girar à direita
          </button>
        </div>

        <label className="mt-4 flex items-center gap-3 text-sm">
          <Crop className="size-4 shrink-0" />
          <span className="shrink-0">Zoom</span>
          <input
            aria-label="Zoom da foto"
            type="range"
            min="1"
            max="3"
            step="0.05"
            value={transform.zoom}
            onChange={(event) => {
              const image = imageRef.current;
              if (!image) return;
              const zoom = Number(event.target.value);
              setTransform((current) => ({
                ...current,
                zoom,
                pan: clampPan(
                  current.pan,
                  image,
                  { ...current, zoom },
                  PHOTO_EDITOR_WIDTH,
                  PHOTO_EDITOR_HEIGHT,
                ),
              }));
            }}
            className="min-w-0 flex-1 accent-primary"
          />
          <span className="w-10 text-right tabular-nums">{transform.zoom.toFixed(1)}×</span>
        </label>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setDrawing((enabled) => !enabled)}
            aria-pressed={drawing}
            className={`min-h-11 flex-1 rounded-lg border border-border px-3 text-sm ${drawing ? "bg-primary text-primary-foreground" : ""}`}
          >
            {drawing ? "Desenhe na foto" : "Desenhar / anotar"}
          </button>
          <button
            type="button"
            onClick={() => setPaths((current) => current.slice(0, -1))}
            disabled={!paths.length}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm disabled:opacity-40"
          >
            <Undo2 className="size-4" /> Desfazer
          </button>
          <button
            type="button"
            onClick={reset}
            className="min-h-11 rounded-lg px-3 text-sm text-muted-foreground hover:bg-secondary"
          >
            Restaurar original
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="min-h-12 rounded-lg border border-border font-medium"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={saving || !imageReady}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Check className="size-4" /> {saving ? "Salvando…" : "Usar foto editada"}
          </button>
        </div>
      </div>
    </div>
  );
}
