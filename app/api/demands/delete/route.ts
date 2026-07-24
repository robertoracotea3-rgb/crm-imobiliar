export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';

export async function DELETE(request: Request) {
  const auth = await requireApiAuth(request, { module: 'demands', action: 'delete' });
  if (!auth.ok) return auth.response;
  return Response.json({
    error: 'Cererile nu se șterg. Folosește revizuirea și selectează motivul închiderii.',
  }, { status: 409 });
}
