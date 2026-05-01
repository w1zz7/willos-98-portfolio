"use client";

import { useState, useEffect, createContext, useContext } from "react";
import type { WindowState } from "@/lib/wm/types";
import { openApp } from "@/lib/wm/registry";

/* --------------------------------------------------------------
   Lightbox context - any ExperienceCard media thumbnail can call
   openLightbox({ src, title, caption }) to raise a full-size modal.
   -------------------------------------------------------------- */
interface LightboxData {
  src: string;
  title?: string;
  caption?: string;
}
const LightboxContext = createContext<{
  open: (d: LightboxData) => void;
} | null>(null);

function useLightbox() {
  return useContext(LightboxContext);
}

/* --------------------------------------------------------------
   Experience - LinkedIn-style role cards with logos, dates,
   descriptions, and media attachments. Mirrors the layout at
   linkedin.com/in/willzhang6200/details/experience/
   -------------------------------------------------------------- */
interface ExperienceMedia {
  /** Optional image path (under /public/linkedin/). If missing/broken,
   *  the media card renders as a titled placeholder. */
  src?: string;
  title: string;
  caption?: string;
}

interface SubRole {
  role: string;
  dates: string;
  description?: string;
}

interface Experience {
  company: string;
  companyLogo?: string;
  companyBadgeColor?: string;
  companyBadgeInitial?: string;
  role: string;
  employmentType?: string;
  dates: string;
  location?: string;
  onsite?: string;
  description?: string;
  media?: ExperienceMedia[];
  skills?: string[];
  subRoles?: SubRole[];
  accent?: boolean;
}

