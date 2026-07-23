'use client';

const MONTHS = ['Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Noi', 'Dec'];

export function monthLabel(m: string): string {
  const parts = m.split('-');
  const mm = parseInt(parts[1] || '', 10);
  return MONTHS[mm - 1] || m;
}

const compact = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(Math.round(n));
};

/** Reusable SVG bar chart. `data` is a series of { month, count }. */
export function BarChart({
  data, color = '#0E6B54', height = 120, compactValues = false,
}: {
  data: { month: string; count: number }[];
  color?: string;
  height?: number;
  compactValues?: boolean;
}) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <svg viewBox={`0 0 ${data.length * 24} ${height + 24}`} className="w-full" preserveAspectRatio="none">
      {data.map((d, i) => {
        const barH = (d.count / max) * height;
        const x = i * 24 + 2;
        const y = height - barH;
        const isLast = i === data.length - 1;
        return (
          <g key={d.month}>
            <rect x={x} y={y} width={20} height={barH} rx={3} fill={isLast ? color : `${color}70`} className="transition-all duration-300" />
            {d.count > 0 && (
              <text x={x + 10} y={y - 4} textAnchor="middle" fontSize={7} fill="#6b7280">
                {compactValues ? compact(d.count) : d.count}
              </text>
            )}
            <text x={x + 10} y={height + 16} textAnchor="middle" fontSize={7} fill={isLast ? color : '#9ca3af'}>
              {monthLabel(d.month)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Reusable SVG donut chart. `data` is a set of { label, value, color }. */
export function DonutChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = 40, cx = 50, cy = 50, stroke = 14;
  const circumference = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 100 100" className="w-full max-w-[140px]">
      {data.map((d, i) => {
        const pct = d.value / total;
        const dash = pct * circumference;
        const gap = circumference - dash;
        const prior = data.slice(0, i).reduce((sum, item) => sum + item.value, 0);
        const rotation = (prior / total) * 360 - 90;
        return (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={d.color} strokeWidth={stroke}
            strokeDasharray={`${dash} ${gap}`} transform={`rotate(${rotation} ${cx} ${cy})`} className="transition-all duration-500" />
        );
      })}
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize={9} fontWeight="bold" fill="#111827">{compact(total)}</text>
      <text x={cx} y={cy + 8} textAnchor="middle" fontSize={7} fill="#6b7280">total</text>
    </svg>
  );
}
