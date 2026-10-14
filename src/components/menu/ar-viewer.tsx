"use client";

import { useEffect, useRef, useState } from "react";
import { Cuboid, Info, Smartphone } from "lucide-react";
import { toast } from "sonner";
import type { ModelViewerElement } from "@/types/model-viewer";
import { Spinner } from "@/components/ui/misc";
import { asset } from "@/lib/asset";

interface Props {
  glb: string;
  usdz?: string | null;
  alt: string;
  poster?: string | null;
  illustrative?: boolean;
  className?: string;
}

/**
 * Visualização 3D interativa + realidade aumentada real:
 *  - Android: WebXR (Chrome) ou Scene Viewer (Google ARCore)
 *  - iOS: AR Quick Look (arquivo USDZ)
 *  - Demais: visualização 3D com rotação/zoom (alternativa sem AR)
 * ar-scale="fixed" mantém a escala real do modelo (modelado em metros).
 */
export function ArViewer({ glb, usdz, alt, poster, illustrative = true, className }: Props) {
  const ref = useRef<ModelViewerElement | null>(null);
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [arSupported, setArSupported] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("@google/model-viewer").then(() => !cancelled && setReady(true));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || !ready) return;
    const onLoad = () => {
      setLoaded(true);
      setArSupported(Boolean(el.canActivateAR));
    };
    const onStatus = (e: Event) => {
      const status = (e as CustomEvent<{ status: string }>).detail?.status;
      if (status === "failed") toast.error("Não foi possível iniciar a realidade aumentada neste aparelho. Use a visualização 3D.");
    };
    const onError = () => {
      setFailed(true);
      toast.error("Não foi possível carregar o modelo 3D.");
    };
    el.addEventListener("load", onLoad);
    el.addEventListener("ar-status", onStatus);
    el.addEventListener("error", onError);
    return () => {
      el.removeEventListener("load", onLoad);
      el.removeEventListener("ar-status", onStatus);
      el.removeEventListener("error", onError);
    };
  }, [ready]);

  return (
    <div className={className}>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-gradient-to-b from-[#3a2a20] to-[#15100c]">
        {ready && (
          <model-viewer
            ref={ref as React.Ref<HTMLElement>}
            src={asset(glb)}
            ios-src={asset(usdz) ?? undefined}
            alt={alt}
            poster={asset(poster) ?? undefined}
            ar=""
            ar-modes="webxr scene-viewer quick-look"
            ar-scale="fixed"
            ar-placement="floor"
            camera-controls=""
            auto-rotate=""
            touch-action="pan-y"
            shadow-intensity="1"
            shadow-softness="0.8"
            exposure="0.95"
            environment-image="neutral"
            camera-orbit="25deg 60deg auto"
            interaction-prompt="auto"
            style={{ width: "100%", height: "100%", background: "transparent" }}
          >
            <button
              slot="ar-button"
              className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-lg animate-pulse-ring"
            >
              <Smartphone className="size-4" /> Visualizar na minha mesa
            </button>
          </model-viewer>
        )}
        {failed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-white/85">
            <Info className="size-6" /> Não foi possível carregar o modelo 3D deste prato. Veja a foto ou tente novamente mais tarde.
          </div>
        )}
        {!loaded && !failed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-white/80">
            <Spinner className="size-6" /> Carregando modelo 3D…
          </div>
        )}
        <span className="pointer-events-none absolute left-3 top-3 flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-xs text-white">
          <Cuboid className="size-3.5" /> Gire e amplie com os dedos
        </span>
      </div>
      {loaded && arSupported === false && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          Este aparelho ou navegador não oferece realidade aumentada. Você pode girar e ampliar o prato em 3D acima.
          No Android use o Chrome com ARCore; no iPhone, o Safari (iOS 12+).
        </p>
      )}
      {loaded && arSupported && (
        <p className="mt-2 text-xs text-muted-foreground">
          Toque em “Visualizar na minha mesa”, aponte a câmera para a mesa e mova o celular devagar até o prato aparecer.
        </p>
      )}
      {illustrative && (
        <p className="mt-1 text-[11px] italic text-muted-foreground">
          Modelo 3D ilustrativo em escala aproximada. A apresentação real do prato pode variar.
        </p>
      )}
    </div>
  );
}
