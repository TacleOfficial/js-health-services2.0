import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const image = `${protocol}://${host}/og.png`;
  return {
    title: { default: "Velle Research — documented by batch", template: "%s — Velle Research" },
    description: "A fictional premium research-commerce interface demonstrating batch transparency, restrained clinical design, and a safe demo checkout.",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: { title: "Velle Research — Precision begins with verification", description: "A fictional research-commerce interface concept.", type: "website", images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: "Velle Research — Precision begins with verification", description: "A fictional research-commerce interface concept.", images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${inter.variable} ${plexMono.variable}`}><body>{children}</body></html>;
}
