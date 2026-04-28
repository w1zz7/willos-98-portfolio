"use client";

import { useWindowStore } from "@/lib/wm/store";
import { Window } from "./Window";

export function WindowLayer() {
  const order = useWindowStore((s) => s.order);
  const windows = useWindowStore((s) => s.windows);

  return (
    <div className="absolute inset-0 pointer-events-none">
      {order.map((id) => {
        const win = windows[id];
        if (!win) return null;
        return (
          <div key={id} className="pointer-events-auto">
            <Window window={win} />
          </div>
        );
      })}
    </div>
  );
}
