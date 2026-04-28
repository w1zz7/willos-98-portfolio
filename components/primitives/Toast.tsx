"use client";

import { useEffect, useState } from "react";

/* --------------------------------------------------------------
   Tiny imperative toast module. Call `showToast(message)` from
   anywhere. Renders a Win98-styled notification bottom-right that
   auto-dismisses after 2.2 seconds.
   -------------------------------------------------------------- */

interface ToastItem {
  id: number;
  text: string;
}

let counter = 0;
const listeners = new Set<(toasts: ToastItem[]) => void>();
let current: ToastItem[] = [];

export function showToast(text: string) {
  const id = ++counter;
  current = [...current, { id, text }];
  listeners.forEach((cb) => cb(current));
  window.setTimeout(() => {
    current = current.filter((t) => t.id !== id);
    listeners.forEach((cb) => cb(current));
  }, 2200);
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    const cb = (t: ToastItem[]) => setItems([...t]);
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      className="fixed bottom-[40px] right-[10px] z-[100001] flex flex-col gap-[4px] pointer-events-none"
      aria-live="polite"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className="win-window flex items-center gap-[8px] px-[10px] py-[6px] text-[20px] pointer-events-auto"
          style={{
            background: "var(--color-win-bg)",
            animation: "toast-in 160ms ease-out",
          }}
        >
          <span
            className="w-[16px] h-[16px] flex items-center justify-center font-bold text-white"
            style={{ background: "#087f23", borderRadius: "50%" }}
          >
            ✓
          </span>
          {t.text}
        </div>
      ))}
      <style>{`
        @keyframes toast-in {
          from { transform: translateY(8px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
