import { useEffect, useRef, useState } from 'react';
import { api } from '../store-app';
import { unlockCelebrationAudio } from '../../lib/celebration-audio';
import { onLiveUpdate } from '../use-live-updates';
import { nativeOrderAlertsEnabled } from '../../lib/native-order-alerts';

const orderSound = '/audio/order-alert-espresso-house.wav';

export function useAdminOrderAlerts(receiveOrderAlerts: boolean) {
  const cursor = useRef<number>(null);
  const [ordersToday, setOrdersToday] = useState<number | null>(null);
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const context = receiveOrderAlerts ? unlockCelebrationAudio() : null;
    let polling = false;
    let pendingSounds = 0;
    let loadingSound = false;
    let clip: AudioBuffer | undefined;
    let playing: AudioBufferSourceNode | undefined;

    function playQueuedSound() {
      if (!context || context.state !== 'running' || !clip || playing || !pendingSounds ||
          document.hidden || controller.signal.aborted) return;
      const source = context.createBufferSource();
      source.buffer = clip;
      source.connect(context.destination);
      playing = source;
      pendingSounds--;
      source.onended = () => {
        source.disconnect();
        playing = undefined;
        playQueuedSound();
      };
      source.start();
    }

    async function loadSound() {
      if (!context || clip || loadingSound) return;
      loadingSound = true;
      try {
        const response = await fetch(orderSound, { signal: controller.signal });
        if (!response.ok) return;
        clip = await context.decodeAudioData(await response.arrayBuffer());
        playQueuedSound();
      } catch {
        // Keep the visual alert and retry the audio on the next order.
      } finally {
        loadingSound = false;
      }
    }

    function resumeAudio() {
      if (context && context.state !== 'running') void context.resume().catch(() => {});
    }

    async function poll() {
      if (polling || document.hidden || controller.signal.aborted) return;
      clearTimeout(timer);
      polling = true;
      try {
        const after = cursor.current;
        const result = await api(after === null || !receiveOrderAlerts ? 'admin/order-alerts' : `admin/order-alerts?after=${after}`, 'GET', undefined, controller.signal);
        if (controller.signal.aborted) return;
        cursor.current = result.cursor;
        setOrdersToday(result.today);
        if (!receiveOrderAlerts || after === null || !result.newOrders) return;
        setAlertCount(count => count + result.newOrders);
        if (nativeOrderAlertsEnabled()) return;
        pendingSounds += result.newOrders;
        playQueuedSound();
        void loadSound();
      } catch {
        // Resume checking after a temporary network or session error.
      } finally {
        polling = false;
        if (!controller.signal.aborted) timer = setTimeout(poll, 5000);
      }
    }

    function onVisibilityChange() {
      void poll();
      playQueuedSound();
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    const stopLiveUpdates = onLiveUpdate(['orders'], onVisibilityChange);
    if (context) {
      context.addEventListener('statechange', playQueuedSound);
      document.addEventListener('click', resumeAudio, true);
      document.addEventListener('keydown', resumeAudio, true);
      void loadSound();
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
      stopLiveUpdates();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      context?.removeEventListener('statechange', playQueuedSound);
      document.removeEventListener('click', resumeAudio, true);
      document.removeEventListener('keydown', resumeAudio, true);
      if (playing) {
        playing.onended = null;
        playing.stop();
        playing.disconnect();
      }
    };
  }, [receiveOrderAlerts]);

  return { ordersToday, alertCount, clearAlert: () => setAlertCount(0) };
}
