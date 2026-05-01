"use client";

/**
 * Contact Me - Win98 business-card app.
 *
 * Top:    hero card with headshot + name/title/location
 * Mid:    4-up contact grid with one-click copy on each row
 * Below:  collapsible message composer (mailto pre-fill, no servers)
 * Bottom: vCard download + copy card
 */

import type { WindowState } from "@/lib/wm/types";
import { useState } from "react";
import { openLink } from "@/lib/wm/openLink";
import { openApp } from "@/lib/wm/registry";
import { useWindowStore } from "@/lib/wm/store";
import { MenuBar, type MenuDef } from "@/components/primitives/MenuBar";
import { showToast } from "@/components/primitives/Toast";

const EMAIL = "wz363@drexel.edu";
const PHONE = "(267) 255-1163";
const LINKEDIN_URL = "https://www.linkedin.com/in/willzhang6200";
const LINKEDIN_DISPLAY = "linkedin.com/in/willzhang6200";
const LOCATION = "Philadelphia, PA";

const VCARD = `BEGIN:VCARD
VERSION:3.0
FN:Will Zhang
N:Zhang;Will;;;
TITLE:Student Founder · Builder · Operator
ORG:Drexel LeBow · Bulletproof AI
EMAIL;TYPE=INTERNET;TYPE=PREF:${EMAIL}
TEL;TYPE=CELL:${PHONE.replace(/[^\d+]/g, "")}
URL:${LINKEDIN_URL}
ADR;TYPE=WORK:;;Philadelphia;PA;;USA
NOTE:Most useful on AI products\\, growth ops\\, or anywhere shipping matters more than talking about it.
END:VCARD`;

const CONTACT_CARD = `Will Zhang
Student Founder · Builder · Operator
Drexel LeBow · Bulletproof AI

Email     ${EMAIL}
Phone     ${PHONE}
LinkedIn  ${LINKEDIN_DISPLAY}
Location  ${LOCATION}

Replies under 24 hours.`;

