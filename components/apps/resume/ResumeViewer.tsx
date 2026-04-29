"use client";

import type { WindowState } from "@/lib/wm/types";
import { useState } from "react";

export default function ResumeViewer({ window: _ }: { window: WindowState }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="flex flex-col h-full bg-[color:var(--color-win-bg)]">
      {/* PDF reader toolbar - responsive at mobile widths */}
      <div className="flex items-center gap-[4px] px-[4px] py-[4px] border-b border-[#808080] min-h-[40px] flex-wrap">
        <a
          href="/resume.pdf"
          download="WillZhang-Resume.pdf"
          className="win-btn"
          style={{
            minWidth: 0,
            padding: "0 10px",
            height: 32,
            fontSize: 15,
          }}
        >
          ⬇ Download
        </a>
        <a
          href="/resume.pdf"
          target="_blank"
          rel="noopener"
          className="win-btn"
          style={{
            minWidth: 0,
            padding: "0 10px",
            height: 32,
            fontSize: 15,
          }}
        >
          Open in new tab
        </a>
        <div className="flex-1 min-w-0" />
        <div className="text-[15px] italic pr-[4px] truncate hidden sm:block">
          Resume.pdf - WillZhang
        </div>
      </div>

      {/* PDF embed */}
      <div className="flex-1 min-h-0 relative bg-[#505050]">
        {failed ? (
          <ResumeMissing />
        ) : (
          <object
            data="/resume.pdf#view=FitH&toolbar=0"
            type="application/pdf"
            className="absolute inset-0 w-full h-full"
            onError={() => setFailed(true)}
          >
            <iframe
              src="/resume.pdf#view=FitH"
              className="absolute inset-0 w-full h-full"
              title="Will Zhang Resume PDF"
              onError={() => setFailed(true)}
            />
          </object>
        )}
      </div>
    </div>
  );
}

function ResumeMissing() {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-[20px] text-center">
      <div
        className="win-window p-[16px] max-w-[420px] text-[20px] leading-relaxed"
        style={{ background: "var(--color-win-bg)" }}
      >
        <div className="font-bold text-[18px] mb-[6px]">
          Resume.pdf not found
        </div>
        To enable the resume viewer, copy{" "}
        <code className="bg-white px-[2px]">WillZhangResume.pdf</code> to{" "}
        <code className="bg-white px-[2px]">portfolio/public/resume.pdf</code>{" "}
        and reload. The viewer will embed it automatically.
      </div>
    </div>
  );
}
