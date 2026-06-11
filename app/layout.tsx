import type { Metadata } from "next";
import { Sora, Inter } from "next/font/google";
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

export const metadata: Metadata = {
  title: "CRM Imobiliar",
  description: "Platforma de management imobiliar pentru agentiile romanesti",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ro"
      className={`${sora.variable} ${inter.variable} h-full antialiased`}
    >
      <body
        className="min-h-full"
        style={{ backgroundColor: '#F6F5F1', fontFamily: 'var(--font-inter)' }}
      >
        <AuthProvider>
          <div className="flex flex-col md:flex-row min-h-full">
            <Sidebar />
            <main className="flex-1 md:ml-64 mb-20 md:mb-0">
              {children}
            </main>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
