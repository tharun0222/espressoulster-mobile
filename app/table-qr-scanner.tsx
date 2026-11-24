'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Check, RotateCcw, X } from 'lucide-react';
import { createTableScanGate, espressoMotion, scannerWords, tableCameraCrop, type ScanNotice } from '../lib/table-scanner';
import TableScannerReaction from './table-scanner-reaction';
import './table-qr-scanner.css';

type Props = {
  onVerifyTable: (table: string, signal: AbortSignal) => Promise<void>;
  onOpenTable: (table: string) => void;
  onClose: () => void;
  /** Used only by the isolated preview; the customer app always uses the device camera. */
  cameraProvider?: () => Promise<MediaStream>;
};

export default function TableQrScanner(props: Props) {
  return <TableQrScannerSession key={espressoMotion.source} {...props} />;
}

function TableQrScannerSession({ onVerifyTable, onOpenTable, onClose, cameraProvider }: Props) {
  const camera = useRef<HTMLVideoElement>(null), assistant = useRef<HTMLVideoElement>(null);
  const screen = useRef<HTMLElement>(null);
  const finder = useRef<HTMLDivElement>(null), closeButton = useRef<HTMLButtonElement>(null);
  const stream = useRef<MediaStream | null>(null), scanFrame = useRef(0), cameraGeneration = useRef(0);
  const holdingAssistant = useRef(false), assistantFade = useRef<Animation | null>(null);
  const skippedIntro = useRef(false);
  const closing = useRef(false);
  const ready = useRef(false), lastCode = useRef(''), callbacks = useRef({onVerifyTable, onOpenTable, cameraProvider});
  const gate = useRef<ReturnType<typeof createTableScanGate> | null>(null);
  const [arrived, setArrived] = useState(false), [cameraReady, setCameraReady] = useState(false);
  const [notice, setNotice] = useState<ScanNotice>('guide'), [table, setTable] = useState('');
  const [introStep, setIntroStep] = useState(0), [orderHint, setOrderHint] = useState(false);
  const [needsTap, setNeedsTap] = useState(false), [assetError, setAssetError] = useState(false);
  const [suspended, setSuspended] = useState(false);

  useEffect(() => { callbacks.current = {onVerifyTable, onOpenTable, cameraProvider}; }, [onVerifyTable, onOpenTable, cameraProvider]);

  const releaseCamera = useCallback(() => {
    cameraGeneration.current++;
    cancelAnimationFrame(scanFrame.current);
    gate.current?.cancel();
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (camera.current) camera.current.srcObject = null;
    lastCode.current = '';
  }, []);

  const shutDown = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    ready.current = false;
    // Hide every video before pausing or removing its source. Android WebView
    // can briefly draw its own playback overlay as a video loses its source.
    if (screen.current) screen.current.dataset.closing = 'true';
    gate.current?.close();
    releaseCamera();
    assistantFade.current?.cancel();
    screen.current?.querySelectorAll('video').forEach(video => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    });
  }, [releaseCamera]);

  const startCamera = useCallback(async () => {
    if (!ready.current || document.hidden) return;
    releaseCamera();
    const id = cameraGeneration.current;
    setCameraReady(false); setNotice('opening'); setTable(''); setSuspended(false);
    try {
      if (!callbacks.current.cameraProvider && !navigator.mediaDevices?.getUserMedia) throw Error('Camera unavailable');
      const {default: jsQR} = await import('jsqr');
      if (id !== cameraGeneration.current || document.hidden) return;
      const media = callbacks.current.cameraProvider
        ? await callbacks.current.cameraProvider()
        : await navigator.mediaDevices.getUserMedia({video: {facingMode: {ideal: 'environment'}, width: {ideal: 1280}, height: {ideal: 720}}, audio: false});
      if (id !== cameraGeneration.current || !camera.current || document.hidden) {
        media.getTracks().forEach(track => track.stop()); return;
      }
      stream.current = media;
      camera.current.srcObject = media;
      await camera.current.play();
      if (id !== cameraGeneration.current) return;
      const canvas = document.createElement('canvas'), context = canvas.getContext('2d', {willReadFrequently: true});
      if (!context) throw Error('Camera unavailable');
      const source = camera.current, reader = context;
      let lastScan = 0;
      setCameraReady(true); setNotice('guide');
      function scan(time: number) {
        if (id !== cameraGeneration.current) return;
        try {
          if (!gate.current?.isBusy() && source.readyState >= 2 && source.videoWidth && source.videoHeight && time - lastScan > 180) {
            lastScan = time;
            const crop = tableCameraCrop(source.videoWidth, source.videoHeight);
            if (canvas.width !== crop.output || canvas.height !== crop.output) canvas.width = canvas.height = crop.output;
            reader.drawImage(source, crop.x, crop.y, crop.side, crop.side, 0, 0, crop.output, crop.output);
            const image = reader.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(image.data, image.width, image.height, {inversionAttempts: 'attemptBoth'});
            if (!code) lastCode.current = '';
            if (code && code.data !== lastCode.current) {
              lastCode.current = code.data;
              void gate.current?.scan(code.data);
            }
          }
          scanFrame.current = requestAnimationFrame(scan);
        } catch {
          releaseCamera(); setCameraReady(false); setNotice('camera');
        }
      }
      scanFrame.current = requestAnimationFrame(scan);
    } catch (error) {
      if (id !== cameraGeneration.current) return;
      releaseCamera(); setCameraReady(false);
      setNotice(error instanceof Error && error.name === 'NotAllowedError' ? 'permission' : 'camera');
    }
  }, [releaseCamera]);

  const arrive = useCallback(() => {
    if (ready.current || !gate.current?.activate()) return;
    ready.current = true;
    setArrived(true); setIntroStep(2);
    void startCamera();
  }, [startCamera]);

  const assistantProgress = useCallback((mediaTime?: number) => {
    if (skippedIntro.current) return;
    const time = mediaTime ?? assistant.current?.currentTime ?? 0;
    if (!ready.current) {
      setIntroStep(time >= espressoMotion.returnAt ? 2 : time >= espressoMotion.introduceAt ? 1 : 0);
      if (time >= espressoMotion.readyAt) arrive();
    }
    setOrderHint(time >= espressoMotion.orderHintAt);
  }, [arrive]);

  // Follow presented video frames, so text cues pause and resume with the man.
  useEffect(() => {
    const video = assistant.current;
    if (!video?.requestVideoFrameCallback) return;
    let frame = 0, cancelled = false;
    const update = (_now: number, metadata: VideoFrameCallbackMetadata) => {
      if (cancelled) return;
      assistantProgress(metadata.mediaTime);
      frame = video.requestVideoFrameCallback(update);
    };
    frame = video.requestVideoFrameCallback(update);
    return () => { cancelled = true; video.cancelVideoFrameCallback(frame); };
  }, [assistantProgress]);

  const fadeAssistant = useCallback(async (opacity: number) => {
    const video = assistant.current;
    if (!video) return;
    const from = getComputedStyle(video).opacity;
    video.style.opacity = from; assistantFade.current?.cancel();
    if (Math.abs(Number(from) - opacity) < .001) return;
    const animation = video.animate([{opacity: from}, {opacity}], {duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 100, fill: 'forwards'});
    assistantFade.current = animation;
    try { await animation.finished; } catch { return; }
    if (assistantFade.current === animation) { video.style.opacity = String(opacity); animation.cancel(); assistantFade.current = null; }
  }, []);
  const holdAssistant = useCallback(async () => {
    holdingAssistant.current = true; assistant.current?.pause();
    await fadeAssistant(0);
  }, [fadeAssistant]);
  const restAssistant = useCallback(() => {
    const video = assistant.current;
    if (video) { video.pause(); video.currentTime = espressoMotion.restAt; }
  }, []);
  const restoreAssistant = useCallback(() => fadeAssistant(1), [fadeAssistant]);

  function skipIntro() {
    skippedIntro.current = true;
    restAssistant();
    arrive();
  }

  async function resumeAssistant() {
    if (closing.current || skippedIntro.current || assistant.current?.ended || holdingAssistant.current) return;
    try { await assistant.current?.play(); if (!closing.current) setNeedsTap(false); }
    catch { if (!closing.current) setNeedsTap(true); }
  }

  useEffect(() => {
    ready.current = false;
    const assistantElement = assistant.current;
    const present = (_value: string, signal: AbortSignal) => new Promise<void>(resolve => {
      cancelAnimationFrame(scanFrame.current);
      stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
      if (matchMedia('(prefers-reduced-motion: reduce)').matches || !finder.current || signal.aborted) { resolve(); return; }
      const animation = finder.current.animate([{opacity: .85}, {opacity: 1}], {duration: 720, easing: 'ease-out'});
      const abort = () => { animation.cancel(); resolve(); };
      signal.addEventListener('abort', abort, {once: true});
      void animation.finished.then(() => resolve(), () => resolve()).finally(() => signal.removeEventListener('abort', abort));
    });
    // Construct once per effect lifecycle, including React's development cleanup/restart.
    gate.current = createTableScanGate({origin: () => location.origin, verify: (value, signal) => callbacks.current.onVerifyTable(value, signal), feedback: (value, confirmed) => { setNotice(value); if (confirmed) setTable(confirmed); }, present, open: value => { shutDown(); callbacks.current.onOpenTable(value); }});
    const initial = setTimeout(() => { void resumeAssistant(); }, 0);
    closeButton.current?.focus({preventScroll: true});
    function visibility() {
      if (closing.current) return;
      if (document.hidden) {
        assistant.current?.pause(); releaseCamera(); setCameraReady(false); setSuspended(true);
      } else {
        setSuspended(false); void resumeAssistant();
        if (ready.current) void startCamera();
      }
    }
    document.addEventListener('visibilitychange', visibility);
    return () => {
      clearTimeout(initial); document.removeEventListener('visibilitychange', visibility);
      gate.current?.close(); releaseCamera(); assistantElement?.pause(); assistantFade.current?.cancel();
    };
  }, [releaseCamera, shutDown, startCamera]);

  const close = useCallback(() => {
    if (closing.current) return;
    shutDown();
    onClose();
  }, [onClose, shutDown]);

  useEffect(() => {
    function androidBack(event: Event) {
      event.preventDefault();
      close();
    }
    window.addEventListener('espresso-android-back', androidBack);
    return () => window.removeEventListener('espresso-android-back', androidBack);
  }, [close]);

  const retry = () => { lastCode.current = ''; if (cameraReady) setNotice('guide'); else void startCamera(); };
  const lines = !arrived
    ? introStep >= 1 || assetError ? ['Hi, I’m Espresso.', 'Your café assistant.'] : ['', '']
    : scannerWords(notice, table, orderHint);
  const canRetry = arrived && ['permission', 'camera', 'offline', 'unavailable', 'wrong-qr'].includes(notice);

  return <main ref={screen} className="table-scan-screen" aria-label="Scan to order" data-assistant-ready={arrived} data-camera-ready={cameraReady} data-notice={notice} onKeyDown={event => { if (event.key === 'Escape') close(); }}>
    <header className="table-scan-heading"><h1>Scan to order</h1></header>
    {!arrived && <button type="button" className="table-scan-skip" aria-label="Skip assistant animation" onClick={skipIntro}>Skip</button>}
    <button ref={closeButton} type="button" className="table-scan-close" aria-label="Close scanner" onClick={close}><X size={22} aria-hidden="true" /></button>
    <div className="table-scan-camera-window" aria-hidden={!arrived} inert={!arrived}>
      <video ref={camera} muted playsInline disablePictureInPicture disableRemotePlayback className="table-scan-feed" data-ready={cameraReady} aria-label="Table QR camera" />
      <div ref={finder} className="table-scan-frame" data-scanning={cameraReady && notice !== 'checking' && notice !== 'confirmed'} data-confirmed={notice === 'confirmed'}>
        <svg className="table-scan-edge" viewBox="0 0 280 280" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <rect className="table-scan-edge-track" x="3" y="3" width="274" height="274" rx="25" pathLength="100" />
          <g className="table-scan-edge-comet">
            <rect className="table-scan-edge-shadow" x="3" y="3" width="274" height="274" rx="25" pathLength="100" />
            <rect className="table-scan-edge-shine" x="3" y="3" width="274" height="274" rx="25" pathLength="100" />
          </g>
        </svg>
        <div className="table-scan-light" aria-hidden="true" />
        <div className="table-scan-corners" aria-hidden="true"><i /><i /><i /><i /></div>
        <div className="table-scan-reticle" aria-hidden="true" />
        {!cameraReady && <div className="table-scan-camera-state">{notice === 'permission' || notice === 'camera' ? <CameraOff size={28} /> : <Camera size={28} />}</div>}
        {notice === 'confirmed' && <span className="table-scan-success"><Check size={29} /></span>}
      </div>
    </div>
    <div className="table-scan-assistant" data-ready={arrived} data-original="true" data-position={introStep === 2 ? 'left' : 'center'}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {assetError ? <img src={espressoMotion.restingPoster} alt="Espresso, your café assistant, from the original reference video" /> : <video ref={assistant} src={espressoMotion.source} poster={espressoMotion.poster} muted playsInline disablePictureInPicture disableRemotePlayback preload="auto" aria-label="Espresso in the original reference animation" onTimeUpdate={() => assistantProgress()} onError={() => { if (!closing.current) { setAssetError(true); setNeedsTap(false); } }} />}
      {!assetError && <TableScannerReaction notice={notice} enabled={arrived} onStart={holdAssistant} onCovered={restAssistant} onRestored={restoreAssistant}/>}
    </div>
    <div className="table-scan-words" data-position={arrived ? 'left' : 'center'} role="status" aria-live="polite" aria-atomic="true">
      <div key={lines.join('|')} className="table-scan-word-group">
        <p>{lines[0]}</p>
        <p>{lines[1]}</p>
      </div>
      {!arrived && needsTap && <button type="button" className="table-scan-action" onClick={() => void resumeAssistant()}>Meet Espresso</button>}
      {!arrived && assetError && <button type="button" className="table-scan-action" onClick={arrive}>Open scanner</button>}
      {canRetry && <button type="button" className="table-scan-action" onClick={retry}><RotateCcw size={15} aria-hidden="true" />Try again</button>}
      {suspended && <span className="table-scan-announcement">Scanning paused</span>}
    </div>
  </main>;
}
