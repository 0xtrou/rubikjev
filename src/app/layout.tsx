import type { Metadata, Viewport } from "next";
import { Amatic_SC, Geist_Mono, Nunito } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Font combo from bruno-simon.com: Amatic SC for the game-y display text,
// Nunito for UI, Geist Mono for bench numbers.
const nunito = Nunito({
  variable: "--font-sans",
  subsets: ["latin"],
});

const amatic = Amatic_SC({
  weight: ["400", "700"],
  variable: "--font-display",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_NAME = "Jev Solves The Cube";
const BASE_URL = "https://rubikjev.solo.engineer";
const DESCRIPTION =
  "Scramble a Rubik's cube like a menace and watch Jev, the in-house AI solver, judge and solve it live — meme tiers, difficulty stars, XP, badges and token-metered runs.";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: `${SITE_NAME} — AI-Gamified Rubik's Cube Challenge`,
    template: `%s · ${SITE_NAME}`,
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "Rubik's cube",
    "cube solver",
    "AI game",
    "Jev",
    "AI solver",
    "three.js",
    "scramble",
    "speedcube",
    "gamification",
  ],
  authors: [{ name: "khangtd09" }],
  creator: "khangtd09",
  category: "games",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — AI-Gamified Rubik's Cube Challenge`,
    description: DESCRIPTION,
    locale: "en_US",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Jev Solves The Cube — scramble the cube, let the AI solver Jev judge and solve it",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — AI-Gamified Rubik's Cube Challenge`,
    description: DESCRIPTION,
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  referrer: "origin-when-cross-origin",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a12",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_NAME,
  url: BASE_URL,
  applicationCategory: "GameApplication",
  operatingSystem: "Web",
  browserRequirements: "Requires WebGL",
  description: DESCRIPTION,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  isAccessibleForFree: true,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`dark ${nunito.variable} ${amatic.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#0a0a12]">
        {children}
        <Toaster position="bottom-center" richColors />
        <Analytics />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  );
}
