import {openapi} from '@/lib/openapi';

export const revalidate = false;

export async function GET() {
  const schemas = await openapi.getSchemas();
  const first = Object.values(schemas)[0];
  if (!first) return new Response('Not found', {status: 404});

  return new Response(JSON.stringify(first.bundled), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=3600',
    },
  });
}