const EXPERIENCES: Experience[] = [
  {
    company: "Protégé Advising LLC",
    companyLogo: "/linkedin/logo-protege.jpg",
    role: "Sales / Growth Engineer",
    dates: "Apr 2026 – Present · 1 mo",
    description: "Setting up booking paywall and general sales.",
  },
  {
    company: "Drexel High Finance",
    companyLogo: "/linkedin/logo-drexel-high-finance.jpg",
    role: "Public Markets Program",
    dates: "Apr 2026 – Present · 1 mo",
  },
  {
    company: "The Good Idea Fund",
    companyLogo: "/linkedin/logo-good-idea-fund.jpg",
    role: "Director of Relations",
    dates: "Jan 2026 – Present · 4 mos",
    description: "Allocate $100,000 annually for events.",
    subRoles: [
      {
        role: "Director of Relations",
        dates: "Apr 2026 – Present · 1 mo",
      },
      {
        role: "Marketing Member and Event Liaison",
        dates: "Jan 2026 – Present · 4 mos",
      },
    ],
  },
  {
    company: "Google Developer Group",
    companyLogo: "/linkedin/logo-gdg.jpg",
    role: "Technical Lead",
    dates: "Mar 2026 – Present · 2 mos",
    description:
      "Instructing Google technical workshops on campus (Advanced CodeLabs).",
  },
  {
    company: "Drexel Consulting Group",
    companyLogo: "/linkedin/logo-dcg.jpg",
    role: "Venture Advisory Program / Sport Entertainment Consultant",
    employmentType: "Part-time",
    dates: "Mar 2026 – Present · 2 mos",
    description: "WOLF Financial (2026).",
    media: [
      {
        src: "/linkedin/dcg-wolf.jpg",
        title: "png",
        caption: "WOLF Financial - logo attached on LinkedIn.",
      },
    ],
  },
  {
    company: "Bulletproof AI",
    companyLogo: "/linkedin/logo-bulletproof.jpg",
    role: "Co-Founder",
    employmentType: "Full-time",
    dates: "Jan 2026 – Present · 4 mos",
    location: "United States",
    onsite: "On-site",
    description:
      "Serious about helping students land a job in a competitive market.",
    accent: true,
  },
  {
    company: "Local Launch Studio Co.",
    companyLogo: "/linkedin/logo-local-launch.jpg",
    role: "Co-Founder",
    employmentType: "Part-time",
    dates: "Dec 2025 – Present · 5 mos",
    description: "Web development + marketing. GrubGuide (2026).",
    accent: true,
  },
  {
    company: "Super Lychee Golf Series",
    companyBadgeColor: "#d42828",
    companyBadgeInitial: "S",
    role: "Operations Team Member",
    employmentType: "Part-time",
    dates: "Apr 2024 – Present · 2 yrs 1 mo",
    location: "United States",
    onsite: "On-site",
    description:
      "Managed program ops and payments tracking, supporting athletes and sponsor logistics across national tournaments.",
    media: [
      {
        src: "/linkedin/lychee-fcg-tent.jpg",
        title: "Tent at FCG",
      },
      {
        src: "/linkedin/lychee-gpc-ct.jpg",
        title:
          "Translation role for meeting with Lee-Anne Gilchrist at GPC Connecticut 8/15",
        caption:
          "Lee-Anne Gilchrist group CEO of The Golf Performance Center. Based in FL and CT.",
      },
      {
        src: "/linkedin/lychee-maple-dale.jpg",
        title: "Super Lychee AJGA Maple Dale Country Club, Delaware 8/14",
        caption: "Podium.",
      },
      {
        src: "/linkedin/lychee-maple-dale-week.jpg",
        title: "Super Lychee AJGA 8/11–8/14 Maple Dale Country Club, Delaware",
        caption: "Ian Swietkowski tournament director.",
      },
      {
        src: "/linkedin/lychee-ajga-david.jpg",
        title:
          "Super Lychee AJGA 7/27–7/30 - with CEO of Super Lychee David",
      },
      {
        src: "/linkedin/lychee-tukwet-canyon.jpg",
        title:
          "Super Lychee AJGA 7/27–7/30 Morongo Golf Club at Tukwet Canyon, CA",
        caption: "Super Lychee.",
      },
      {
        src: "/linkedin/lychee-chris-alex.jpg",
        title: "Translating for Chris Smeal and Alex Weber",
        caption:
          "Chris - nationally recognized PGA Teaching Professional specializing in junior and collegiate player development; founder of Future Champions Golf.",
      },
      {
        src: "/linkedin/lychee-alex-weber.jpg",
        title: "Meeting with Alex Weber 7/14/2025",
        caption:
          "Founder / CEO of Thrive Sports (sold to Golf Genius in 2024). Sports-tech entrepreneurship + golf tech platforms.",
      },
      {
        src: "/linkedin/lychee-the-ridge.jpg",
        title: "Working with AJGA @ The Ridge Golf Course, Auburn, CA",
      },
      {
        src: "/linkedin/lychee-jerry-wong.jpg",
        title:
          "Meeting with Jerry Wong from The Jerry Wong Golf Academy",
        caption: "Jerry Wong & Stephanie Wong @ Beaumont, CA.",
      },
      {
        src: "/linkedin/lychee-summer-group.jpg",
        title: "Players summer program group photo",
      },
      {
        src: "/linkedin/lychee-taylormade.jpg",
        title: "Visiting Taylormade Golf headquarters in Carlsbad, CA",
      },
      {
        src: "/linkedin/lychee-group-chris-greg.jpg",
        title: "Group photo",
        caption: "Group photo with Chris Smeal and Greg Dumlao.",
      },
      {
        src: "/linkedin/lychee-pga-show-fl.jpg",
        title: "PGA Show in Florida",
        caption: "Orange County Convention Center, Jan 21.",
      },
      {
        src: "/linkedin/lychee-pga-show-2025.jpg",
        title: "PGA Show 2025",
      },
      {
        src: "/linkedin/lychee-fcg-ceo.jpg",
        title: "Translator",
        caption: "Conference with FCG Golf CEO - role as translator.",
      },
    ],
    skills: ["Project Management", "Public Speaking", "Operations"],
  },
  {
    company: "Project Destined",
    companyLogo: "/linkedin/logo-project-destined.jpg",
    role: "Real Estate Private Equity Intern",
    employmentType: "Internship",
    dates: "Jan 2026 – Mar 2026 · 3 mos",
    description: "Underwrite multifamily deals.",
  },
  {
    company: "Let'sPaint",
    companyLogo: "/linkedin/logo-letspaint.jpg",
    role: "Founder",
    employmentType: "Full-time",
    dates: "Feb 2025 – Jul 2025 · 6 mos",
    onsite: "On-site",
    description: "Local painting business, Tri-State Area.",
    media: [
      { src: "/linkedin/letspaint-1.jpg", title: "1" },
      { src: "/linkedin/letspaint-2.jpg", title: "2" },
    ],
  },
  {
    company: "Vovex Golf",
    companyLogo: "/linkedin/logo-vovex.jpg",
    role: "Sales",
    employmentType: "Internship",
    dates: "Jun 2024 – Aug 2024 · 3 mos",
    location: "United States",
    onsite: "On-site",
    description: "Sold rangefinders at golf tournaments.",
    media: [
      {
        src: "/linkedin/vovex-product-selling.jpg",
        title: "Product selling skills",
      },
      {
        src: "/linkedin/vovex-sales.jpg",
        title: "Sales",
        caption: "Selling Range Finders.",
      },
      {
        src: "/linkedin/vovex-tent.jpg",
        title: "Vovex Tent",
        caption:
          "Vovex tent in IMG Academy Junior World Championship at San Diego, CA.",
      },
      {
        src: "/linkedin/vovex-sales-table.jpg",
        title: "Sales Table",
        caption:
          "Future Champions Golf World Junior in Palm Springs, CA - sold around 120 range finders.",
      },
      {
        src: "/linkedin/vovex-supply.jpg",
        title: "Supply",
      },
    ],
    skills: [
      "Building Connections",
      "Communication",
      "Sales",
      "Product Pitching",
    ],
  },
  {
    company: "Gen.G",
    companyLogo: "/linkedin/logo-geng.jpg",
    role: "Operations Team Member",
    employmentType: "Internship",
    dates: "Jan 2024 – Jun 2024 · 6 mos",
    location: "Shanghai, China",
    onsite: "Hybrid",
    description:
      "Built dashboards across 150+ tournaments and made pitch decks.",
    media: [
      {
        src: "/linkedin/geng-letter.jpg",
        title: "Letter",
        caption: "From Operation Manager, China.",
      },
      {
        src: "/linkedin/geng-cert.jpg",
        title: "Internship Certification",
      },
    ],
  },
];

/* --------------------------------------------------------------
   Licenses & Certifications - pulled from the LinkedIn details
   page. Each one has a badge color matching the issuer.
   -------------------------------------------------------------- */
interface Certification {
  name: string;
  issuer: string;
  date: string;
  color: string;
  /** Study hours required to complete (shown on the card). */
  hours?: string;
  credentialUrl?: string;
  /** Downloadable PDF (lives in /public/certs/). */
  pdfUrl?: string;
  /** Thumbnail preview (lives in /public/certs/previews/). */
  preview?: string;
  /** Issuer logo (lives in /public/certs/logos/). Shown when there's no
   *  PDF preview to display - still gives the card a real brand anchor. */
  logoUrl?: string;
  credentialId?: string;
  /** Skills badges LinkedIn shows under the cert. */
  skills?: string[];
}

