import type { Metadata, Viewport } from "next";
import { Source_Serif_4 } from "next/font/google";
import Link from "next/link";
import { ExternalLink } from "@/components/ExternalLink.tsx";
import { headScript, ThemeToggle } from "@/components/ThemeToggle.tsx";
import { contactEmail, publicSiteUrl, SITE_DESCRIPTION } from "@/core/site.ts";
import { FEED } from "@/lib/meta.ts";
import "./reset.css";
import "./globals.css";

/**
 * One typeface for everything, as in a printed document. The optical-size
 * axis gives headings their fine display cut; it costs about 150 KB more
 * than the weight axis alone.
 */
const serif = Source_Serif_4({
  variable: "--font-serif",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  display: "swap",
});

const homeTitle = "Fine Print: a public record of healthcare platforms’ terms";

export const metadata: Metadata = {
  metadataBase: new URL(publicSiteUrl()),
  title: { default: homeTitle, template: "%s · Fine Print" },
  description: SITE_DESCRIPTION,
  applicationName: "Fine Print",
  authors: [{ name: "Syed Muhammad Sannan", url: "https://syedsannan.com" }],
  creator: "Syed Muhammad Sannan",
  publisher: "Fine Print",
  category: "healthcare",
  // Pages that must stay out of search results (admin, newsletter links, receipts) say so themselves.
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large", "max-video-preview": -1 },
  },
  alternates: { types: FEED },
  openGraph: { siteName: "Fine Print", type: "website", locale: "en_US", title: homeTitle, description: SITE_DESCRIPTION, url: "/" },
  twitter: { card: "summary_large_image", title: homeTitle, description: SITE_DESCRIPTION },
  // Search Console and Bing Webmaster Tools ownership checks, when set (at build time).
  verification: {
    ...(process.env.FINEPRINT_GOOGLE_SITE_VERIFICATION ? { google: process.env.FINEPRINT_GOOGLE_SITE_VERIFICATION } : {}),
    ...(process.env.FINEPRINT_BING_SITE_VERIFICATION ? { other: { "msvalidate.01": process.env.FINEPRINT_BING_SITE_VERIFICATION } } : {}),
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf6" },
    { media: "(prefers-color-scheme: dark)", color: "#16150f" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const contact = contactEmail();
  return (
    <html lang="en" className={serif.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: headScript }} />
      </head>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <header className="masthead">
          <Link href="/" className="wordmark" aria-label="Fine Print, home">
            Fine <span>Print</span>
          </Link>
          <p className="motto">The terms you practice under, kept on the record</p>
          <nav aria-label="Main">
            <Link href="/#platforms">Platforms</Link>
            <Link href="/about">How it works</Link>
            <Link href="/submit">Share an agreement</Link>
            <ThemeToggle />
          </nav>
        </header>
        <main id="main">{children}</main>
        <footer className="colophon">
          <p>
            Fine Print is an independent, open-source archive. It is not legal advice and is not affiliated with any
            platform listed here. Always read the current agreement on the platform&rsquo;s own site before you sign.
          </p>
          <p>
            Corrections and questions: <a href={`mailto:${contact}`}>{contact}</a>.{" "}
            Powered by <ExternalLink href="https://syedsannan.com">syedsannan.com</ExternalLink>. All dates are in UTC.
          </p>
        </footer>
      </body>
    </html>
  );
}
