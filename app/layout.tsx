import type { Metadata } from "next";
import "./globals.css";
import "./version2-dark.css";
import "./version2-light.css";
import "./appearance.css";
import "./reel-theme.css";
import "./bottom-nav-glass.css";
import "./responsive-shell.css";
import {ThemeProvider} from './theme-provider';
import {themeBootstrap} from '../lib/appearance';

export const metadata: Metadata = {
  title: "Espressoulster Coffee",
  description: "Coffee, food, and your daily ritual. Order for pickup.",
  manifest: "/manifest.webmanifest",
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
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{__html:themeBootstrap}}/></head>
      <body className="antialiased"><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  );
}
