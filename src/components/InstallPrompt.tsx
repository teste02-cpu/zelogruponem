import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "zelo-install-dismissed";

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
}

/**
 * On first use, offers to install a Zelo shortcut (home screen / desktop).
 * Browsers never allow silent installs, so this asks the user once.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [mode, setMode] = useState<"hidden" | "native" | "ios">("hidden");

  useEffect(() => {
    if (isStandalone() || localStorage.getItem(DISMISS_KEY)) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setMode("native");
    };
    const onInstalled = () => {
      localStorage.setItem(DISMISS_KEY, "installed");
      setMode("hidden");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    let timer: ReturnType<typeof setTimeout> | undefined;
    if (isIos()) timer = setTimeout(() => setMode("ios"), 1500);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      if (timer) clearTimeout(timer);
    };
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "dismissed");
    setMode("hidden");
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    localStorage.setItem(DISMISS_KEY, outcome);
    setDeferred(null);
    setMode("hidden");
  }

  if (mode === "hidden") return null;

  return (
    <div className="fixed inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 mx-auto max-w-md rounded-xl border border-border bg-card p-4 text-card-foreground shadow-lg">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Fechar"
        className="absolute right-2 top-2 rounded-full p-1.5 text-muted-foreground hover:bg-muted"
      >
        <X className="size-4" />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <img src="/icon-192.png" alt="" className="size-11 shrink-0 rounded-lg" />
        <div className="space-y-1">
          <p className="font-semibold">Instalar o Zelo</p>
          {mode === "native" ? (
            <p className="text-sm text-muted-foreground">
              Crie um atalho na tela inicial ou na área de trabalho para abrir direto na câmera.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Toque em <Share className="inline size-4 align-text-bottom" /> <strong>Compartilhar</strong> e depois
              em <strong>Adicionar à Tela de Início</strong>.
            </p>
          )}
        </div>
      </div>
      {mode === "native" && (
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={dismiss} className="rounded-full px-4 py-2 text-sm text-muted-foreground">
            Agora não
          </button>
          <button
            type="button"
            onClick={install}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            <Download className="size-4" /> Instalar atalho
          </button>
        </div>
      )}
    </div>
  );
}
