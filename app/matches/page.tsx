import { redirect } from 'next/navigation';

// Modulul „Cereri & potriviri" a fost unificat în „Clienți".
export default function MatchesRedirect() {
  redirect('/clients');
}
