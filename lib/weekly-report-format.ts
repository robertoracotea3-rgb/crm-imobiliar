import { formatReportPeriod } from './weekly-report-period.ts';

export type WeeklyReportData = {
  id: string;
  period_start: string;
  period_end: string;
  general_metrics: Record<string, number>;
  agent_metrics: Array<Record<string, string | number>>;
  metric_definitions?: Record<string, string>;
};

export const GENERAL_METRIC_LABELS: Record<string, string> = {
  new_leads: 'Leaduri noi',
  allocated_demands: 'Cereri alocate',
  contacted_in_24h: 'Contactate în 24 ore',
  contacted_late: 'Contactate târziu',
  uncontacted: 'Necontactate',
  average_first_contact_minutes: 'Timp mediu primul contact (minute)',
  activities_missing_description: 'Activități fără descriere',
  demands_missing_next_action: 'Cereri fără următoarea acțiune',
  demands_over_20_days: 'Cereri peste 20 zile',
  demands_closed: 'Cereri închise',
  demands_should_close: 'Cereri de verificat pentru închidere',
  viewings_scheduled: 'Vizionări programate',
  viewings_completed: 'Vizionări efectuate',
  storia_unmatched: 'Mesaje Storia neasociate',
  active_properties_unassigned: 'Proprietăți active fără agent',
  overdue_tasks: 'Taskuri restante',
};

export const AGENT_METRIC_LABELS: Record<string, string> = {
  assigned_leads: 'Leaduri alocate',
  contacted_leads: 'Leaduri contactate',
  sla_percent: 'Contactate în 24 ore (%)',
  average_response_minutes: 'Timp mediu răspuns (minute)',
  active_demands: 'Cereri active',
  demands_over_20_days: 'Cereri peste 20 zile',
  demands_closed: 'Cereri închise',
  demands_not_closed: 'Cereri de verificat neînchise',
  activities_missing_description: 'Activități fără descriere',
  viewings: 'Vizionări',
  offers: 'Oferte',
  transactions: 'Tranzacții',
  overdue_tasks: 'Taskuri expirate',
};

const csvCell = (value: unknown): string =>
  `"${String(value ?? '').replaceAll('"', '""')}"`;

export function weeklyReportCsv(report: WeeklyReportData): string {
  const rows: string[][] = [
    ['Raport săptămânal Kira Imobiliare'],
    ['Perioadă', formatReportPeriod(report.period_start, report.period_end)],
    [],
    ['Raport general'],
    ['Indicator', 'Valoare', 'Definiție'],
    ...Object.entries(GENERAL_METRIC_LABELS).map(([code, label]) => [
      label,
      String(report.general_metrics[code] ?? 0),
      report.metric_definitions?.[code] || '',
    ]),
    [],
    ['Raport per agent'],
    ['Agent', ...Object.values(AGENT_METRIC_LABELS)],
    ...report.agent_metrics.map((agent) => [
      String(agent.agent_name || agent.agent_id || 'Agent'),
      ...Object.keys(AGENT_METRIC_LABELS).map((code) => String(agent[code] ?? 0)),
    ]),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}\r\n`;
}

function ascii(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)');
}

function wrapLine(value: string, width = 86): string[] {
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (`${line} ${word}`.trim().length > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = `${line} ${word}`.trim();
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function weeklyReportPdf(report: WeeklyReportData): Buffer {
  const lines = [
    'Raport saptamanal agenti Kira Imobiliare',
    `Perioada: ${formatReportPeriod(report.period_start, report.period_end)}`,
    '',
    'Raport general',
    ...Object.entries(GENERAL_METRIC_LABELS).map(
      ([code, label]) => `${label}: ${report.general_metrics[code] ?? 0}`,
    ),
    '',
    'Raport per agent',
    ...report.agent_metrics.flatMap((agent) => [
      String(agent.agent_name || agent.agent_id || 'Agent'),
      ...Object.entries(AGENT_METRIC_LABELS).map(
        ([code, label]) => `  ${label}: ${agent[code] ?? 0}`,
      ),
      '',
    ]),
  ].flatMap((line) => wrapLine(ascii(line)));
  const chunks: string[][] = [];
  for (let index = 0; index < lines.length; index += 46) {
    chunks.push(lines.slice(index, index + 46));
  }
  if (!chunks.length) chunks.push(['Raport fara date']);

  const pageIds = chunks.map((_, index) => 3 + index * 2);
  const contentIds = chunks.map((_, index) => 4 + index * 2);
  const fontId = 3 + chunks.length * 2;
  const objects: string[] = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${chunks.length} >>`;
  chunks.forEach((pageLines, index) => {
    objects[pageIds[index]] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentIds[index]} 0 R >>`;
    const text = [
      'BT',
      '/F1 10 Tf',
      '45 800 Td',
      '13 TL',
      ...pageLines.map((line, lineIndex) => `${lineIndex ? 'T* ' : ''}(${line}) Tj`),
      'ET',
    ].join('\n');
    objects[contentIds[index]] = `<< /Length ${Buffer.byteLength(text, 'latin1')} >>\nstream\n${text}\nendstream`;
  });
  objects[fontId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

  let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets: number[] = [0];
  for (let id = 1; id <= fontId; id += 1) {
    offsets[id] = Buffer.byteLength(pdf, 'latin1');
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${fontId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= fontId; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${fontId + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
