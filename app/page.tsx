import { headers } from 'next/headers';
import { CrmHomeRedirect } from '@/components/CrmHomeRedirect';
import { PublicHome } from '@/components/public/PublicHome';
import { isPublicWebsiteHost } from '@/lib/site-host';

export default async function Home() {
  const requestHeaders = await headers();
  const host = requestHeaders.get('host');
  return isPublicWebsiteHost(host) ? <PublicHome /> : <CrmHomeRedirect />;
}
