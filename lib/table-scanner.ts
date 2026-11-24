export const espressoMotion = {
  source: '/previews/assets/pixabay-presenter-original.mp4',
  poster: '/scanner-assistant/original-arriving.jpg',
  restingPoster: '/scanner-assistant/original-resting.jpg',
  introduceAt: 2.8,
  returnAt: 6.4,
  readyAt: 7.5,
  orderHintAt: 14.4,
  restAt: 16.16,
} as const;

export type ScanNotice = 'guide' | 'opening' | 'wrong-qr' | 'unavailable' | 'offline' | 'permission' | 'camera' | 'checking' | 'confirmed';

export function tableCameraCrop(width: number, height: number) {
  const side = Math.min(width, height);
  return {x:(width-side)/2, y:(height-side)/2, side, output:Math.min(side,640)};
}

// Native gesture ranges from the unmodified reference video.
export function scannerReaction(notice: ScanNotice) {
  switch (notice) {
    case 'unavailable': return {start: 8.08, end: 10.52};
    case 'wrong-qr': return {start: 10.56, end: 16.16};
    case 'permission': return {start: 3.52, end: 6.64};
    default: return null;
  }
}

export function scannerWords(notice: ScanNotice, table = '', orderHint = false) {
  switch (notice) {
    case 'opening': return ['Let’s open your camera.', 'Allow camera access to scan your table.'];
    case 'wrong-qr': return ['Let’s try that again.', 'Please scan the QR code on your café table.'];
    case 'unavailable': return ['This table isn’t available.', 'Please choose another table or ask our café team.'];
    case 'offline': return ['Let’s try once more.', 'We couldn’t check your table. Please try again.'];
    case 'permission': return ['Let’s turn your camera on.', 'Allow camera access, then try again.'];
    case 'camera': return ['Let’s try your camera again.', 'Check that your camera is available, then retry.'];
    case 'checking': return ['One little moment.', 'I’m checking your table.'];
    case 'confirmed': return [`You’re at Table ${table}.`, 'Let’s explore the menu.'];
    default: return orderHint ? ['Choose your favourites.', 'Place your order when you’re ready.'] : ['Scan the QR code', 'on your café table.'];
  }
}

export function parseCafeTableQr(raw: string, origin: string): string | null {
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || url.pathname !== '/' || url.username || url.password) return null;
    const tables = url.searchParams.getAll('table');
    return tables.length === 1 && /^T\d{2}$/.test(tables[0]) ? tables[0] : null;
  } catch { return null; }
}

export function verificationNotice(error: unknown): ScanNotice {
  const message = error instanceof Error ? error.message : '';
  return /unavailable|no longer|reserved|occupied|already.*table|allocated|dine.in.*unavailable/i.test(message) ? 'unavailable' : 'offline';
}

/** One verification at a time. Closing/backgrounding invalidates all late callbacks. */
export function createTableScanGate(options: {
  origin: () => string;
  verify: (table: string, signal: AbortSignal) => Promise<void>;
  feedback: (notice: ScanNotice, table?: string) => void;
  present: (table: string, signal: AbortSignal) => Promise<void>;
  open: (table: string) => void;
}) {
  let active = false, closed = false, busy = false, opened = false, revision = 0;
  let request: AbortController | null = null;
  const cancel = () => { revision++; request?.abort(); request = null; busy = false; };
  return {
    activate() { if (closed || active) return false; active = true; return true; },
    isBusy: () => busy || opened || closed,
    cancel,
    close() { closed = true; active = false; cancel(); },
    async scan(raw: string) {
      if (!active || busy || opened || closed) return;
      const table = parseCafeTableQr(raw, options.origin());
      if (!table) { options.feedback('wrong-qr'); return; }
      busy = true;
      const id = ++revision, controller = new AbortController();
      request = controller;
      options.feedback('checking', table);
      const current = () => !closed && !controller.signal.aborted && revision === id;
      try {
        await options.verify(table, controller.signal);
        if (!current()) return;
        options.feedback('confirmed', table);
        await options.present(table, controller.signal);
        if (!current()) return;
        opened = true;
        options.open(table);
      } catch (error) {
        if (current()) options.feedback(verificationNotice(error));
      } finally {
        if (revision === id) { busy = false; request = null; }
      }
    },
  };
}