export default function ContactNotepad({ window: win }: { window: WindowState }) {
  const subject = win.props?.subject as string | undefined;
  const [showForm, setShowForm] = useState(!!subject);

  const close = () => useWindowStore.getState().closeWindow(win.id);

  const copy = (text: string, label: string) => {
    try {
      navigator.clipboard?.writeText(text);
      showToast(`Copied - ${label}`);
    } catch {
      showToast("Couldn't copy - select the text manually");
    }
  };

  const downloadVcard = () => {
    const blob = new Blob([VCARD], { type: "text/vcard" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "WillZhang.vcf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("vCard downloaded - open to add to contacts");
  };

  const menus: MenuDef[] = [
    {
      label: "File",
      mnemonic: "F",
      items: [
        { label: "New Message", action: () => setShowForm(true) },
        { label: "Save vCard...", action: downloadVcard },
        { separator: true },
        { label: "Exit", action: close },
      ],
    },
    {
      label: "Edit",
      mnemonic: "E",
      items: [
        { label: "Copy email", action: () => copy(EMAIL, "email") },
        { label: "Copy phone", action: () => copy(PHONE, "phone") },
        { label: "Copy LinkedIn", action: () => copy(LINKEDIN_URL, "LinkedIn URL") },
        { label: "Copy entire card", action: () => copy(CONTACT_CARD, "contact card") },
      ],
    },
    {
      label: "Open",
      mnemonic: "O",
      items: [
        { label: "LinkedIn ↗", action: () => openLink(LINKEDIN_URL) },
        { label: "Mail client (mailto)", action: () => { window.location.href = `mailto:${EMAIL}`; } },
        { separator: true },
        { label: "About Will", action: () => openApp("about") },
        { label: "Projects", action: () => openApp("projects") },
      ],
    },
    {
      label: "Help",
      mnemonic: "H",
      items: [
        { label: "About WillOS 98", action: () => openApp("about-dialog") },
      ],
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[color:var(--color-win-bg)]">
      <MenuBar menus={menus} />

      <div className="flex-1 min-h-0 overflow-auto win-scroll p-[12px] flex flex-col gap-[12px]">
        {/* ---------- Hero business card ---------- */}
        <HeroCard
          onEmail={() => { window.location.href = `mailto:${EMAIL}`; }}
          onLinkedIn={() => openLink(LINKEDIN_URL)}
          onPhone={() => copy(PHONE, "phone")}
        />

        {/* ---------- Contact details (one-click copy) ---------- */}
        <DetailGrid copy={copy} />

        {/* ---------- Message composer (collapsible) ---------- */}
        <div className="win-window bg-white">
          <div
            className="px-[10px] py-[6px] flex items-baseline justify-between"
            style={{
              background: "linear-gradient(180deg, #1a4ea3 0%, #08246b 100%)",
              color: "#fff",
            }}
          >
            <span className="font-bold text-[16px]">
              ✉ Send a message
            </span>
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="text-[14px] hover:underline"
              style={{ color: "#cfe0ff", background: "transparent" }}
            >
              {showForm ? "× collapse" : "+ open form"}
            </button>
          </div>
          {showForm ? (
            <ContactForm initialSubject={subject} />
          ) : (
            <p className="px-[12px] py-[10px] text-[15px] leading-snug text-[#333]">
              Open a quick form that pre-fills your mail client - no servers,
              no data stored. Or just drop a note via{" "}
              <a
                href={`mailto:${EMAIL}`}
                className="underline"
                style={{ color: "#0000ee" }}
              >
                {EMAIL}
              </a>
              .
            </p>
          )}
        </div>

        {/* ---------- Footer ---------- */}
        <div className="flex flex-wrap gap-[6px] justify-end">
          <button
            type="button"
            className="win-btn"
            onClick={downloadVcard}
            title="Save .vcf to your contacts app"
          >
            💾 vCard (.vcf)
          </button>
          <button
            type="button"
            className="win-btn"
            onClick={() => copy(CONTACT_CARD, "contact card")}
          >
            📋 Copy card
          </button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------
   Hero - headshot + name + role + location + status pill + CTAs
   ---------------------------------------------------------------- */
function HeroCard({
  onEmail,
  onLinkedIn,
  onPhone,
}: {
  onEmail: () => void;
  onLinkedIn: () => void;
  onPhone: () => void;
}) {
  return (
    <div className="win-window bg-white">
      <div
        className="flex gap-[14px] p-[14px] items-stretch"
        style={{
          background: "linear-gradient(180deg, #fdfdfd 0%, #ececec 100%)",
        }}
      >
        {/* Headshot */}
        <div
          className="win-sunken shrink-0"
          style={{ width: 110, height: 110, background: "#f0f0f0" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/will-zhang.jpg"
            alt="Will Zhang"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        </div>

        {/* Identity */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-[3px]">
          <div className="font-bold text-[24px] leading-tight">
            Will Zhang
          </div>
          <div className="text-[16px] text-[#333] leading-tight">
            Student Founder · Builder · Operator
          </div>
          <div className="text-[14px] text-[#666] leading-tight">
            Drexel LeBow · Bulletproof AI · {LOCATION}
          </div>
        </div>
      </div>

      {/* Quick actions strip */}
      <div
        className="grid border-t border-[#808080]"
        style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
      >
        <ActionButton icon="✉" label="Email" onClick={onEmail} />
        <ActionButton icon="🔗" label="LinkedIn" onClick={onLinkedIn} />
        <ActionButton icon="📱" label="Phone" onClick={onPhone} />
      </div>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center justify-center py-[10px] gap-[4px] hover:bg-[#eef3f8]"
      style={{
        borderRight: "1px solid #808080",
      }}
    >
      <span className="text-[24px] leading-none">{icon}</span>
      <span className="text-[14px] font-bold uppercase tracking-wide text-[#333]">
        {label}
      </span>
    </button>
  );
}

/* ----------------------------------------------------------------
   Detail grid - 4 rows with one-click copy
   ---------------------------------------------------------------- */
function DetailGrid({
  copy,
}: {
  copy: (text: string, label: string) => void;
}) {
  const ROWS: Array<{
    icon: string;
    label: string;
    value: string;
    copyValue: string;
    copyLabel: string;
    href?: string;
  }> = [
    {
      icon: "📧",
      label: "Email",
      value: EMAIL,
      copyValue: EMAIL,
      copyLabel: "email",
      href: `mailto:${EMAIL}`,
    },
    {
      icon: "📱",
      label: "Phone",
      value: PHONE,
      copyValue: PHONE,
      copyLabel: "phone",
      href: `tel:${PHONE.replace(/[^\d+]/g, "")}`,
    },
    {
      icon: "💼",
      label: "LinkedIn",
      value: LINKEDIN_DISPLAY,
      copyValue: LINKEDIN_URL,
      copyLabel: "LinkedIn URL",
      href: LINKEDIN_URL,
    },
    {
      icon: "📍",
      label: "Location",
      value: LOCATION,
      copyValue: LOCATION,
      copyLabel: "location",
    },
  ];

  return (
    <div
      className="grid gap-[8px]"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}
    >
      {ROWS.map((r) => (
        <div
          key={r.label}
          className="win-sunken bg-white flex items-center gap-[10px] p-[10px]"
        >
          <span className="text-[24px] leading-none shrink-0">{r.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] uppercase tracking-wide text-[#666]">
              {r.label}
            </div>
            <div
              className="text-[16px] truncate"
              style={{ fontFamily: "Lucida Console, Consolas, monospace" }}
            >
              {r.href ? (
                <a
                  href={r.href}
                  target={r.href.startsWith("http") ? "_blank" : undefined}
                  rel={r.href.startsWith("http") ? "noopener noreferrer" : undefined}
                  className="underline"
                  style={{ color: "#0000ee" }}
                >
                  {r.value}
                </a>
              ) : (
                r.value
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => copy(r.copyValue, r.copyLabel)}
            className="win-btn shrink-0 text-[13px]"
            title={`Copy ${r.copyLabel}`}
          >
            Copy
          </button>
        </div>
      ))}
    </div>
  );
}


/* ----------------------------------------------------------------
   Message composer
   ---------------------------------------------------------------- */
function ContactForm({ initialSubject }: { initialSubject?: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState(initialSubject ?? "");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const subjectLine = subject || `Message from ${name || "someone"}`;
  const mailto = `mailto:${EMAIL}?subject=${encodeURIComponent(
    `[Portfolio] ${subjectLine}`
  )}&body=${encodeURIComponent(
    `${message}\n\n--\nFrom: ${name}\nReply-to: ${email}`
  )}`;

  if (sent) {
    return (
      <div className="p-[14px] flex flex-col gap-[6px]">
        <div className="text-[16px] font-bold text-[#0a5b16]">
          ✓ Mail client opened
        </div>
        <p className="text-[14px] text-[#333] leading-snug">
          Your default mail app should have just popped up with the message
          pre-filled. If nothing happened, copy the body below and send it
          manually:
        </p>
        <pre
          className="win-sunken bg-[#f8f8f8] p-[8px] text-[13px] whitespace-pre-wrap m-0"
          style={{ fontFamily: "Lucida Console, Consolas, monospace" }}
        >{`To: ${EMAIL}
Subject: [Portfolio] ${subjectLine}

${message}

--
From: ${name}
Reply-to: ${email}`}</pre>
        <div className="flex gap-[6px] justify-end">
          <button
            type="button"
            className="win-btn"
            onClick={() => {
              setSent(false);
              setName("");
              setEmail("");
              setSubject(initialSubject ?? "");
              setMessage("");
            }}
          >
            ← Send another
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-[8px] p-[14px] text-[15px]"
      onSubmit={(e) => {
        e.preventDefault();
        window.location.href = mailto;
        setSent(true);
      }}
    >
      <div
        className="grid gap-[8px]"
        style={{ gridTemplateColumns: "1fr 1fr" }}
      >
        <label className="flex flex-col gap-[2px]">
          <span className="text-[13px] uppercase tracking-wide text-[#444]">
            Your name
          </span>
          <input
            className="win-field px-[6px] py-[4px]"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Jane Doe"
          />
        </label>
        <label className="flex flex-col gap-[2px]">
          <span className="text-[13px] uppercase tracking-wide text-[#444]">
            Your email
          </span>
          <input
            type="email"
            className="win-field px-[6px] py-[4px]"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="jane@company.com"
          />
        </label>
      </div>
      <label className="flex flex-col gap-[2px]">
        <span className="text-[13px] uppercase tracking-wide text-[#444]">
          Subject
        </span>
        <input
          className="win-field px-[6px] py-[4px]"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. Quick chat about a co-op role"
        />
      </label>
      <label className="flex flex-col gap-[2px]">
        <span className="text-[13px] uppercase tracking-wide text-[#444]">
          Message
        </span>
        <textarea
          className="win-field px-[6px] py-[4px] min-h-[120px] resize-y"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What would you like to build, ask, or offer?"
          required
        />
      </label>
      <div className="flex items-center justify-between gap-[6px] flex-wrap">
        <p className="text-[12px] text-[color:var(--color-win-text-disabled)] m-0">
          Submitting opens your mail client with the body pre-filled - nothing
          is stored or sent from this page.
        </p>
        <button type="submit" className="win-btn font-bold">
          Open email client →
        </button>
      </div>
    </form>
  );
}
