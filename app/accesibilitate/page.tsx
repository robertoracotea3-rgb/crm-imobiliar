import type { Metadata } from 'next';
import { LegalPage } from '@/components/public/LegalPage';
export const metadata: Metadata = { title: 'Accesibilitate' };
export default function Page() { return <LegalPage title="Accesibilitate" intro="Ne dorim ca informațiile de pe site să poată fi folosite de cât mai multe persoane." sections={[["Angajamentul nostru", "Lucrăm la îmbunătățirea structurii paginilor, contrastului, navigării cu tastatura și descrierilor pentru imagini."], ["Raportarea unei probleme", "Dacă întâmpini o dificultate de accesibilitate, scrie la contact@kiraimobiliare.ro și menționează pagina și problema întâlnită. Vom încerca să oferim informația într-un format accesibil."]]}/>; }
