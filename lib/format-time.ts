export function formatWaitTime(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  const days = Math.floor(minutes / 1440);
  const remainingMins = minutes % 1440;
  const hours = Math.floor(remainingMins / 60);
  return hours > 0 ? `${days}z ${hours}h` : `${days}z`;
}
