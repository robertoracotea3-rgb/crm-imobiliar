export type ViewingRequestInput = {
  lead_id?: unknown;
  contact_id?: unknown;
  property_id?: unknown;
  agent_id?: unknown;
  start_at?: unknown;
  duration_minutes?: unknown;
  location?: unknown;
  description?: unknown;
  participants?: unknown;
  reminder_at?: unknown;
};

export type NormalizedViewingRequest = {
  leadId: string | null;
  contactId: string;
  propertyId: string;
  agentId: string | null;
  startAt: string;
  durationMinutes: number;
  location: string | null;
  description: string | null;
  participants: string[];
  reminderAt: string | null;
};

const text = (value: unknown, maximum = 500): string | null => {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized.slice(0, maximum) : null;
};

const instant = (value: unknown, errorCode: string): Date | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new Error(errorCode);
  return parsed;
};

export function normalizeViewingRequest(
  input: ViewingRequestInput,
  now: Date | number | string = new Date(),
): NormalizedViewingRequest {
  const currentTime = new Date(now);
  if (Number.isNaN(currentTime.getTime())) throw new Error('viewing_clock_invalid');

  const propertyId = text(input.property_id, 100);
  const contactId = text(input.contact_id, 100);
  if (!propertyId) throw new Error('property_not_found');
  if (!contactId) throw new Error('client_required');

  const startAt = instant(input.start_at, 'viewing_start_invalid');
  if (!startAt) throw new Error('viewing_start_invalid');
  if (startAt.getTime() <= currentTime.getTime()) throw new Error('viewing_must_be_future');

  const duration = input.duration_minutes === null
    || input.duration_minutes === undefined
    || input.duration_minutes === ''
    ? 60
    : Number(input.duration_minutes);
  if (!Number.isInteger(duration) || duration < 15 || duration > 480) {
    throw new Error('invalid_duration');
  }

  const reminderAt = instant(input.reminder_at, 'reminder_invalid');
  if (reminderAt && reminderAt.getTime() >= startAt.getTime()) {
    throw new Error('reminder_must_precede_viewing');
  }

  if (input.participants !== undefined && !Array.isArray(input.participants)) {
    throw new Error('participants_invalid');
  }
  const participants = [...new Set(
    (Array.isArray(input.participants) ? input.participants : [])
      .map((participant) => text(participant, 200))
      .filter((participant): participant is string => Boolean(participant)),
  )];
  if (participants.length > 20) throw new Error('participants_invalid');

  return {
    leadId: text(input.lead_id, 100),
    contactId,
    propertyId,
    agentId: text(input.agent_id, 100),
    startAt: startAt.toISOString(),
    durationMinutes: duration,
    location: text(input.location, 500),
    description: text(input.description, 3_000),
    participants,
    reminderAt: reminderAt?.toISOString() || null,
  };
}
