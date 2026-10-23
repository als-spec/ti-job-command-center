import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TI Job Command Center",
  description: "Change orders, TI allowances and job margin for commercial build-out contractors.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#c2410c" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
