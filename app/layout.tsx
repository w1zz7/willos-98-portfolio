import type { Metadata, Viewport } from "next";
import "./globals.css";

const DESCRIPTION =
  "Will Zhang - student founder. Co-founder, Bulletproof AI (75k+ monthly tool runs, 200k-resume ATS model). 1st place Philly CodeFest 2026. Processed $315,020 in equity trades with a 63.98% gain ratio across 267 logged trades (Aug 2025 – Apr 2026). Drexel B.S. Business Administration (Business Analytics + Marketing) · GPA 4.0 · Dean's List · Philadelphia, PA.";

export const metadata: Metadata = {
  title: "Will Zhang - WillOS 98",
  description: DESCRIPTION,
  authors: [
    { name: "Will Zhang", url: "https://www.linkedin.com/in/willzhang6200" },
  ],
  openGraph: {
    title: "Will Zhang - WillOS 98",
    description:
      "A portfolio built as a Windows 98 desktop. Open WillZhang.xlsx to explore.",
    type: "website",
    siteName: "WillOS 98",
  },
  twitter: {
    card: "summary_large_image",
    title: "Will Zhang - WillOS 98",
    description:
      "A portfolio built as a Windows 98 desktop. Open WillZhang.xlsx to explore.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#008080",
};

/**
 * Static SSR hero block - invisible but present in the DOM so crawlers,
 * accessibility tools, and link previewers have Will's name, headline,
 * key facts, and links even without executing the client bundle.
 */
function HiddenSEOContent() {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        width: 1,
        height: 1,
        padding: 0,
        margin: -1,
        overflow: "hidden",
        clip: "rect(0, 0, 0, 0)",
        whiteSpace: "nowrap",
        border: 0,
      }}
    >
      <h1>Will Zhang - Student Founder, Builder, Operator</h1>
      <p>{DESCRIPTION}</p>
      <ul>
        <li>Drexel University · B.S. Business Administration (Business Analytics + Marketing) · GPA 4.0 · Dean's List · Expected Graduation June 2029 · Philadelphia, PA</li>
        <li>Co-Founder, Bulletproof AI / Local Launch Studio Co. - Next.js / RAG / ATS model trained on 200,000 publicly sourced resumes. 75,000+ tool runs in Month 1 across 11 live AI tools.</li>
        <li>1st Place, Advanced Track - Philly CodeFest 2026 ($3,000 winner share, 370+ participants). Built PhilAIsion, an AI civic agent on a $50 Raspberry Pi 4 kiosk serving 700+ city services in 10 languages.</li>
        <li>Operations Team Lead, Super Lychee Golf Series - $85,000+ tuition collected; 8 FCG China Series events; 6-country athlete logistics.</li>
        <li>Sales & Marketing Intern, Vovex Golf - $20,000+ revenue, 120 units across 4 national tournaments.</li>
        <li>Event Operations Analyst Intern, Gen.G Esports - Tableau / Power BI analysis across 150+ esports tournaments.</li>
        <li>Director of Relations, The Good Idea Fund - evaluate 100+ student proposals for Drexel's largest student-run fund ($100,000+ annual pool).</li>
        <li>Venture Advisory + Sport Entertainment Consultant, Drexel Consulting Group - Gen Z content strategy for WOLF Financial (14.3M combined followers).</li>
        <li>Primary Technical Lead, Google Developer Group - CodeLab workshops on Machine Learning, AI Studio, SubAgents.</li>
        <li>CNIPA Utility Model Patent co-inventor - water-resistant golf bag (September 2024).</li>
        <li>Stock Portfolio - Processed $315,020 in equity trades using macro swing trading and achieved a 63.98% gain ratio across 267 logged trades (Aug 2025 – Apr 2026). Strategy validated via Excel tracker against S/R levels, moving averages, and momentum studies.</li>
        <li>Competitions: Jane Street Estimathon (3rd), Howley Finance (Finalist), Dean's Equity Research (Finalist), NJ Garden State Esports State Champion 2023 + 2024 ($40,000).</li>
      </ul>
      <p>
        Contact: <a href="mailto:wz363@drexel.edu">wz363@drexel.edu</a> · (267) 255-1163 · <a href="https://www.linkedin.com/in/willzhang6200">linkedin.com/in/willzhang6200</a> · <a href="/resume.pdf">Resume (PDF)</a>
      </p>
    </div>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <HiddenSEOContent />
        {children}
      </body>
    </html>
  );
}
