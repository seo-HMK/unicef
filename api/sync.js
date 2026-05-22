/**
 * POST/GET /api/sync
 *
 * Stub. Sera el endpoint que actualiza el cache JSONBin llamando a todas
 * las APIs. Lo llama la cron de Vercel cada dia a las 03:00 UTC.
 *
 * Por ahora solo responde 200 OK para que la cron no produzca 404 diario.
 * Implementacion real: proxima sesion cuando tengamos JSONBin configurado.
 */

export default async function handler(req, res) {
  const source = req.query?.source || 'manual';

  res.status(200).json({
    ok: true,
    source,
    message: 'Sync endpoint stub. Implementacion real pendiente (proxima sesion).',
    timestamp: new Date().toISOString()
  });
}
