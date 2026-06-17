export const dynamic = 'force-dynamic';

export async function POST() {
  return Response.json(
    { error: 'Endpoint dezactivat în producție' },
    { status: 403 }
  );
}
