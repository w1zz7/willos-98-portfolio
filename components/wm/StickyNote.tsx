"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Draggable, closeable sticky-note popup.
 *
 * Floats above the desktop wallpaper but below open windows. The user
 * can grab the note to drag it anywhere, click × to dismiss.
 *
 * On every click/tap that ISN'T a drag, a tiny Windows-98 press effect
 * fires at the click point - a 3D beveled ripple square expanding
 * outward, paired with a brief "sunken" state on the note itself.
 */
export interface StickyNoteProps {
  /** Initial corner on first mount. Default: "bottom-right". */
  corner?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  /** Optional image pinned inside the note. */
  imageSrc?: string;
  /** Optional alt for imageSrc. */
  imageAlt?: string;
  /** Main caption text (comic-style). */
  caption?: string;
  /** Small italic subcaption under the main caption. */
  subcaption?: string;
  /** Approximate note width in pixels. Default: 230. */
  width?: number;
  /** Rotation in degrees at rest. Default: 4 (bottom-right). */
  rotation?: number;
  /** Tape color. Default: yellow-ish highlighter. */
  tapeColor?: string;
  /** Extra pixels to offset upward from the corner on first mount.
   *  Lets a second note stack cleanly above a first one. */
  stackOffset?: number;
}

export function StickyNote({
  corner = "bottom-right",
  imageSrc,
  imageAlt = "Real HP Win98 CRT setup",
  caption = "the real thing :)",
  subcaption = "drag me · click for a 98™ tap",
  width = 230,
  rotation = 4,
  tapeColor = "rgba(240, 230, 140, 0.6)",
  stackOffset = 0,
}: StickyNoteProps = {}) {
  const [closed, setClosed] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [ripples, setRipples] = useState<
    Array<{ id: number; x: number; y: number }>
  >([]);
  const dragOffset = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const downPos = useRef<{ x: number; y: number; t: number }>({
    x: 0,
    y: 0,
    t: 0,
  });
  const noteRef = useRef<HTMLDivElement | null>(null);
  const rippleSeq = useRef(0);

  // Initial position - corner-based on first mount, clamp on resize.
  useEffect(() => {
    const place = () => {
      if (typeof window === "undefined") return;
      const W = width;
      const H = imageSrc ? 260 : 150;
      const margin = 16;
      const taskbarH = 44;
      setPos((prev) => {
        if (prev) {
          const maxX = window.innerWidth - W - margin;
          const maxY = window.innerHeight - H - taskbarH - margin;
          return {
            x: Math.max(margin, Math.min(prev.x, maxX)),
            y: Math.max(margin, Math.min(prev.y, maxY)),
          };
        }
        // First mount: seat it at the requested corner
        const topY = margin + 8 + stackOffset;
        const bottomY = window.innerHeight - H - taskbarH - 8 - stackOffset;
        const leftX = margin;
        const rightX = window.innerWidth - W - margin;
        switch (corner) {
          case "top-left":
            return { x: leftX, y: topY };
          case "top-right":
            return { x: rightX, y: topY };
          case "bottom-left":
            return { x: leftX, y: bottomY };
          case "bottom-right":
          default:
            return { x: rightX, y: bottomY };
        }
      });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [corner, width, imageSrc, stackOffset]);

  // Spawn a ripple at a local (relative to note) coordinate.
  const spawnRipple = (localX: number, localY: number) => {
    const id = ++rippleSeq.current;
    setRipples((r) => [...r, { id, x: localX, y: localY }]);
    // Auto-cleanup after animation
    window.setTimeout(() => {
      setRipples((r) => r.filter((e) => e.id !== id));
    }, 650);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pos) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragOffset.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    downPos.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    setDragging(true);
    setPressed(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const W = noteRef.current?.offsetWidth ?? 230;
    const H = noteRef.current?.offsetHeight ?? 260;
    const margin = 8;
    const taskbarH = 44;
    const x = Math.max(
      margin,
      Math.min(
        window.innerWidth - W - margin,
        e.clientX - dragOffset.current.dx
      )
    );
    const y = Math.max(
      margin,
      Math.min(
        window.innerHeight - H - taskbarH - margin,
        e.clientY - dragOffset.current.dy
      )
    );
    setPos({ x, y });
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    setDragging(false);
    setPressed(false);
    // If pointer moved < 4px, treat as a click - fire the Win98 press effect
    const dx = Math.abs(e.clientX - downPos.current.x);
    const dy = Math.abs(e.clientY - downPos.current.y);
    if (dx < 4 && dy < 4 && noteRef.current) {
      const rect = noteRef.current.getBoundingClientRect();
      spawnRipple(e.clientX - rect.left, e.clientY - rect.top);
    }
  };

  if (closed || !pos) return null;

  // Pressed = sunken bevel illusion: invert the shadow + nudge 1px + reduce rotation
  const noteShadow = pressed
    ? "drop-shadow(1px 2px 3px rgba(0,0,0,0.45))"
    : "drop-shadow(4px 6px 10px rgba(0,0,0,0.35))";
  const halfRot = Math.max(0, rotation - 2);
  const noteTransform = pressed
    ? `translate(1px, 1px) rotate(${halfRot}deg) scale(0.985)`
    : dragging
      ? "rotate(1deg)"
      : `rotate(${rotation}deg)`;

  return (
    <>
      {/* Keyframes for the Win98 press ripple */}
      <style>{`
        @keyframes win98-ripple {
          0% {
            transform: translate(-50%, -50%) scale(0.4);
            opacity: 1;
            border-width: 3px;
          }
          60% {
            opacity: 0.8;
          }
          100% {
            transform: translate(-50%, -50%) scale(3.4);
            opacity: 0;
            border-width: 1px;
          }
        }
      `}</style>

      <div
        ref={noteRef}
        className="absolute select-none"
        style={{
          left: pos.x,
          top: pos.y,
          width: width,
          zIndex: 5,
          transform: noteTransform,
          transition: pressed
            ? "transform 60ms ease-out, filter 60ms ease-out"
            : "transform 160ms cubic-bezier(0.2, 1.3, 0.4, 1), filter 160ms ease",
          filter: noteShadow,
          background: "#fff",
          padding: 8,
          paddingBottom: 10,
          cursor: dragging ? "grabbing" : "grab",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Close button - on top of the tape */}
        <button
          type="button"
          aria-label="Close sticky note"
          title="Close"
          className="absolute"
          style={{
            top: -6,
            right: -6,
            width: 22,
            height: 22,
            background: "#c00",
            color: "#fff",
            borderRadius: 11,
            border: "2px solid #fff",
            boxShadow: "0 1px 2px rgba(0,0,0,0.4)",
            fontSize: 14,
            lineHeight: 1,
            fontWeight: 700,
            cursor: "pointer",
            zIndex: 4,
            padding: 0,
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setClosed(true);
          }}
        >
          ×
        </button>

        {/* Tape strip */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: -10,
            left: "50%",
            transform: "translateX(-50%) rotate(-3deg)",
            width: 80,
            height: 20,
            background: tapeColor,
            borderLeft: "1px solid rgba(0,0,0,0.08)",
            borderRight: "1px solid rgba(0,0,0,0.08)",
            boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
          }}
        />

        {/* Optional photo */}
        {imageSrc && (
          <img
            src={imageSrc}
            alt={imageAlt}
            draggable={false}
            style={{
              display: "block",
              width: "100%",
              height: "auto",
              pointerEvents: "none",
            }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        )}
        {caption && (
          <div
            style={{
              textAlign: "center",
              fontFamily:
                "'Comic Sans MS', 'Marker Felt', 'Chalkboard SE', cursive",
              fontSize: imageSrc ? 15 : 17,
              color: "#333",
              marginTop: imageSrc ? 6 : 4,
              lineHeight: 1.25,
              padding: imageSrc ? 0 : "6px 4px 0",
              whiteSpace: "pre-wrap",
            }}
          >
            {caption}
          </div>
        )}
        {subcaption && (
          <div
            style={{
              textAlign: "center",
              fontSize: 11,
              color: "#888",
              marginTop: 4,
              fontStyle: "italic",
              padding: "0 4px 2px",
            }}
          >
            {subcaption}
          </div>
        )}

        {/* Win98 press ripples - one per click, auto-cleanup */}
        {ripples.map((r) => (
          <span
            key={r.id}
            aria-hidden
            style={{
              position: "absolute",
              left: r.x,
              top: r.y,
              width: 40,
              height: 40,
              pointerEvents: "none",
              borderStyle: "solid",
              borderColor:
                "#ffffff #808080 #808080 #ffffff" /* Win98 bevel */,
              borderWidth: 3,
              borderRadius: 0,
              transform: "translate(-50%, -50%) scale(0.4)",
              animation: "win98-ripple 620ms ease-out forwards",
              background:
                "linear-gradient(135deg, rgba(255,255,255,0.25), rgba(0,0,128,0.08))",
              mixBlendMode: "multiply",
            }}
          />
        ))}
      </div>
    </>
  );
}
