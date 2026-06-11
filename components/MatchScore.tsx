'use client';

interface MatchScoreProps {
  score: number;
}

export function MatchScore({ score }: MatchScoreProps) {
  let color: string;

  if (score >= 80) {
    color = '#10B981'; // verde
  } else if (score >= 60) {
    color = '#F59E0B'; // galben
  } else if (score >= 40) {
    color = '#F97316'; // portocaliu
  } else {
    color = '#EF4444'; // rosu
  }

  return (
    <div
      className="inline-flex items-center justify-center w-12 h-12 rounded-full font-bold text-white text-sm"
      style={{ backgroundColor: color }}
      title={`Score: ${score}/100`}
    >
      {score}
    </div>
  );
}
