import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { ScanLine, Loader2, CameraOff, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BarcodeScanButtonProps {
  onScan: (code: string) => void;
  className?: string;
  size?: 'sm' | 'default' | 'icon';
  label?: string;
  /** Keep the camera open after a successful scan (continuous mode) */
  continuous?: boolean;
}

/**
 * Reusable camera barcode scanner.
 *
 * Detection 100% pur JavaScript via ZXing (@zxing/browser + @zxing/library).
 * On bannit deliberement `window.BarcodeDetector` (MLKit) : sur les terminaux
 * durcis Sunmi (Android 12 / AOSP sans services Google Play complets), son
 * moteur C++ natif appelle une couche MLKit absente, ce qui provoque un
 * dereferencement memoire natif (SIGSEGV) : le processus WebView est tue
 * immediatement, sans qu'aucun try/catch JavaScript ne puisse l'intercepter.
 * ZXing s'execute entierement en memoire JS/Wasm securisee, sans binaire natif.
 */
export function BarcodeScanButton({
  onScan,
  className,
  size = 'icon',
  label,
  continuous = false,
}: BarcodeScanButtonProps) {
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCode, setLastCode] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const zxingControlsRef = useRef<{ stop: () => void } | null>(null);
  const stoppedRef = useRef(false);
  const lastValueRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });

  const stopAll = useCallback(() => {
    stoppedRef.current = true;
    // 1. Arreter le lecteur ZXing
    try { zxingControlsRef.current?.stop(); } catch { /* ignore */ }
    zxingControlsRef.current = null;

    // 2. Stopper toutes les pistes du flux et detacher la video
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try { track.stop(); } catch { /* ignore */ }
      });
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const handleResult = useCallback((raw: string) => {
    const code = raw.trim();
    if (!code) return;
    const now = Date.now();
    // Deboublonnage des lectures identiques et rapprochees
    if (lastValueRef.current.code === code && now - lastValueRef.current.at < 1500) return;
    lastValueRef.current = { code, at: now };

    setLastCode(code);
    try { navigator.vibrate?.(60); } catch { /* ignore */ }
    onScan(code);

    if (!continuous) {
      stopAll();
      setOpen(false);
    }
  }, [continuous, onScan, stopAll]);

  const start = useCallback(async () => {
    setError(null);
    setStarting(true);
    stoppedRef.current = false;

    try {
      // 1. Acquisition du flux avec fallback de resolution (pilotes sensibles)
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280, max: 1280 },
            height: { ideal: 720, max: 720 },
            frameRate: { ideal: 30, max: 30 },
          },
          audio: false,
        });
      } catch {
        // Fallback contraintes minimales (Sunmi/AOSP : HAL fragiles > 720p)
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
      }

      if (stoppedRef.current) {
        stream.getTracks().forEach((t) => { try { t.stop(); } catch { /* ignore */ } });
        return;
      }
      streamRef.current = stream;
      // Mise au point continue : garder le capteur Sunmi net, sinon le flux
      // se floute et la lecture ralentit. focusMode n'etant pas expose par le
      // type DOM (MediaTrackConstraints), on le transmet via un cast.
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        try {
          await videoTrack.applyConstraints({ focusMode: 'continuous' } as MediaTrackConstraints);
        } catch {
          /* pilote Sunmi sans support du mode continu : on ignore */
        }
      }

      const video = videoRef.current;
      if (!video) return;

      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      await new Promise<void>((resolve) => {
        if (video.readyState >= 1) resolve();
        else video.addEventListener('loadedmetadata', () => resolve(), { once: true });
      });
      await video.play();

      // 2. Detection 100% ZXing (pur JS/Wasm) - jamais de BarcodeDetector
      const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([
        import('@zxing/browser'),
        import('@zxing/library'),
      ]);

      if (stoppedRef.current) return;

      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.CODE_128, BarcodeFormat.EAN_13,
        BarcodeFormat.CODE_39, BarcodeFormat.QR_CODE,
        BarcodeFormat.ITF,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, false);

      const reader = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: 40,
        delayBetweenScanSuccess: 500,
      });

      const controls = await reader.decodeFromVideoElement(video, (result) => {
        if (result && !stoppedRef.current) handleResult(result.getText());
      });
      zxingControlsRef.current = controls as any;
    } catch (e: any) {
      console.error('[BarcodeScan] Erreur demarrage camera:', e);
      const msg = e?.name === 'NotAllowedError'
        ? "Acces a la camera refuse. Veuillez autoriser la camera dans les parametres de l'application."
        : e?.name === 'NotFoundError'
          ? 'Aucune camera detectee sur cet appareil.'
          : "Impossible d'acceder a la camera.";
      setError(msg);
    } finally {
      setStarting(false);
    }
  }, [handleResult]);

  useEffect(() => {
    if (open) {
      setLastCode(null);
      lastValueRef.current = { code: '', at: 0 };
      void start();
    } else {
      stopAll();
    }
    return () => { stopAll(); };
  }, [open, start, stopAll]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={size}
        className={cn(size === 'icon' && 'shrink-0', className)}
        onClick={() => setOpen(true)}
        title="Scanner avec la camera"
      >
        <ScanLine className={cn('w-4 h-4', label && 'mr-1.5')} />
        {label}
      </Button>

      <Dialog open={open} onOpenChange={(o) => { if (!o) { stopAll(); } setOpen(o); }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanLine className="w-5 h-5 text-primary" />
              Scanner un code-barres
            </DialogTitle>
            <DialogDescription>
              Placez le code-barres dans le cadre. La lecture est automatique.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3]">
              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
              {/* Cadre de visee */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-[80%] h-[40%] border-2 border-primary/80 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
              </div>
              {starting && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                  <Loader2 className="w-8 h-8 animate-spin text-white" />
                </div>
              )}
              {error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 text-white p-4 text-center">
                  <CameraOff className="w-8 h-8" />
                  <p className="text-sm">{error}</p>
                  <Button size="sm" variant="secondary" onClick={() => void start()}>
                    <RefreshCw className="w-4 h-4 mr-1.5" /> Réessayer
                  </Button>
                </div>
              )}
            </div>

            {continuous && lastCode && (
              <p className="text-xs text-center text-muted-foreground">
                Dernier code : <span className="font-mono text-foreground">{lastCode}</span>
              </p>
            )}

            <Button variant="outline" className="w-full" onClick={() => { stopAll(); setOpen(false); }}>
              {continuous ? 'Terminer' : 'Annuler'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default BarcodeScanButton;
