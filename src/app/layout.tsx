import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dota Balancer",
  description: "Split a pool of players into balanced teams and run the bracket.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-20 panel border-x-0 border-t-0">
          <nav className="mx-auto flex w-full max-w-6xl items-center gap-6 px-6 py-3.5">
            <Link href="/" className="flex items-baseline gap-2 font-extrabold tracking-tight">
              <span className="gradient-text text-xl">LounGee</span>
              <span className="hidden text-xs font-medium uppercase tracking-widest text-[var(--lg-lavender)]/70 sm:inline">
                Balancer
              </span>
            </Link>
            <div className="ml-auto flex items-center gap-1 text-sm">
              <Link
                href="/"
                className="rounded-full px-3 py-1.5 text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
              >
                Teams
              </Link>
              <Link
                href="/bracket"
                className="rounded-full px-3 py-1.5 text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
              >
                Bracket
              </Link>
            </div>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