const CERTIFICATIONS: Certification[] = [
  {
    name: "Understanding Micro Futures Contracts at CME Group",
    issuer: "CME Group Institute",
    date: "April 2026",
    color: "#003a7c",
    pdfUrl: "/certs/CME-Yield-Futures-Overview.pdf",
    preview: "/certs/previews/CME-Yield-Futures-Overview.pdf.png",
    skills: ["Futures", "Yield Curve", "Derivatives"],
  },
  {
    name: "Long Options: Underlying and Volatility Impact",
    issuer: "CME Group Institute",
    date: "April 2026",
    color: "#003a7c",
    pdfUrl: "/certs/CME-Long-Put-Scenarios.pdf",
    preview: "/certs/previews/CME-Long-Put-Scenarios.pdf.png",
    skills: ["Options", "Volatility", "Risk Management"],
  },
  {
    name: "Financial Modeling & Valuation Analyst (FMVA®)",
    issuer: "Corporate Finance Institute · CFI",
    date: "February 2026",
    hours: "120+ hrs",
    color: "#0a66c2",
    credentialId: "173438459",
    credentialUrl:
      "https://www.credential.net/96b9dd0d-6d93-4b23-a2a4-8add42247796",
    pdfUrl: "/certs/FMVA-Certificate.pdf",
    preview: "/certs/previews/FMVA-Certificate.pdf.png",
    skills: ["Financial Modeling", "Financial Analysis"],
  },
  {
    name: "Data Analyst Associate",
    issuer: "DataCamp",
    date: "February 2026",
    hours: "90+ hrs",
    color: "#03ef62",
    credentialId: "DAA0019862871924",
    pdfUrl: "/certs/DataCamp-Associate-Data-Analyst.pdf",
    preview: "/certs/previews/DataCamp-Associate-Data-Analyst.pdf.png",
  },
  {
    name: "Associate Data Analyst in SQL",
    issuer: "DataCamp",
    date: "February 2026",
    hours: "39 hrs",
    color: "#03ef62",
    credentialId: "6da5e4b33786291572c28a2023f040fd227ae27f",
    pdfUrl: "/certs/DataCamp-Associate-DA-SQL.pdf",
    preview: "/certs/previews/DataCamp-Associate-DA-SQL.pdf.png",
    skills: ["SQL"],
  },
  {
    name: "Goldman Sachs - Operations Job Simulation",
    issuer: "Forage",
    date: "January 2026",
    hours: "~6 hrs",
    color: "#1e6fe8",
    credentialId: "LqsbGRE6DkzThEfuC",
    credentialUrl:
      "https://www.theforage.com/simulations/goldman-sachs/operations-kbw8",
    logoUrl: "/certs/logos/logo-forage.png",
  },
  {
    name: "Python Programming Fundamentals",
    issuer: "DataCamp",
    date: "January 2026",
    hours: "13 hrs",
    color: "#03ef62",
    credentialId: "dea05992fca8caf6b7f6b41b9d14350cc87fd0f4",
    pdfUrl: "/certs/DataCamp-Python-Fundamentals.pdf",
    preview: "/certs/previews/DataCamp-Python-Fundamentals.pdf.png",
    skills: ["Python (Programming Language)"],
  },
  {
    name: "AI Fundamentals Certificate",
    issuer: "DataCamp",
    date: "January 2026",
    hours: "4 hrs",
    color: "#03ef62",
    credentialId: "AIF0021171335639",
    pdfUrl: "/certs/DataCamp-AI-Fundamentals.pdf",
    preview: "/certs/previews/DataCamp-AI-Fundamentals.pdf.png",
  },
  {
    name: "Level 2: Excel Yellow Belt",
    issuer: "McGraw Hill",
    date: "December 2025",
    hours: "8 hrs",
    color: "#d00018",
    credentialId: "168655981",
    credentialUrl:
      "https://www.credly.com/users/will-zhang",
  },
  {
    name: "Meta Social Media Marketing (Professional Certificate)",
    issuer: "Meta · Coursera",
    date: "November 2025",
    hours: "100+ hrs (5 courses)",
    color: "#0866ff",
    credentialId: "07DUM9HDBR7H",
    credentialUrl:
      "https://www.coursera.org/account/accomplishments/specialization/07DUM9HDBR7H",
    pdfUrl: "/certs/Coursera-Meta-Social-Media-Marketing.pdf",
    preview: "/certs/previews/Coursera-Meta-Social-Media-Marketing.pdf.png",
  },
  {
    name: "Fundamentals of Quantitative Modeling",
    issuer: "University of Pennsylvania · Coursera",
    date: "November 2025",
    hours: "16 hrs",
    color: "#9d1a3b",
    credentialId: "CESOX7NIGJ3G",
    credentialUrl:
      "https://www.coursera.org/account/accomplishments/certificate/CESOX7NIGJ3G",
    logoUrl: "/certs/logos/logo-upenn.png",
  },
  {
    name: "Chinese - Seal of Biliteracy",
    issuer: "New Jersey Department of Education",
    date: "June 2024",
    color: "#1f2e5c",
    logoUrl: "/certs/logos/logo-nj-seal.png",
  },
];

/* --------------------------------------------------------------
   Skills - rendered as a real Excel grid (column letters, row
   numbers, selectable cells, formula bar). Mirrors the Skills sheet
   in WillZhang.xlsx so every category from the workbook is visible
   on the About page without opening Excel.
   -------------------------------------------------------------- */
interface SkillRow {
  category: string;
  stack: string;
}

