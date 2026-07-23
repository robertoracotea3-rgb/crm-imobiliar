import type { Metadata } from "next";
import { Sora, Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { AuthProvider } from "@/lib/auth-context";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["700"],
});

export const metadata: Metadata = {
  title: "KIRA Imobiliare — CRM",
  description: "Platforma de management imobiliar KIRA Imobiliare",
  // CRM privat — niciodată indexat/arhivat (inclusiv login/register).
  robots: 'noindex, nofollow, noarchive, nosnippet',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ro"
      className={`${sora.variable} ${inter.variable} ${playfair.variable} h-full antialiased`}
    >
      <head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          crossOrigin="anonymous"
        />
      </head>
      <body
        className="min-h-full"
        style={{ backgroundColor: '#F6F5F1', fontFamily: 'var(--font-inter)' }}
      >
        <AuthProvider>
          <div className="flex flex-col md:flex-row min-h-full">
            <Sidebar />
            <main className="min-w-0 w-full flex-1 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:ml-64 md:pb-0">
              {children}
            </main>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
