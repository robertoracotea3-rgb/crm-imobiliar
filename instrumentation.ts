import type { Instrumentation } from 'next';

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const digest = error && typeof error === 'object' && 'digest' in error
    && typeof error.digest === 'string'
    ? error.digest
    : null;
  const { recordUnhandledServerError } = await import('@/lib/server/observability');
  await recordUnhandledServerError({
    route: context.routePath || request.path,
    method: request.method,
    routeType: context.routeType,
    digest,
  });
};
