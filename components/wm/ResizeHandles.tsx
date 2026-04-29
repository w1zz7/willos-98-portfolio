"use client";

import type { RefObject } from "react";
import { useResize, type ResizeEdge } from "@/lib/wm/useResize";

const EDGES: Array<{ edge: ResizeEdge; className: string; cursor: string }> = [
  { edge: "n", className: "top-0 left-2 right-2 h-[6px]", cursor: "ns-resize" },
  { edge: "s", className: "bottom-0 left-2 right-2 h-[6px]", cursor: "ns-resize" },
  { edge: "w", className: "left-0 top-2 bottom-2 w-[6px]", cursor: "ew-resize" },
  { edge: "e", className: "right-0 top-2 bottom-2 w-[6px]", cursor: "ew-resize" },
  { edge: "nw", className: "top-0 left-0 w-[12px] h-[12px]", cursor: "nwse-resize" },
  { edge: "ne", className: "top-0 right-0 w-[12px] h-[12px]", cursor: "nesw-resize" },
  { edge: "sw", className: "bottom-0 left-0 w-[12px] h-[12px]", cursor: "nesw-resize" },
  { edge: "se", className: "bottom-0 right-0 w-[12px] h-[12px]", cursor: "nwse-resize" },
];

export function ResizeHandles({
  windowId,
  windowRef,
}: {
  windowId: string;
  windowRef: RefObject<HTMLDivElement | null>;
}) {
  const { begin, onPointerMove, onPointerUp } = useResize(windowId, windowRef);

  return (
    <>
      {EDGES.map(({ edge, className, cursor }) => (
        <div
          key={edge}
          className={`absolute z-10 ${className}`}
          style={{ cursor, touchAction: "none" }}
          onPointerDown={begin(edge)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      ))}
    </>
  );
}
