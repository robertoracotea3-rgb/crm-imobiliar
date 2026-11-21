import type { Metadata } from "next";
import { headers } from "next/headers";
import { Sora, Inter, Playfair_Display, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { AuthProvider } from "@/lib/auth-context";
import { canonicalHost, isPublicWebsiteHost } from "@/lib/site-host";

const sora = Sora({ variable: "--font-sora", subsets: ["latin"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin", "latin-ext"], weight: ["400", "500", "600", "700"] });
// Public site UI text (filters, prices, body). latin-ext carries ș, ț, ă, â, î.
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin", "latin-ext"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  const publicSite = isPublicWebsiteHost(host);

  if (publicSite) {
    return {
      metadataBase: new URL(canonicalHost(host)),
      title: { default: "Kira Imobiliare | Brașov și Făgăraș", template: "%s | Kira Imobiliare" },
      description: "Consultanță pentru vânzarea, cumpărarea și închirierea proprietăților în Brașov, Făgăraș și împrejurimi.",
      alternates: { canonical: "/" },
      robots: { index: true, follow: true },
      openGraph: { type: "website", locale: "ro_RO", siteName: "Kira Imobiliare", title: "Kira Imobiliare | Brașov și Făgăraș", description: "Consultanță imobiliară pentru vânzare, cumpărare și închiriere.", url: canonicalHost(host) },
      twitter: { card: "summary_large_image", title: "Kira Imobiliare | Brașov și Făgăraș", description: "Consultanță imobiliară pentru vânzare, cumpărare și închiriere." },
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
    <html lang="ro" className={`${sora.variable} ${inter.variable} ${playfair.variable} ${jakarta.variable} h-full antialiased`}>
      {!publicSite && (
        <head>
          <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossOrigin="anonymous" />
        </head>
      )}
      <body className="min-h-full" style={{ backgroundColor: publicSite ? "#F6F3EE" : "#F6F5F1", fontFamily: publicSite ? "var(--font-jakarta), var(--font-inter), sans-serif" : "var(--font-inter)" }}>
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
