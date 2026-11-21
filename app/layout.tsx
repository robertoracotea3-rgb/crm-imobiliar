import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter, Playfair_Display, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { canonicalHost, isPublicWebsiteHost } from "@/lib/site-host";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin", "latin-ext"], weight: ["400", "500", "600", "700"] });
// Public site UI text (filters, prices, body). latin-ext carries ș, ț, ă, â, î.
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin", "latin-ext"] });

export async function generateMetadata(): Promise<Metadata> {
  const host = (await headers()).get("host");
  return {
    metadataBase: new URL(canonicalHost()),
    title: { default: "Kira Imobiliare | Brașov și Făgăraș", template: "%s | Kira Imobiliare" },
    description: "Consultanță pentru vânzarea, cumpărarea și închirierea proprietăților în Brașov, Făgăraș și împrejurimi.",
    alternates: { canonical: "/" },
    // Only the real domain is indexed; Vercel previews and local copies are not.
    robots: isPublicWebsiteHost(host) ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: { type: "website", locale: "ro_RO", siteName: "Kira Imobiliare", title: "Kira Imobiliare | Brașov și Făgăraș", description: "Consultanță imobiliară pentru vânzare, cumpărare și închiriere.", url: canonicalHost() },
    twitter: { card: "summary_large_image", title: "Kira Imobiliare | Brașov și Făgăraș", description: "Consultanță imobiliară pentru vânzare, cumpărare și închiriere." },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ro" className={`${inter.variable} ${playfair.variable} ${jakarta.variable} h-full antialiased`}>
      <body className="min-h-full" style={{ backgroundColor: "#F6F3EE", fontFamily: "var(--font-jakarta), var(--font-inter), sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
