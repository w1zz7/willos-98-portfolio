"use client";

import type { WindowState } from "@/lib/wm/types";
import { useMinesweeper } from "./useMinesweeper";

const NUMBER_COLORS: Record<number, string> = {
  1: "#0000ff",
  2: "#007700",
  3: "#ff0000",
  4: "#000080",
  5: "#800000",
  6: "#008080",
  7: "#000000",
  8: "#808080",
};

export default function Minesweeper({ window: _ }: { window: WindowState }) {
  const m = useMinesweeper();

  const face =
    m.status === "won" ? "😎" : m.status === "lost" ? "😵" : "🙂";

  return (
    <div
      className="flex flex-col items-center p-[6px] gap-[6px]"
      style={{ background: "var(--color-win-bg)", height: "100%" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Stats bar */}
      <div className="win-sunken flex items-center justify-between p-[4px] gap-[6px] w-full">
        <LedCounter value={m.flagsLeft} />
        <button
          type="button"
          className="win-btn w-[28px] h-[28px] min-w-0 p-0 text-[21px] leading-none"
          onClick={m.reset}
          title="New game"
          aria-label="New game"
        >
          {face}
        </button>
        <LedCounter value={m.elapsed} />
      </div>

      {/* Board */}
      <div
        className="win-sunken p-[3px]"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${m.width}, 16px)`,
          gridTemplateRows: `repeat(${m.height}, 16px)`,
          gap: 0,
        }}
      >
        {m.cells.map((c, i) => (
          <MineSquare
            key={i}
            cell={c}
            onReveal={() => m.reveal(i)}
            onFlag={() => m.toggleFlag(i)}
          />
        ))}
      </div>

      {/* Status msg */}
      {m.status === "won" && (
        <div className="text-[20px] font-bold">You win! · Reset to play again.</div>
      )}
      {m.status === "lost" && (
        <div className="text-[20px] font-bold" style={{ color: "#c00" }}>
          Boom. Try again →
        </div>
      )}
    </div>
  );
}

function LedCounter({ value }: { value: number }) {
  const v = Math.max(0, Math.min(999, value));
  const text = v.toString().padStart(3, "0");
  return (
    <div
      className="font-mono font-bold px-[4px]"
      style={{
        fontSize: "16px",
        color: "#ff0000",
        background: "#000",
        letterSpacing: "2px",
        lineHeight: "20px",
        minWidth: "48px",
        textAlign: "center",
      }}
    >
      {text}
    </div>
  );
}

function MineSquare({
  cell,
  onReveal,
  onFlag,
}: {
  cell: { isMine: boolean; isRevealed: boolean; isFlagged: boolean; adjacent: number };
  onReveal: () => void;
  onFlag: () => void;
}) {
  const { isMine, isRevealed, isFlagged, adjacent } = cell;

  if (!isRevealed) {
    return (
      <button
        type="button"
        className="w-[16px] h-[16px] p-0 min-w-0 flex items-center justify-center text-[20px] leading-none"
        style={{
          background: "var(--color-win-bg)",
          boxShadow: "var(--shadow-raised)",
          border: "none",
          font: "inherit",
          color: isFlagged ? "#c00" : undefined,
        }}
        onClick={onReveal}
        onContextMenu={(e) => {
          e.preventDefault();
          onFlag();
        }}
        onAuxClick={(e) => {
          if (e.button === 2) onFlag();
        }}
      >
        {isFlagged ? "⚑" : ""}
      </button>
    );
  }

  return (
    <div
      className="w-[16px] h-[16px] flex items-center justify-center text-[20px] leading-none font-bold"
      style={{
        background: isMine ? "#c00" : "var(--color-win-bg)",
        border: "1px solid #808080",
        color: NUMBER_COLORS[adjacent] ?? "#000",
      }}
    >
      {isMine ? "💣" : adjacent > 0 ? adjacent : ""}
    </div>
  );
}