// Rows 2-8 in the image: hard skills
const HARD_SKILL_ROWS: SkillRow[] = [
  {
    category: "Modeling & Finance",
    stack:
      "DCF · 3-Statement · FMVA® · UPenn Quant Modeling · multifamily underwriting (Project Destined)",
  },
  {
    category: "Data & Analytics",
    stack:
      "Python · SQL · Tableau · Power BI · Excel (Yellow Belt) · Google Sheets",
  },
  {
    category: "AI & ML",
    stack:
      "Claude Code · AI SubAgents · Prompt Engineering (few-shot, constraint-setting) · AI Prompting · AI Management · AI Equity Research · Retrieval-Augmented Generation (RAG) · ATS model training (200k resumes) · OpenAI + ElevenLabs agents",
  },
  {
    category: "Engineering",
    stack:
      "HTML · CSS · JavaScript · TypeScript · Next.js · React 18 · Vite · Node.js + Express + Prisma · Supabase · Framer Motion · Raspberry Pi 4 (PhilAIsion kiosk) · Google Cloud Platform · Web Hosting · Terminal Server",
  },
  {
    category: "Sales & Growth",
    stack:
      "Booth-based sales (Vovex $20k+, 60% engagement lift) · SMB consulting (Local Launch, 10 sites, 300%+ SEO lift) · Meta Social Media Marketing · Google Ads",
  },
  {
    category: "Design & Ops",
    stack: "Figma · Canva · Microsoft Office · Google Workspace",
  },
  {
    category: "Languages",
    stack: "English (native) · Mandarin Chinese (Seal of Biliteracy)",
  },
];

// Soft skills - appear below hard skills under a merged "Soft Skills" header
const SOFT_SKILL_ROWS: SkillRow[] = [
  {
    category: "Leadership",
    stack: "7-person distributed team across UVA, UMD, Purdue, MIT",
  },
  {
    category: "Public Speaking",
    stack: "11 events · 1,400+ students reached · 7 live competition pitches",
  },
  {
    category: "Operations",
    stack: "Cross-continental coordination (US / China / PA)",
  },
  {
    category: "Writing",
    stack: "Journal every trading day · 65+ market entries logged",
  },
  {
    category: "Judgment",
    stack: "Junior-golf background - shotmaking under pressure",
  },
  {
    category: "Communication",
    stack: "Honest - flag limits + ask for feedback fast",
  },
];

