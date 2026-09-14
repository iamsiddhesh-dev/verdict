import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { DESCRIPTION, PRODUCT_NAME, siteUrl, TAGLINE, X_HANDLE } from "@/lib/brand";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: { default: `${PRODUCT_NAME}: is this job worth applying to?`, template: `%s · ${PRODUCT_NAME}` },
  description: DESCRIPTION,
  applicationName: PRODUCT_NAME,
  keywords: ["job application", "resume tailoring", "job fit", "ATS resume", "cover letter", "job search", "LaTeX resume", "open source"],
  authors: [{ name: "Siddhesh Kasat" }],
  creator: "Siddhesh Kasat",
  openGraph: {
    type: "website",
    siteName: PRODUCT_NAME,
    title: `${PRODUCT_NAME}: is this job worth applying to?`,
    description: TAGLINE,
    url: "/",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: `${PRODUCT_NAME}: is this job worth applying to?`,
    description: TAGLINE,
    creator: X_HANDLE,
  },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-dvh font-sans text-[16px] leading-6">
        <a href="#main" className="sr-only rounded-sm bg-ink px-3 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
