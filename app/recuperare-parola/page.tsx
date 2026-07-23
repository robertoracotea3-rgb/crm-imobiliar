import Link from 'next/link';
import { ArrowLeft, KeyRound } from 'lucide-react';

export const metadata = {
  title: 'Recuperare parolă — KIRA Imobiliare CRM',
  robots: 'noindex, nofollow',
};

export default function RecuperareParolaPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#F6F5F1' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8 flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo-kira.webp" alt="KIRA Imobiliare" width={360} height={240} className="h-24 w-auto mb-3" />
        </div>

        <div className="bg-white rounded-lg p-8 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
            <KeyRound size={22} style={{ color: '#0E6B54' }} />
          </div>
          <h1 className="text-xl font-bold mb-3 text-center" style={{ color: '#0E6B54' }}>Recuperare parolă</h1>
          <p className="text-sm text-gray-600 leading-relaxed mb-4">
            Conturile din CRM folosesc un nume de utilizator intern. Pentru resetarea parolei,
            contactează proprietarul sau administratorul agenției. Parola temporară se schimbă
            obligatoriu la prima autentificare, iar celelalte sesiuni sunt revocate.
          </p>
          <p className="text-xs text-gray-400 leading-relaxed mb-6">
            Nu trimitem linkuri de resetare către adresele tehnice <b>@fortis.crm</b>. Dacă ești
            deja autentificat, parola se schimbă din <b>Setări → Securitate</b>.
          </p>
          <Link href="/login" className="inline-flex items-center gap-2 text-sm font-medium hover:underline" style={{ color: '#0E6B54' }}>
            <ArrowLeft size={16} /> Înapoi la logare
          </Link>
        </div>
      </div>
    </div>
  );
}
