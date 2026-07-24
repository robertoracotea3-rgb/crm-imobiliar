export const WEEKLY_REPORT_TIMEZONE = 'Europe/Bucharest';

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
};

const WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function zonedParts(date: Date): ZonedParts {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: WEEKLY_REPORT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    weekday: WEEKDAY[values.weekday] ?? 0,
  };
}

function localDateShift(
  parts: Pick<ZonedParts, 'year' | 'month' | 'day'>,
  days: number,
): Pick<ZonedParts, 'year' | 'month' | 'day'> {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function localToUtc(
  local: Pick<ZonedParts, 'year' | 'month' | 'day' | 'hour' | 'minute'>,
): Date {
  const wanted = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  let candidate = new Date(wanted);
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const actual = zonedParts(candidate);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
    );
    const correction = wanted - actualAsUtc;
    if (correction === 0) break;
    candidate = new Date(candidate.getTime() + correction);
  }
  return candidate;
}

export function scheduledWeeklyPeriod(
  now: Date,
  weekday: number,
  localTime: string,
): { start: string; end: string; due: boolean } {
  const safeWeekday = Number.isInteger(weekday) && weekday >= 0 && weekday <= 6 ? weekday : 5;
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(localTime);
  const hour = match ? Number(match[1]) : 18;
  const minute = match ? Number(match[2]) : 0;
  if (hour > 23 || minute > 59) throw new Error('invalid_weekly_report_local_time');

  const current = zonedParts(now);
  let daysBack = (current.weekday - safeWeekday + 7) % 7;
  let localEndDate = localDateShift(current, -daysBack);
  let end = localToUtc({ ...localEndDate, hour, minute });
  if (end.getTime() > now.getTime()) {
    daysBack += 7;
    localEndDate = localDateShift(current, -daysBack);
    end = localToUtc({ ...localEndDate, hour, minute });
  }
  const localStartDate = localDateShift(localEndDate, -7);
  const start = localToUtc({ ...localStartDate, hour, minute });
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    due: now.getTime() >= end.getTime(),
  };
}

export function formatReportPeriod(start: string, end: string): string {
  const format = new Intl.DateTimeFormat('ro-RO', {
    timeZone: WEEKLY_REPORT_TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return `${format.format(new Date(start))} – ${format.format(new Date(end))}`;
}
