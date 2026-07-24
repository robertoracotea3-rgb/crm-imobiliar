export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';
import { weeklyReportCsv, weeklyReportPdf } from '@/lib/weekly-report-format';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(request, { module: 'reports', action: 'export' });
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const format = new URL(request.url).searchParams.get('format');
  if (!UUID.test(id) || !['csv', 'pdf'].includes(String(format))) {
    return Response.json({ error: 'Export invalid.' }, { status: 400 });
  }
  const { data, error } = await auth.context.serviceAdmin.from('weekly_reports')
    .select('id,period_start,period_end,general_metrics,agent_metrics,metric_definitions')
    .eq('id', id)
    .eq('agency_id', auth.context.agencyId)
    .maybeSingle();
  if (error || !data) return Response.json({ error: 'Raportul nu a fost găsit.' }, { status: 404 });
  const name = `raport-saptamanal-${String(data.period_end).slice(0, 10)}`;
  if (format === 'csv') {
    return new Response(weeklyReportCsv(data), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${name}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }
  const pdf = Uint8Array.from(weeklyReportPdf(data));
  return new Response(pdf.buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${name}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
