import { query } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  try {
    await query('SELECT 1');
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 503 });
  }
}
