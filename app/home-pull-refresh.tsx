"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
import "./home-pull-refresh.css";

const triggerDistance = 56;
const springFrequency = 15;
const releaseDuration = 1600;
const gestureSlop = 8;

export function HomePullRefresh({ onRefresh, bottomNav, errorMessage = "Home could not be refreshed" }: {
  onRefresh: () => Promise<boolean>;
  bottomNav: RefObject<HTMLElement | null>;
  errorMessage?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const sheen = useRef<SVGEllipseElement>(null);
  const refresh = useRef(onRefresh);
  const impact = useRef<() => void>(() => {});
  const [distance, setDistance] = useState(0);
  const [releaseY, setReleaseY] = useState(50);
  const [landing, setLanding] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<"idle" | "refreshing" | "falling" | "success" | "error" | "reset">("idle");
  const refreshing = phase === "refreshing" || phase === "falling";

  useLayoutEffect(() => {
    const shell = panel.current?.parentElement;
    shell?.style.setProperty("--home-pull-distance", `${distance}px`);
    return () => { shell?.style.removeProperty("--home-pull-distance"); };
  }, [distance]);

  useEffect(() => { refresh.current = onRefresh; }, [onRefresh]);

  useEffect(() => {
    const shell = panel.current?.parentElement;
    if (!shell) return;
    const mountedNav = bottomNav.current;
    let start: { x: number; y: number } | null = null;
    let pull = 0;
    let busy = false;
    let mounted = true;
    let frame = 0;
    let releaseTimer: ReturnType<typeof setTimeout> | undefined;
    let impactTimer: ReturnType<typeof setTimeout> | undefined;
    let settle: (() => void) | undefined;
    let lastMove = 0;
    let velocity = 0;

    function showNav() {
      bottomNav.current?.removeAttribute("data-scrolling");
      bottomNav.current?.setAttribute("data-refresh-active", "");
    }

    function restoreNav() {
      bottomNav.current?.removeAttribute("data-refresh-active");
    }

    impact.current = () => {
      if (!mounted) return;
      const nav = bottomNav.current;
      nav?.setAttribute("data-refresh-impact", "");
      clearTimeout(impactTimer);
      // Animation events can be cancelled when the app goes into the background.
      // Always remove the marker so the next refresh can play the ripple again.
      impactTimer = setTimeout(() => nav?.removeAttribute("data-refresh-impact"), 900);
    };

    function begin(x: number, y: number, target: EventTarget | null, isTouch = false) {
      if (busy || window.scrollY > 1 || !(target instanceof Element)) return;
      if (target.closest("input, select, textarea, [contenteditable], dialog, [role=dialog], .modal-backdrop, .home-category-rail, .movable-cart, .bottom-nav, .admin-mobile-nav")) return;
      // Admin and sheets can scroll independently of the window. A pull in a
      // scrolled inner panel belongs to that panel, not the refresh gesture.
      for (let element: Element | null = target; element; element = element.parentElement) {
        if (element.scrollTop > 1 && element.scrollHeight > element.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(element).overflowY)) return;
        if (element === shell) break;
      }
      if (!isTouch && target.closest("button, a")) return;
      start = { x, y };
      mountedNav?.removeAttribute("data-refresh-impact");
      setPhase("idle");
      lastMove = 0;
      velocity = 0;
    }

    function move(x: number, y: number, event: Event) {
      if (!start) return;
      const dy = y - start.y;
      if (!pull && (dy < -5 || Math.abs(x - start.x) > Math.max(8, dy))) {
        start = null;
        return;
      }
      // Small finger movement is still a tap. Cancelling it immediately makes
      // ordinary Home/Admin buttons fail to receive their native click.
      if (!pull && dy < gestureSlop) return;
      if (dy <= 0 && !pull) return;
      if (event.cancelable) event.preventDefault();
      const travel = Math.max(0, dy);
      const next = Math.min(108, travel <= 70 ? travel * .8 : triggerDistance + (travel - 70) * .36);
      const now = performance.now();
      if (lastMove) velocity = (next - pull) * 1000 / Math.max(8, now - lastMove);
      lastMove = now;
      pull = next;
      showNav();
      setDragging(true);
      setDistance(pull);
    }

    async function finish(commit: boolean) {
      if (!start) return;
      start = null;
      const shouldRefresh = commit && pull >= triggerDistance;
      const releasedAt = pull;
      const releaseVelocity = performance.now() - lastMove < 80
        ? Math.max(-350, Math.min(180, velocity)) : 0;
      pull = 0;
      setDragging(false);
      if (releasedAt === 0) return;

      busy = true;
      if (shouldRefresh) {
        setPhase("refreshing");
        const succeeded = await Promise.resolve().then(() => refresh.current()).catch(() => false);
        if (!mounted) return;
        if (succeeded && matchMedia("(prefers-reduced-motion: reduce)").matches) {
          impact.current();
        } else if (succeeded) {
          showNav();
          const origin = sheen.current?.getBoundingClientRect();
          if (origin) setReleaseY(origin.top + origin.height / 2);
          const nav = bottomNav.current;
          const svg = nav?.querySelector<SVGSVGElement>(".bottom-nav-shape, .admin-nav-outline");
          const bounds = svg?.getBoundingClientRect() ?? nav?.getBoundingClientRect();
          const matrix = svg?.getScreenCTM();
          const center = svg?.createSVGPoint();
          if (center) { center.x = 190; center.y = 43; }
          const point = matrix && center?.matrixTransform(matrix);
          setLanding({
            x: point ? point.x : bounds ? bounds.left + bounds.width / 2 : window.innerWidth / 2,
            y: point ? point.y : bounds ? bounds.top + bounds.height * 43 / 64 : window.innerHeight - 18,
          });
          setPhase("falling");
          await new Promise<void>((resolve) => {
            settle = resolve;
            releaseTimer = setTimeout(() => {
              settle = undefined;
              resolve();
            }, releaseDuration);
          });
        }
        if (!mounted) return;
        setPhase(succeeded ? "success" : "error");
      } else {
        setPhase("reset");
      }
      const returned = new Promise<void>(resolve => {
        if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
          setDistance(0);
          resolve();
          return;
        }
        settle = resolve;
        const started = performance.now();
        // Critically damped spring. The indicator and page share this distance.
        const springSlope = releaseVelocity + springFrequency * releasedAt;
        function tick(now: number) {
          const elapsed = (now - started) / 1000;
          const offset = (releasedAt + springSlope * elapsed) * Math.exp(-springFrequency * elapsed);
          if (offset <= .5) {
            setDistance(0);
            settle = undefined;
            resolve();
          } else {
            setDistance(Math.min(108, offset));
            frame = requestAnimationFrame(tick);
          }
        }
        frame = requestAnimationFrame(tick);
      });
      await returned;
      if (!mounted) return;
      restoreNav();
      busy = false;
      if (mounted && !shouldRefresh) setPhase("idle");
    }

    const touchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) { void finish(false); return; }
      const touch = event.touches[0];
      begin(touch.clientX, touch.clientY, event.target, true);
    };
    const touchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1) { void finish(false); return; }
      const touch = event.touches[0];
      move(touch.clientX, touch.clientY, event);
    };
    const mouseDown = (event: MouseEvent) => {
      if (event.button === 0) begin(event.clientX, event.clientY, event.target);
    };
    const mouseMove = (event: MouseEvent) => move(event.clientX, event.clientY, event);
    const release = () => { void finish(true); };
    const cancel = () => { void finish(false); };

    let listeningForPull = false;
    const syncScroll = () => {
      const atTop = window.scrollY <= 1;
      shell.toggleAttribute("data-refresh-at-top", atTop);
      if (atTop === listeningForPull) return;
      // The browser can scroll the rest of Home without waiting for JavaScript.
      if (atTop) shell.addEventListener("touchmove", touchMove, { passive: false, capture: true });
      else shell.removeEventListener("touchmove", touchMove, true);
      listeningForPull = atTop;
    };
    syncScroll();
    window.addEventListener("scroll", syncScroll, { passive: true });

    shell.addEventListener("touchstart", touchStart, { passive: true });
    shell.addEventListener("touchend", release);
    shell.addEventListener("touchcancel", cancel);
    shell.addEventListener("mousedown", mouseDown);
    window.addEventListener("mousemove", mouseMove);
    window.addEventListener("mouseup", release);
    window.addEventListener("blur", cancel);
    return () => {
      mounted = false;
      cancelAnimationFrame(frame);
      clearTimeout(releaseTimer);
      clearTimeout(impactTimer);
      settle?.();
      mountedNav?.removeAttribute("data-refresh-active");
      mountedNav?.removeAttribute("data-refresh-impact");
      impact.current = () => {};
      window.removeEventListener("scroll", syncScroll);
      shell.removeAttribute("data-refresh-at-top");
      shell.removeEventListener("touchstart", touchStart);
      shell.removeEventListener("touchmove", touchMove, true);
      shell.removeEventListener("touchend", release);
      shell.removeEventListener("touchcancel", cancel);
      shell.removeEventListener("mousedown", mouseDown);
      window.removeEventListener("mousemove", mouseMove);
      window.removeEventListener("mouseup", release);
      window.removeEventListener("blur", cancel);
    };
  }, [bottomNav]);

  const stretch = Math.min(1, distance / triggerDistance);
  const dropY = 22 + 24 * stretch;
  const neck = 13 - 11 * stretch;
  const showAttachedDrop = phase === "idle" || phase === "reset" || phase === "refreshing";
  const status = phase === "error" ? errorMessage : "";
  return (
    <div ref={panel} className="home-pull-refresh" data-dragging={dragging}
      data-moving={distance > 0} data-phase={phase} data-armed={dragging && distance >= triggerDistance} aria-busy={refreshing}>
      <div className="home-refresh-art" aria-hidden="true">
        <svg className="liquid-crema" viewBox="0 0 120 72">
          <defs>
            <linearGradient id="crema-gloss" x2="100%" y2="100%">
              <stop stopColor="#6e301e" />
              <stop offset=".42" stopColor="#d98a4e" />
              <stop offset=".56" stopColor="#ffcf90" />
              <stop offset=".76" stopColor="#a04a29" />
              <stop offset="1" stopColor="#532217" />
            </linearGradient>
            <radialGradient id="crema-sheen">
              <stop stopColor="#fff7de" stopOpacity=".95" />
              <stop offset="1" stopColor="#ffe3ad" stopOpacity="0" />
            </radialGradient>
          </defs>
          {showAttachedDrop && (
            <path fill="url(#crema-gloss)" d={`M30 0H90C73 3 ${60 + neck} 9 ${60 + neck} ${dropY - 10}C${60 + neck} ${dropY - 4} 70 ${dropY - 4} 70 ${dropY}A10 10 0 1 1 50 ${dropY}C50 ${dropY - 4} ${60 - neck} ${dropY - 4} ${60 - neck} ${dropY - 10}C${60 - neck} 9 47 3 30 0Z`} />
          )}
          {showAttachedDrop && (
            <ellipse ref={sheen} cx="57" cy={dropY + 1} rx="5" ry="8" fill="url(#crema-sheen)"
              transform={`rotate(27 57 ${dropY + 1})`} />
          )}
        </svg>
      </div>
      {phase === "falling" && createPortal(
        <div className="crema-drop-track" style={{ "--crema-release-y": `${releaseY}px`, "--crema-impact-x": `${landing.x}px`, "--crema-impact-y": `${landing.y}px` } as CSSProperties} aria-hidden="true">
          <div className="crema-falling-drop" onAnimationEnd={(event) => {
            if (event.target === event.currentTarget && event.animationName === "crema-drop-to-bottom") impact.current();
          }}><i /></div>
          {!bottomNav.current && <div className="crema-impact">
            <div className="crema-bottom-ripple" />
            <div className="crema-bottom-ripple" />
            <div className="crema-bottom-ripple" />
            <div className="crema-splash"><i /><i /><i /><i /><i /></div>
          </div>}
        </div>,
        document.body,
      )}
      <span className="sr-only" role="status">{status}</span>
    </div>
  );
}
