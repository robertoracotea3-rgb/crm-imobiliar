import { redirect } from 'next/navigation';

export default async function EditPropertyRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/properties/${encodeURIComponent(id)}/edit/complete`);
}
