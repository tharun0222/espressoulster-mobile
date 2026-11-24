type NativeWindow = Window & {espressoCashfreeCheckout?: boolean; espressoCashfreeMode?: 'test' | 'live'};
type Checkout = {orderId: string; paymentSessionId: string; mode: 'test' | 'live'};

/** Both native outcomes require Get Order on the backend; neither means paid. */
export function openNativeCashfreeCheckout(session: Checkout): Promise<'verify' | 'closed'> | null {
  if (typeof window === 'undefined') return null;
  const bridge = window as NativeWindow;
  if (!bridge.espressoCashfreeCheckout || session.mode !== (bridge.espressoCashfreeMode ?? 'test')) return null;
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    let finished = false;
    const timer = window.setTimeout(() => finish('verify'), 10 * 60 * 1000);
    function cleanup() {
      window.clearTimeout(timer);
      window.removeEventListener('espresso-cashfree-checkout', receive);
      window.removeEventListener('pagehide', close);
    }
    function finish(state: 'verify' | 'closed') {
      if (finished) return;
      finished = true; cleanup(); resolve(state);
    }
    function close() { finish('closed'); }
    function receive(event: Event) {
      const detail = (event as CustomEvent<{requestId?: string; state?: string}>).detail;
      if (detail?.requestId === requestId && (detail.state === 'verify' || detail.state === 'closed')) finish(detail.state);
    }
    window.addEventListener('espresso-cashfree-checkout', receive);
    window.addEventListener('pagehide', close, {once: true});
    try {
      if (window.prompt('espresso:cashfree:checkout', JSON.stringify({requestId, ...session})) !== 'opened') {
        finished = true; cleanup(); reject(Error('Unable to open checkout. Check payment status before trying again.'));
      }
    } catch {
      finished = true; cleanup(); reject(Error('Unable to open checkout. Check payment status before trying again.'));
    }
  });
}
