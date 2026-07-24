export interface PropertyAssignmentOptions {
  reassignActiveLeads: boolean;
  reassignOpenTasks: boolean;
  reassignFutureViewings: boolean;
  reassignActiveDemands: boolean;
  allowUnassignedException: boolean;
}

export interface PropertyAssignmentRequest {
  propertyIds: string[];
  responsibleAgentId: string | null;
  reason: string | null;
  options: PropertyAssignmentOptions;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

export function normalizePropertyAssignmentRequest(value: unknown): {
  value: PropertyAssignmentRequest | null;
  errors: string[];
} {
  const input = record(value);
  const rawIds = Array.isArray(input.property_ids) ? input.property_ids : [];
  const propertyIds = [...new Set(rawIds.filter((id): id is string => typeof id === 'string'))];
  const rawAgent = input.responsible_agent_id;
  const responsibleAgentId = rawAgent === null || rawAgent === ''
    ? null
    : typeof rawAgent === 'string' ? rawAgent : null;
  const reason = typeof input.reason === 'string'
    ? input.reason.trim().slice(0, 500) || null
    : null;
  const rawOptions = record(input.options);
  const options: PropertyAssignmentOptions = {
    reassignActiveLeads: rawOptions.reassign_active_leads === true,
    reassignOpenTasks: rawOptions.reassign_open_tasks === true,
    reassignFutureViewings: rawOptions.reassign_future_viewings === true,
    reassignActiveDemands: rawOptions.reassign_active_demands === true,
    allowUnassignedException: rawOptions.allow_unassigned_exception === true,
  };
  const errors: string[] = [];

  if (propertyIds.length === 0) errors.push('Selectează cel puțin o proprietate.');
  if (propertyIds.length > 100) errors.push('Poți aloca maximum 100 de proprietăți odată.');
  if (propertyIds.some((id) => !UUID_RE.test(id))) errors.push('Selecția conține un ID invalid.');
  if (responsibleAgentId !== null && !UUID_RE.test(responsibleAgentId)) {
    errors.push('Agentul selectat este invalid.');
  }
  if (responsibleAgentId === null && !options.allowUnassignedException) {
    errors.push('O proprietate poate rămâne fără agent numai ca excepție explicită.');
  }
  if (responsibleAgentId === null && !reason) {
    errors.push('Motivul este obligatoriu pentru o proprietate fără agent.');
  }
  if (typeof input.reason === 'string' && input.reason.trim().length > 500) {
    errors.push('Motivul poate avea maximum 500 de caractere.');
  }

  return {
    value: errors.length ? null : { propertyIds, responsibleAgentId, reason, options },
    errors,
  };
}

export function assignmentImpactSummary(options: PropertyAssignmentOptions): string[] {
  return [
    options.reassignActiveLeads ? 'leadurile active' : null,
    options.reassignOpenTasks ? 'taskurile nefinalizate' : null,
    options.reassignFutureViewings ? 'vizionările viitoare' : null,
    options.reassignActiveDemands ? 'cererile active potrivite' : null,
  ].filter((value): value is string => Boolean(value));
}
