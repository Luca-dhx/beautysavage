// C2 — Scanner QR de présence (html5-qrcode, open-source, aucun service externe). Caméra arrière,
// import dynamique (n'embarque la lib que si le scanner est ouvert). Émet le texte décodé.
import { useEffect, useRef, useState } from 'react';

const REGION_ID = 'lrn-qr-region';

export function QrScanner({ onDecode, onClose }: { onDecode: (text: string) => void; onClose: () => void }) {
  const startedRef = useRef(false);
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let lastText = '';
    async function start() {
      if (startedRef.current) return;
      startedRef.current = true;
      try {
        const mod = await import('html5-qrcode');
        if (cancelled) return;
        const Html5Qrcode = mod.Html5Qrcode;
        const instance = new Html5Qrcode(REGION_ID, { verbose: false });
        scannerRef.current = instance as unknown as { stop: () => Promise<void>; clear: () => void };
        await instance.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decodedText: string) => {
            // Anti-rebond : ignore les décodages répétés du même code.
            if (decodedText && decodedText !== lastText) {
              lastText = decodedText;
              onDecode(decodedText);
            }
          },
          () => { /* scan miss — ignoré */ },
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Caméra indisponible.");
      }
    }
    void start();
    return () => {
      cancelled = true;
      const s = scannerRef.current;
      if (s) {
        s.stop().then(() => s.clear()).catch(() => { /* déjà arrêté */ });
      }
    };
  }, [onDecode]);

  return (
    <div className="lrn-scanner">
      <div className="lrn-scanner__head">
        <span className="lrn-scanner__title"><i className="bi bi-qr-code-scan" aria-hidden="true" /> Scanner une présence</span>
        <button type="button" className="cat-iconbtn" aria-label="Fermer le scanner" onClick={onClose}><i className="bi bi-x-lg" aria-hidden="true" /></button>
      </div>
      <div id={REGION_ID} className="lrn-scanner__region" />
      {error ? <p className="cat-note cat-note--error" role="alert">{error}</p> : <p className="cat-note">Pointez la caméra sur le QR du participant.</p>}
    </div>
  );
}
