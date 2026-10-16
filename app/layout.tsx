import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Espressoulster Coffee",
  description: "Coffee, food, and your daily ritual. Order for pickup.",
  manifest: "/manifest.webmanifest",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
