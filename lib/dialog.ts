"use client";
import { useEffect } from "react";
export function useDialogAccessibility(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = document.querySelector(
      '[role="dialog"]',
    ) as HTMLElement | null;
    const getNodes = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]',
        ) || [],
      ).filter((n) => n.getClientRects().length > 0);
    getNodes()[0]?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
      if (e.key === "Tab") {
        const nodes = getNodes(),
          first = nodes[0],
          last = nodes[nodes.length - 1];
        if (!first) return;
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            !dialog?.contains(document.activeElement))
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = oldOverflow;
      before?.focus();
    };
    // Track the open/closed lifecycle without restarting focus on field changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
