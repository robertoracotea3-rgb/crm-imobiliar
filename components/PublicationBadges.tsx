'use client';

interface PublicationStatus {
  portal: string;
  isEnabled: boolean;
  status?: 'published' | 'pending' | 'failed' | 'draft';
}

interface PublicationBadgesProps {
  publications: PublicationStatus[];
}

export function PublicationBadges({ publications }: PublicationBadgesProps) {
  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'published':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {publications.map((pub) => {
        if (!pub.isEnabled) return null;
        return (
          <span
            key={pub.portal}
            className={`text-xs px-2 py-1 rounded-full font-medium ${getStatusColor(
              pub.status
            )}`}
          >
            {pub.portal}
          </span>
        );
      })}
    </div>
  );
}
