import type { Metadata } from "next";
import { connection } from "next/server";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import { Sidebar } from "@/components/Sidebar";
import { AuthProvider } from "@/lib/auth-context";

export const metadata: Metadata = {
  title: "KIRA Imobiliare — CRM",
  description: "Platforma de management imobiliar KIRA Imobiliare",
  // CRM privat — niciodată indexat/arhivat (inclusiv login/register).
  robots: 'noindex, nofollow, noarchive, nosnippet',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // CSP nonces are request-specific, so the authenticated CRM shell must render dynamically.
  await connection();

  return (
    <html lang="ro" className="h-full antialiased">
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
