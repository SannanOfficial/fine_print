import type { Metadata, Viewport } from "next";
import { Source_Serif_4 } from "next/font/google";
import Link from "next/link";
import { headScript, ThemeToggle } from "@/components/ThemeToggle.tsx";
import "./reset.css";
import "./globals.css";

/** One typeface for everything, as in a printed document. */
const serif = Source_Serif_4({
  variable: "--font-serif",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  display: "swap",
});

const siteUrl = process.env.FINEPRINT_SITE_URL ?? "https://fineprint.syedsannan.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Fine Print", template: "%s · Fine Print" },
  description:
    "An independent, public log of every change to the terms that EHRs, billing and credentialing services, telehealth networks and directories ask clinicians to accept, kept automatically and by clinicians themselves.",
  openGraph: { siteName: "Fine Print", type: "website" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf6" },
    { media: "(prefers-color-scheme: dark)", color: "#16150f" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
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
            Powered by <a href="https://syedsannan.com">syedsannan.com</a>. All dates are in UTC.
          </p>
        </footer>
      </body>
    </html>
  );
}
