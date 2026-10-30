import type { Metadata } from "next";
import { headers } from "next/headers";
import { Sora, Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { AuthProvider } from "@/lib/auth-context";
import { canonicalHost, isPublicWebsiteHost } from "@/lib/site-host";

const sora = Sora({ variable: "--font-sora", subsets: ["latin"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin"], weight: ["700"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  const publicSite = isPublicWebsiteHost(host);

  if (publicSite) {
    return {
      metadataBase: new URL(canonicalHost(host)),
      title: { default: "Kira Imobiliare | Făgăraș și Brașov", template: "%s | Kira Imobiliare" },
      description: "Consultanță pentru vânzarea, cumpărarea și închirierea proprietăților în Făgăraș, împrejurimi și Brașov.",
      alternates: { canonical: "/" },
      robots: { index: true, follow: true },
      openGraph: { type: "website", locale: "ro_RO", siteName: "Kira Imobiliare", title: "Kira Imobiliare | Făgăraș și Brașov", description: "Consultanță imobiliară pentru vânzare, cumpărare și închiriere.", url: canonicalHost(host) },
      twitter: { card: "summary_large_image", title: "Kira Imobiliare | Făgăraș și Brașov", description: "Consultanță imobiliară pentru vânzare, cumpărare și închiriere." },
    };
  }

  return {
    title: "KIRA Imobiliare — CRM",
    description: "Platforma de management imobiliar KIRA Imobiliare",
    robots: { index: false, follow: false, noarchive: true },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  const publicSite = isPublicWebsiteHost(host);

  return (
    <html lang="ro" className={`${sora.variable} ${inter.variable} ${playfair.variable} h-full antialiased`}>
      {!publicSite && (
        <head>
          <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossOrigin="anonymous" />
        </head>
      )}
      <body className="min-h-full" style={{ backgroundColor: publicSite ? "#f7f6f2" : "#F6F5F1", fontFamily: "var(--font-inter)" }}>
        {publicSite ? (
          children
        ) : (
          <AuthProvider>
            <div className="flex min-h-full flex-col md:flex-row">
              <Sidebar />
              <main className="flex-1 pb-24 md:ml-64 md:pb-0">{children}</main>
            </div>
          </AuthProvider>
        )}
      </body>
    </html>
  );
}
