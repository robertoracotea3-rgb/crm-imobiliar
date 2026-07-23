import { runAutomationBatch } from '@/lib/server/automation-engine';
import { getAdminClient } from '@/lib/server/api-auth';
import { verifyCronAuthorization } from '@/lib/server/cron-auth.mjs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!verifyCronAuthorization(
    request.headers.get('authorization'),
    process.env.CRON_SECRET,
  )) {
    return Response.json({ error: 'Neautorizat' }, { status: 401 });
  }

  try {
    const summary = await runAutomationBatch(getAdminClient(), { limit: 20, sweep: true });
    return Response.json(
      { success: summary.failed === 0, summary },
      {
        status: summary.failed > 0 ? 207 : 200,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch {
    return Response.json(
      { error: 'Motorul de automatizări nu a putut fi executat.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
