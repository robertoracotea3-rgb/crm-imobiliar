import { redirect } from 'next/navigation';

// Modulul Lead-uri a fost unificat în „Clienți".
export default function LeadsRedirect() {
  redirect('/clients');
}
