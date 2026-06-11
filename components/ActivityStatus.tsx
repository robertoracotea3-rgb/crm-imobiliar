import { Circle } from 'lucide-react';

type StatusType = 'active' | 'warning' | 'inactive';

interface ActivityStatusProps {
  daysAgo: number;
}

export function ActivityStatus({ daysAgo }: ActivityStatusProps) {
  let status: StatusType;
  let label: string;
  let color: string;

  if (daysAgo < 30) {
    status = 'active';
    color = '#10B981'; // verde
    label = `${daysAgo}d`;
  } else if (daysAgo < 90) {
    status = 'warning';
    color = '#F59E0B'; // galben
    label = `${daysAgo}d`;
  } else {
    status = 'inactive';
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
