import { Circle } from 'lucide-react';

interface ActivityStatusProps {
  daysAgo: number;
}

export function ActivityStatus({ daysAgo }: ActivityStatusProps) {
  let label: string;
  let color: string;

  if (daysAgo < 30) {
    color = '#10B981'; // verde
    label = `${daysAgo}d`;
  } else if (daysAgo < 90) {
    color = '#F59E0B'; // galben
    label = `${daysAgo}d`;
  } else {
    color = '#EF4444'; // rosu
    label = `${daysAgo}d`;
  }

  return (
    <div className="flex items-center gap-2">
      <Circle size={12} fill={color} stroke="none" />
      <span className="text-sm font-medium" style={{ color }}>
        {label}
      </span>
    </div>
  );
}
