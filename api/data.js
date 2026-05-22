/**
 * GET /api/data
 *
 * Devuelve el snapshot de datos para el dashboard UNICEF.
 *
 * Estado de fuentes:
 *   - Ahrefs:    listo si AHREFS_API_TOKEN definido
 *   - Sistrix:   listo si SISTRIX_API_KEY definido
 *   - GSC:       pendiente (espera credenciales del cliente)
 *   - GA4:       pendiente
 *   - Google Ads: opcional
 *
 * Cuando falta una credencial, ese bloque devuelve null (no rompe el endpoint).
 * Promise.allSettled aisla fallos por API.
 *
 * Cache: vercel.json sirve este endpoint con s-maxage=300 (5 min).
 * Cuando anadamos JSONBin + cron, este endpoint solo leera del cache.
 */

import {
  domainOverview as ahrefsOverview,
  topPages as ahrefsTopPages,
  organicKeywords as ahrefsOrganicKw
} from '../lib/ahrefs.js';
import { domainOverview as sistrixOverview, visibilityBySubpaths } from '../lib/sistrix.js';

const DOMAIN = process.env.DOMAIN || 'unicef.es';
const COUNTRY = process.env.COUNTRY || 'es';
const AHREFS_TARGET = process.env.AHREFS_TARGET || DOMAIN;

const SECTIONS = {
  '': 'home',
  '/blog/': 'blog',
  '/causas/': 'causas',
  '/educa/': 'educa',
  '/noticia/': 'noticia',
  '/colabora/': 'colabora'
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const startedAt = Date.now();

  const [ahrefsOv, ahrefsPages, ahrefsKw, sistrixOv, sistrixSub] = await Promise.allSettled([
    process.env.AHREFS_API_TOKEN
      ? ahrefsOverview({ target: AHREFS_TARGET, country: COUNTRY })
      : Promise.resolve(null),
    process.env.AHREFS_API_TOKEN
      ? ahrefsTopPages({ target: AHREFS_TARGET, country: COUNTRY, limit: 100 })
      : Promise.resolve(null),
    process.env.AHREFS_API_TOKEN
      ? ahrefsOrganicKw({ target: AHREFS_TARGET, country: COUNTRY, limit: 50 })
      : Promise.resolve(null),
    process.env.SISTRIX_API_KEY
      ? sistrixOverview({ domain: DOMAIN, country: COUNTRY })
      : Promise.resolve(null),
    process.env.SISTRIX_API_KEY
      ? visibilityBySubpaths({ domain: DOMAIN, country: COUNTRY, paths: Object.keys(SECTIONS) })
      : Promise.resolve(null)
  ]);

  const ahrefsBlock = {
    overview: settled(ahrefsOv),
    top_pages: groupPagesBySection(settled(ahrefsPages)),
    top_keywords: settled(ahrefsKw)
  };

  const sistrixBlock = {
    overview: settled(sistrixOv),
    subpaths: settled(sistrixSub)
  };

  res.status(200).json({
    client: {
      id: process.env.CLIENT_ID || 'unicef',
      name: process.env.CLIENT_NAME || 'UNICEF Espana',
      domain: DOMAIN,
      country: COUNTRY
    },
    generated_at: new Date().toISOString(),
    elapsed_ms: Date.now() - startedAt,
    sources_available: {
      ahrefs: !!process.env.AHREFS_API_TOKEN,
      sistrix: !!process.env.SISTRIX_API_KEY,
      gsc: !!process.env.GSC_REFRESH_TOKEN,
      ga4: !!(process.env.GA4_SERVICE_ACCOUNT_JSON || process.env.GA4_REFRESH_TOKEN),
      google_ads: !!process.env.ADS_DEVELOPER_TOKEN
    },
    ahrefs: ahrefsBlock,
    sistrix: sistrixBlock,
    gsc: null,
    ga4: null,
    google_ads: null
  });
}

function settled(p) {
  if (p.status === 'fulfilled') return p.value;
  return { error: p.reason?.message || String(p.reason) };
}

/**
 * Agrupa top_pages de Ahrefs por seccion del sitio (blog, causas, etc).
 */
function groupPagesBySection(ahrefsPagesResp) {
  if (!ahrefsPagesResp || ahrefsPagesResp.error || !ahrefsPagesResp.pages) {
    return ahrefsPagesResp;
  }
  const groups = {};
  for (const path of Object.keys(SECTIONS)) {
    groups[SECTIONS[path]] = [];
  }
  groups.other = [];

  for (const p of ahrefsPagesResp.pages) {
    let matched = false;
    for (const path of Object.keys(SECTIONS)) {
      if (path === '') continue;
      if (p.url.includes(path)) {
        groups[SECTIONS[path]].push(p);
        matched = true;
        break;
      }
    }
    if (!matched) groups.other.push(p);
  }
  return { all: ahrefsPagesResp.pages, by_section: groups };
}
