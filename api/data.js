/**
 * GET /api/data
 *
 * Devuelve el snapshot de datos para el dashboard UNICEF.
 * Esta primera version solo conecta Ahrefs y Sistrix.
 * GSC, GA4 y Google Ads se anaden cuando lleguen credenciales.
 *
 * Cuando falta una credencial, el bloque correspondiente devuelve null
 * (no rompe el endpoint completo).
 *
 * Cache: el header Cache-Control de vercel.json sirve este endpoint con
 * s-maxage=300 (5 min) y stale-while-revalidate=600. Cuando anadamos
 * JSONBin + cron diario, este endpoint solo leera del cache.
 */

import { domainOverview as ahrefsOverview, topPages as ahrefsTopPages } from '../lib/ahrefs.js';
import { domainOverview as sistrixOverview, visibilityBySubpaths } from '../lib/sistrix.js';

const DOMAIN = process.env.DOMAIN || 'unicef.es';
const COUNTRY = process.env.COUNTRY || 'es';
const AHREFS_TARGET = process.env.AHREFS_TARGET || DOMAIN;

const SUBPATHS = ['', '/blog/', '/causas/', '/educa/', '/noticia/'];

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const startedAt = Date.now();

  const [ahrefs, sistrix, sistrixSubpaths] = await Promise.allSettled([
    process.env.AHREFS_API_TOKEN
      ? ahrefsOverview({ target: AHREFS_TARGET, country: COUNTRY })
      : Promise.resolve(null),
    process.env.SISTRIX_API_KEY
      ? sistrixOverview({ domain: DOMAIN, country: COUNTRY })
      : Promise.resolve(null),
    process.env.SISTRIX_API_KEY
      ? visibilityBySubpaths({ domain: DOMAIN, country: COUNTRY, paths: SUBPATHS })
      : Promise.resolve(null)
  ]);

  const payload = {
    client: {
      id: process.env.CLIENT_ID || 'unicef',
      name: process.env.CLIENT_NAME || 'UNICEF Espana',
      domain: DOMAIN,
      country: COUNTRY
    },
    generated_at: new Date().toISOString(),
    elapsed_ms: Date.now() - startedAt,
    ahrefs: settled(ahrefs),
    sistrix: settled(sistrix),
    sistrix_subpaths: settled(sistrixSubpaths),
    gsc: null,
    ga4: null,
    google_ads: null
  };

  res.status(200).json(payload);
}

function settled(p) {
  if (p.status === 'fulfilled') return p.value;
  return { error: p.reason?.message || String(p.reason) };
}