export default function About({ window: _ }: { window: WindowState }) {
  const [lightbox, setLightbox] = useState<LightboxData | null>(null);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  return (
    <LightboxContext.Provider value={{ open: (d) => setLightbox(d) }}>
    <div className="relative h-full w-full flex flex-col overflow-hidden">
    <div className="flex-1 min-h-0 flex flex-col bg-[color:var(--color-win-bg)] overflow-auto win-scroll">
      {/* Hero with banner backdrop */}
      <div
        className="relative border-b border-[#808080]"
        style={{
          backgroundImage: "url(/linkedin/banner.jpg)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div
          className="flex gap-[16px] p-[16px] items-end"
          style={{
            background:
              "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.35) 70%, rgba(0,0,0,0.55) 100%)",
            minHeight: 180,
          }}
        >
          <div
            className="w-[120px] h-[120px] shrink-0 flex items-center justify-center overflow-hidden"
            style={{
              background: "#fff",
              border: "3px solid #fff",
              boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
            }}
          >
            <img
              src="/will-zhang.jpg"
              alt="Will Zhang"
              width={120}
              height={120}
              style={{ objectFit: "cover", width: "100%", height: "100%" }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
          <div className="flex-1 min-w-0 text-white">
            <div className="text-[24px] font-bold leading-tight drop-shadow">
              Will Zhang
            </div>
            <div className="text-[20px] mt-[2px] drop-shadow opacity-95">
              Philadelphia, PA
            </div>
          </div>
        </div>
      </div>

      {/* Quick stats - GPA, school, status */}
      <div className="p-[16px] border-b border-[#808080] bg-white">
        <div
          className="grid gap-[8px]"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          }}
        >
          <Stat label="GPA" value="4.0 / 4.0" hint="Dean's List · Dec 2025 – Present" />
          <Stat label="School" value="Drexel LeBow" hint="B.S. Business Admin · Analytics + Marketing" />
          <Stat label="Grad" value="June 2029" hint="Fall / Winter co-op track" />
          <Stat label="Location" value="Philadelphia, PA" hint="+ SoCal / China travel" />
        </div>
      </div>

      {/* About (Will's own words) */}
      <div className="p-[16px] border-b border-[#808080]">
        <div className="font-bold text-[18px] mb-[6px]">About</div>
        <p className="text-[20px] leading-relaxed italic text-[#333] mb-[6px]">
          &quot;Work with heart, and let&apos;s build a strong, supportive community
          where people can help each other thrive.&quot;
        </p>
        <p className="text-[20px] leading-relaxed italic text-[#333] mb-[6px]">
          &quot;Courage is not the absence of fear, but the will to move forward
          despite it.&quot;
        </p>
        <p className="text-[20px] leading-relaxed italic text-[#333]">
          Dream big, learn fast.
        </p>
      </div>

      {/* Skills - rendered as a live Excel grid */}
      <div className="p-[16px] border-b border-[#808080]">
        <div className="flex items-baseline justify-between gap-[8px] mb-[6px]">
          <div className="font-bold text-[18px]">Skills</div>
          <div className="text-[15px] italic text-[color:var(--color-win-text-disabled)]">
            Skills.xlsx · click any cell →{" "}
            <button
              type="button"
              onClick={() => openApp("excel", { initialSheet: "skills" })}
              className="underline text-[#0000ee] bg-transparent"
            >
              open full workbook
            </button>
          </div>
        </div>
        <SkillsExcel />
      </div>

      {/* Licenses & Certifications */}
      <div className="p-[16px] border-b border-[#808080]">
        <div className="font-bold text-[18px] mb-[6px]">
          Licenses &amp; Certifications
        </div>
        <div
          className="grid gap-[10px]"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          }}
        >
          {CERTIFICATIONS.map((c) => (
            <div
              key={c.name}
              className="win-sunken bg-white p-[6px] flex flex-col gap-[6px]"
            >
              {/* Preview thumbnail */}
              <div
                className="win-sunken relative"
                style={{
                  aspectRatio: "4 / 3",
                  background: "#f0f0f0",
                  overflow: "hidden",
                }}
              >
                {c.preview ? (
                  <img
                    src={c.preview}
                    alt={c.name}
                    loading="lazy"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      objectPosition: "top center",
                      display: "block",
                    }}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : c.logoUrl ? (
                  <div
                    className="flex items-center justify-center w-full h-full"
                    style={{ background: "#ffffff", padding: 12 }}
                  >
                    <img
                      src={c.logoUrl}
                      alt={c.issuer}
                      loading="lazy"
                      style={{
                        maxWidth: "100%",
                        maxHeight: "100%",
                        width: "auto",
                        height: "auto",
                        objectFit: "contain",
                        display: "block",
                      }}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                ) : (
                  <div
                    className="flex items-center justify-center w-full h-full font-bold text-[40px] text-white"
                    style={{ background: c.color }}
                  >
                    ★
                  </div>
                )}
                <span
                  className="absolute top-[4px] left-[4px] px-[5px] py-[1px] text-[13px] font-bold uppercase text-white"
                  style={{ background: c.color, letterSpacing: "0.4px" }}
                >
                  {c.pdfUrl ? "Earned" : "In progress"}
                </span>
              </div>

              {/* Metadata */}
              <div className="flex items-start gap-[8px] px-[2px]">
                <div
                  className="w-[32px] h-[32px] shrink-0 flex items-center justify-center text-white font-bold text-[17px]"
                  style={{ background: c.color, borderRadius: 4 }}
                  aria-hidden
                >
                  ★
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[17px] leading-snug">
                    {c.name}
                  </div>
                  <div className="text-[15px] text-[#444]">{c.issuer}</div>
                  <div className="text-[14px] text-[color:var(--color-win-text-disabled)] break-all">
                    {c.date}
                    {c.credentialId && <> · ID {c.credentialId}</>}
                  </div>
                  <div className="flex items-center gap-[4px] flex-wrap mt-[4px]">
                    {c.hours && (
                      <span
                        className="inline-block px-[6px] py-[1px] text-[13px] font-bold uppercase tracking-wide text-white"
                        style={{ background: c.color, borderRadius: 2 }}
                      >
                        ⏱ {c.hours}
                      </span>
                    )}
                    {c.skills?.map((s) => (
                      <span
                        key={s}
                        className="inline-block px-[6px] py-[1px] text-[13px] border"
                        style={{
                          borderColor: c.color,
                          color: c.color,
                          background: "#f8f8f8",
                          borderRadius: 2,
                        }}
                      >
                        ◆ {s}
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-[8px] mt-[4px]">
                    {c.credentialUrl && (
                      <a
                        href={c.credentialUrl}
                        target="_blank"
                        rel="noopener"
                        className="text-[15px] underline text-[#0000ee]"
                      >
                        Verify ↗
                      </a>
                    )}
                    {c.pdfUrl && (
                      <a
                        href={c.pdfUrl}
                        target="_blank"
                        rel="noopener"
                        className="text-[15px] underline text-[#0000ee]"
                        download
                      >
                        Download PDF ↓
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="text-[16px] italic text-[color:var(--color-win-text-disabled)] mt-[6px]">
          Source:{" "}
          <a
            href="https://www.linkedin.com/in/willzhang6200/details/certifications/"
            target="_blank"
            rel="noopener"
            className="underline text-[#0000ee]"
          >
            LinkedIn · /details/certifications
          </a>
        </div>
      </div>

      {/* Golf chapter - sits between Certifications and Experience so the
          "where I came from" context leads directly into the work history. */}
      <div className="p-[16px] border-b border-[#808080]">
        <div className="font-bold text-[18px] mb-[6px]">Before all of this</div>
        <p className="text-[20px] leading-relaxed mb-[6px]">
          I grew up as a competitive junior golfer:{" "}
          <b>3× 2nd and 2× 3rd</b> on the PGA Southern California Junior Tour,{" "}
          <b>2× 2nd</b> on the Philadelphia Section PGA Junior Tour,{" "}
          <b>1× 2nd</b> on the TYGA (Tarheel Youth Golf Association, NC), and{" "}
          <b>2× podium</b> in China national junior tournaments.
        </p>
        <p className="text-[20px] leading-relaxed mb-[6px]">
          I had to stop competing after a lower-back injury and a slipped-disc
          diagnosis. The torque of a competitive swing made it impossible to
          keep playing at that level.
        </p>
        <p className="text-[20px] leading-relaxed italic text-[#555]">
          I still think about approach shots when I&apos;m solving problems. Super
          Lychee Golf Series (ops) and the CNIPA Multi-Purpose Golf Bag patent
          both grew out of this chapter.{" "}
          <button
            type="button"
            className="underline text-[#0000ee] bg-transparent"
            onClick={() => openApp("golf-memories")}
          >
            Open Golf Memories →
          </button>
        </p>
      </div>

      {/* Experience - LinkedIn-style role cards */}
      <div className="p-[16px]">
        <div className="flex items-baseline justify-between gap-[8px] mb-[8px]">
          <div className="font-bold text-[18px]">Experience</div>
          <div className="text-[15px] italic text-[color:var(--color-win-text-disabled)]">
            {EXPERIENCES.length} roles · mirrors linkedin.com/in/willzhang6200/details/experience/
          </div>
        </div>
        <div className="flex flex-col gap-[10px]">
          {EXPERIENCES.map((e) => (
            <ExperienceCard key={e.company + e.role} exp={e} />
          ))}
        </div>
      </div>

      {/* CTAs */}
      <div className="p-[16px] border-t border-[#808080] flex gap-[6px] flex-wrap">
        <button
          type="button"
          className="win-btn"
          onClick={() => openApp("excel")}
        >
          Open WillZhang.xlsx
        </button>
        <button
          type="button"
          className="win-btn"
          onClick={() => openApp("projects")}
        >
          Projects
        </button>
        <button
          type="button"
          className="win-btn"
          onClick={() => openApp("speaking")}
        >
          Public Speaking
        </button>
        <button
          type="button"
          className="win-btn"
          onClick={() => openApp("resume")}
        >
          Resume.pdf
        </button>
        <button
          type="button"
          className="win-btn"
          onClick={() => openApp("contact")}
        >
          Contact Me
        </button>
      </div>
    </div>

    {/* Lightbox overlay - lives OUTSIDE the scrollable content so it pins
        to the window viewport regardless of scroll position. Click outside
        / × / Esc to close. */}
    {lightbox && (
      <div
        className="absolute inset-0 z-50 flex items-stretch justify-center p-[16px]"
        style={{ background: "rgba(0,0,0,0.78)" }}
        onClick={() => setLightbox(null)}
        role="dialog"
        aria-label={lightbox.title}
      >
        {/* Inner column that respects parent flex bounds so the image never
            overflows the About window viewport. */}
        <div
          className="win-window bg-white p-[4px] flex flex-col gap-[6px]"
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "100%",
            maxWidth: "100%",
            maxHeight: "100%",
            minHeight: 0,
          }}
        >
          <div
            className="win-sunken flex items-center justify-center flex-1 min-h-0"
            style={{ background: "#000" }}
          >
            <img
              src={lightbox.src}
              alt={lightbox.title ?? ""}
              style={{
                display: "block",
                maxWidth: "100%",
                maxHeight: "100%",
                width: "auto",
                height: "auto",
                objectFit: "contain",
              }}
            />
          </div>
          <div className="px-[8px] pb-[4px] flex items-center gap-[10px] text-[17px] shrink-0">
            <div className="flex-1 min-w-0">
              {lightbox.title && (
                <div className="font-bold text-[17px] leading-tight truncate">
                  {lightbox.title}
                </div>
              )}
              {lightbox.caption && (
                <div className="text-[15px] text-[color:var(--color-win-text-disabled)] leading-snug line-clamp-2">
                  {lightbox.caption}
                </div>
              )}
            </div>
            <button
              type="button"
              className="win-btn shrink-0"
              onClick={() => setLightbox(null)}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )}
    </div>
    </LightboxContext.Provider>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="win-sunken bg-white p-[8px] flex flex-col gap-[1px]">
      <div className="text-[15px] font-bold uppercase tracking-wide text-[color:var(--color-win-text-disabled)]">
        {label}
      </div>
      <div className="font-bold text-[20px] leading-tight">{value}</div>
      {hint && (
        <div className="text-[16px] text-[#555] leading-snug">{hint}</div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------
   SkillsExcel - renders the Skills section as a real Excel grid
   (column letters A/B, row numbers, selectable cells, formula bar).
   Matches WillZhang.xlsx "Skills" sheet 1:1.
   -------------------------------------------------------------- */
type SkillCellMap = Record<string, { value: string; bg?: string; bold?: boolean; italic?: boolean; color?: string; merged?: boolean }>;

function SkillsExcel() {
  // Build the cell map declaratively so the grid mirrors the xlsx sheet.
  const { cells, maxRow } = (() => {
    const c: SkillCellMap = {};
    const H = "#c0c0c0";
    const SUB = "#e8e8e8";

    c.A1 = { value: "Category", bold: true, bg: H };
    c.B1 = { value: "Stack", bold: true, bg: H };

    let r = 2;
    for (const row of HARD_SKILL_ROWS) {
      c[`A${r}`] = { value: row.category, bold: true, bg: SUB };
      c[`B${r}`] = { value: row.stack };
      r++;
    }

    // Blank spacer row
    r++;

    // Soft skills section header (merged across A+B)
    c[`A${r}`] = {
      value: "Soft Skills",
      bold: true,
      bg: H,
      merged: true,
    };
    r++;

    for (const row of SOFT_SKILL_ROWS) {
      c[`A${r}`] = { value: row.category, bold: true, bg: SUB };
      c[`B${r}`] = { value: row.stack };
      r++;
    }

    // Trailing italic note
    r++;
    c[`A${r}`] = {
      value:
        "// Stack philosophy: learn the tool, ship the thing, verify with the data.",
      italic: true,
      color: "#555",
      merged: true,
    };

    return { cells: c, maxRow: r };
  })();

  const [selected, setSelected] = useState<string>("A2");
  const selCol = selected[0] as "A" | "B";
  const selRow = parseInt(selected.slice(1), 10);
  const selCell = cells[selected];
  const formulaDisplay = selCell?.value ?? "";

  return (
    <div
      className="win-window bg-white flex flex-col"
      style={{ padding: 2 }}
    >
      {/* Formula bar - cell ref + fx + value */}
      <div className="flex items-stretch h-[30px] win-raised border-b border-[#808080]">
        <div className="win-field flex items-center justify-between px-[4px] w-[74px] text-[15px] font-[var(--font-cell)] border-r border-[#808080]">
          <span className="truncate">{selected}</span>
          <span
            className="shrink-0 pl-[2px] text-[color:var(--color-win-text-disabled)]"
            style={{ fontSize: 10, lineHeight: 1 }}
            aria-hidden
          >
            ▾
          </span>
        </div>
        <div
          className="win-btn h-[30px] min-w-0 w-[26px] px-0 flex items-center justify-center"
          aria-hidden
        >
          <span style={{ color: "#c00", fontWeight: 700, fontSize: 14 }}>✕</span>
        </div>
        <div
          className="win-btn h-[30px] min-w-0 w-[26px] px-0 flex items-center justify-center"
          aria-hidden
        >
          <span style={{ color: "#087f23", fontWeight: 700, fontSize: 14 }}>✓</span>
        </div>
        <div
          className="win-btn h-[30px] min-w-0 w-[28px] px-0 flex items-center justify-center"
          aria-hidden
        >
          <span
            style={{ fontFamily: "Georgia, serif", fontSize: 13, fontStyle: "italic", fontWeight: 700 }}
          >
            fx
          </span>
        </div>
        <div
          className="win-field flex-1 flex items-center px-[6px] text-[15px] font-[var(--font-cell)] truncate"
          title={formulaDisplay}
        >
          {formulaDisplay}
        </div>
      </div>

      {/* Grid - no inner scroll; the About window handles vertical scroll */}
      <div className="win-scroll">
        <table
          className="excel-grid"
          style={{ width: "100%", tableLayout: "fixed" }}
        >
          <colgroup>
            <col style={{ width: 44 }} />
            <col style={{ width: 220 }} />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th
                className="sticky top-0 left-0 z-20"
                style={{ width: 44, height: 28, minWidth: 44 }}
                aria-hidden
              />
              <th
                className="sticky top-0 z-10"
                style={{ width: 220, minWidth: 220, height: 28 }}
                data-selected={selCol === "A"}
              >
                A
              </th>
              <th
                className="sticky top-0 z-10"
                style={{ height: 28 }}
                data-selected={selCol === "B"}
              >
                B
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxRow }).map((_, rIdx) => {
              const rowNum = rIdx + 1;
              const aRef = `A${rowNum}`;
              const bRef = `B${rowNum}`;
              const aCell = cells[aRef];
              const bCell = cells[bRef];
              const merged = aCell?.merged;

              // Split Stack text on " · " so each sub-skill sits on its own
              // line inside the cell. Excel "Wrap Text" behavior: cell grows
              // vertically, nothing is cut off even in a narrow window.
              const bLines =
                bCell?.value && bCell.value.includes(" · ")
                  ? bCell.value.split(" · ")
                  : bCell?.value != null
                    ? [bCell.value]
                    : [];
              const wrap = bLines.length > 1;

              return (
                <tr key={rowNum}>
                  <th
                    className="sticky left-0 z-10"
                    style={{ width: 44, minWidth: 44, verticalAlign: "top" }}
                    data-selected={selRow === rowNum}
                  >
                    {rowNum}
                  </th>
                  <td
                    data-cell-ref={aRef}
                    data-selected={selected === aRef}
                    onClick={() => setSelected(aRef)}
                    colSpan={merged ? 2 : undefined}
                    style={{
                      background: aCell?.bg,
                      fontWeight: aCell?.bold ? "bold" : undefined,
                      fontStyle: aCell?.italic ? "italic" : undefined,
                      color: aCell?.color,
                      cursor: aCell ? "cell" : "default",
                      verticalAlign: "top",
                      whiteSpace: merged ? "normal" : undefined,
                      lineHeight: merged ? 1.35 : undefined,
                      padding: merged ? "4px 6px" : undefined,
                      height: merged ? "auto" : undefined,
                    }}
                  >
                    {aCell?.value ?? ""}
                  </td>
                  {!merged && (
                    <td
                      data-cell-ref={bRef}
                      data-selected={selected === bRef}
                      onClick={() => setSelected(bRef)}
                      style={{
                        background: bCell?.bg,
                        fontWeight: bCell?.bold ? "bold" : undefined,
                        fontStyle: bCell?.italic ? "italic" : undefined,
                        color: bCell?.color,
                        cursor: bCell ? "cell" : "default",
                        verticalAlign: "top",
                        whiteSpace: wrap ? "normal" : undefined,
                        lineHeight: wrap ? 1.4 : undefined,
                        padding: wrap ? "4px 6px" : undefined,
                        height: wrap ? "auto" : undefined,
                        overflow: wrap ? "visible" : undefined,
                        textOverflow: wrap ? "clip" : undefined,
                      }}
                    >
                      {wrap ? (
                        bLines.map((line, i) => (
                          <div key={i} style={{ padding: "1px 0" }}>
                            {line}
                          </div>
                        ))
                      ) : (
                        bCell?.value ?? ""
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Sheet tab strip - "Skills" tab active, visual parity with Excel */}
      <div
        className="flex items-center gap-[2px] px-[4px] py-[2px] border-t border-[#808080]"
        style={{ background: "#c0c0c0" }}
      >
        <div
          className="win-raised px-[8px] py-[2px] text-[14px] font-bold bg-white"
          style={{ borderBottom: "2px solid #fff" }}
        >
          Skills
        </div>
        <button
          type="button"
          onClick={() => openApp("excel")}
          className="px-[8px] py-[2px] text-[14px] bg-[#c0c0c0] hover:bg-[#d0d0d0] cursor-pointer border-0"
          style={{ fontFamily: "var(--font-cell)" }}
        >
          Overview
        </button>
        <button
          type="button"
          onClick={() => openApp("excel")}
          className="px-[8px] py-[2px] text-[14px] bg-[#c0c0c0] hover:bg-[#d0d0d0] cursor-pointer border-0"
          style={{ fontFamily: "var(--font-cell)" }}
        >
          Experience
        </button>
        <button
          type="button"
          onClick={() => openApp("excel")}
          className="px-[8px] py-[2px] text-[14px] bg-[#c0c0c0] hover:bg-[#d0d0d0] cursor-pointer border-0"
          style={{ fontFamily: "var(--font-cell)" }}
        >
          Projects
        </button>
        <div className="flex-1" />
        <div className="text-[13px] text-[color:var(--color-win-text-disabled)] px-[4px]">
          Ready
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------
   ExperienceCard - LinkedIn-style role detail card with logo,
   title, company, dates, location, description, media gallery,
   and skill chips. One card per work experience.
   -------------------------------------------------------------- */
function ExperienceCard({ exp }: { exp: Experience }) {
  const lightbox = useLightbox();
  return (
    <div
      className="win-window bg-white p-[12px] flex flex-col gap-[8px]"
      style={{
        background: exp.accent ? "#fffbe8" : "#ffffff",
      }}
    >
      {/* Header: logo + title block */}
      <div className="flex items-start gap-[12px]">
        {/* Logo / badge */}
        {exp.companyLogo ? (
          <div
            className="win-sunken shrink-0 bg-white overflow-hidden"
            style={{ width: 56, height: 56 }}
          >
            <img
              src={exp.companyLogo}
              alt={exp.company}
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
        ) : (
          <div
            className="shrink-0 flex items-center justify-center font-bold text-white"
            style={{
              width: 56,
              height: 56,
              background: exp.companyBadgeColor ?? "#555",
              borderRadius: 4,
              fontSize: 28,
            }}
            aria-hidden
          >
            {exp.companyBadgeInitial ?? "•"}
          </div>
        )}
        {/* Title / company / dates */}
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[19px] leading-tight">{exp.role}</div>
          <div className="text-[17px]">
            {exp.company}
            {exp.employmentType && (
              <>
                {" · "}
                <span className="text-[color:var(--color-win-text-disabled)]">
                  {exp.employmentType}
                </span>
              </>
            )}
          </div>
          <div className="text-[15px] text-[color:var(--color-win-text-disabled)]">
            {exp.dates}
          </div>
          {(exp.location || exp.onsite) && (
            <div className="text-[15px] text-[color:var(--color-win-text-disabled)]">
              {[exp.location, exp.onsite].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
      </div>

      {/* Sub-roles (e.g. Good Idea Fund has two roles) */}
      {exp.subRoles && exp.subRoles.length > 0 && (
        <div className="pl-[12px] border-l-2 border-[#c0c0c0] ml-[24px] flex flex-col gap-[6px]">
          {exp.subRoles.map((sr) => (
            <div key={sr.role + sr.dates}>
              <div className="font-bold text-[16px]">{sr.role}</div>
              <div className="text-[14px] text-[color:var(--color-win-text-disabled)]">
                {sr.dates}
              </div>
              {sr.description && (
                <div className="text-[16px] mt-[2px]">{sr.description}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Description */}
      {exp.description && (
        <div className="text-[17px] leading-relaxed text-[#222]">
          {exp.description}
        </div>
      )}

      {/* Media attachments - clickable thumbnails */}
      {exp.media && exp.media.length > 0 && (
        <div className="flex flex-col gap-[6px] mt-[2px]">
          {exp.media.map((m, i) => {
            const key = (m.src ?? m.title) + i;
            const clickable = !!m.src;
            const Thumb = (
              <div
                className="win-sunken shrink-0 bg-white overflow-hidden relative flex items-center justify-center"
                style={{
                  width: 140,
                  height: 105,
                  background: m.src ? "#fff" : "#eef3f8",
                  cursor: clickable ? "pointer" : "default",
                }}
              >
                {m.src ? (
                  <img
                    src={m.src}
                    alt={m.title}
                    loading="lazy"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                    onError={(e) => {
                      const el = e.currentTarget as HTMLImageElement;
                      el.style.display = "none";
                      const sib = el.nextElementSibling as HTMLElement | null;
                      if (sib) sib.style.display = "flex";
                    }}
                  />
                ) : null}
                <div
                  className="absolute inset-0 items-center justify-center flex-col text-center p-[6px]"
                  style={{
                    display: m.src ? "none" : "flex",
                    color: "#0a66c2",
                    background: "#eef3f8",
                  }}
                >
                  <div style={{ fontSize: 22, lineHeight: 1 }}>📎</div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      marginTop: 2,
                      lineHeight: 1.1,
                    }}
                  >
                    Media
                  </div>
                </div>
                {clickable && (
                  <span
                    className="absolute bottom-[2px] right-[2px] text-white text-[12px] font-bold px-[4px] py-[1px]"
                    style={{
                      background: "rgba(0,0,0,0.55)",
                      borderRadius: 2,
                    }}
                    aria-hidden
                  >
                    ⤢
                  </span>
                )}
              </div>
            );
            return (
              <div key={key} className="flex items-start gap-[10px]">
                {clickable && lightbox ? (
                  <button
                    type="button"
                    onClick={() =>
                      lightbox.open({
                        src: m.src!,
                        title: m.title,
                        caption: m.caption,
                      })
                    }
                    className="p-0 bg-transparent border-0 text-left hover:opacity-90"
                    title={`Open "${m.title}" full size`}
                    aria-label={`Open "${m.title}" full size`}
                  >
                    {Thumb}
                  </button>
                ) : (
                  Thumb
                )}
                <div className="flex-1 min-w-0 pt-[2px]">
                  <div className="font-bold text-[16px] leading-snug">
                    {m.title}
                  </div>
                  {m.caption && (
                    <div className="text-[15px] text-[#444] leading-snug mt-[1px]">
                      {m.caption}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Skill tags */}
      {exp.skills && exp.skills.length > 0 && (
        <div className="flex items-center gap-[6px] flex-wrap pt-[2px] text-[15px]">
          <span aria-hidden className="text-[14px]">
            ◈
          </span>
          <span className="font-bold text-[color:var(--color-win-text-disabled)] uppercase tracking-wide">
            Skills
          </span>
          {exp.skills.map((s) => (
            <span
              key={s}
              className="px-[6px] py-[1px] border border-[#808080]"
              style={{ background: "#f3f3f3" }}
            >
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
