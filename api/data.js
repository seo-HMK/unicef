/**
 * GET /api/data
 *
 * Devuelve datos consolidados para el dashboard UNICEF.
 *
 * Fuentes (en orden de prioridad):
 *   1. lib/snapshot.json   <- producido por `npm run build-snapshot` desde data/
 *      Contiene GSC (Web + Discover + News + por seccion), GA4, Sistrix,
 *      Calendario, One Search y Ahrefs Positions.
 *   2. Ahrefs API live     <- consulta en cada request (con cache Vercel)
 *      Domain rating, backlinks, top pages, top keywords frescos.
 *
 * El snapshot es estatico (cambia con cada commit). Ahrefs es dinamico.
 * Cache: s-maxage=300 en vercel.json.
 */

import {
  domainOverview as ahrefsOverview,
  topPages as ahrefsTopPages,
  organicKeywords as ahrefsOrganicKw
} from '../lib/ahrefs.js';
import { domainOverview as sistrixOverview, visibilityBySubpaths } from '../lib/sistrix.js';

// snapshot.json existe si ya se corrio build-snapshot. Si no, devolvemos null.
let snapshot = null;
try {
  const mod = await import('../lib/snapshot.json', { with: { type: 'json' } });
  snapshot = mod.default || mod;
} catch (e) {
  // snapshot.json no existe todavia (primer deploy antes de generarlo)
  snapshot = null;
}

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

  const ahrefsLive = {
    overview: settled(ahrefsOv),
    top_pages: groupPagesBySection(settled(ahrefsPages)),
    top_keywords: settled(ahrefsKw)
  };

  const sistrixApi = {
    overview: settled(sistrixOv),
    subpaths: settled(sistrixSub)
  };

  res.status(200).json({
    client: snapshot?.client || {
      id: process.env.CLIENT_ID || 'unicef',
      name: process.env.CLIENT_NAME || 'UNICEF Espana',
      domain: DOMAIN,
      country: COUNTRY
    },
    generated_at: new Date().toISOString(),
    elapsed_ms: Date.now() - startedAt,
    sources_available: {
      snapshot: !!snapshot,
      ahrefs: !!process.env.AHREFS_API_TOKEN,
      sistrix: !!process.env.SISTRIX_API_KEY,
      gsc: !!snapshot?.gsc,
      ga4: !!snapshot?.ga4,
      one_search: !!snapshot?.one_search
    },
    snapshot: snapshot ? {
      generated_at: snapshot.generated_at,
      period: snapshot.period,
      comparison: snapshot.comparison
    } : null,
    unicef_month: snapshot?.unicef_month || null,
    gsc: snapshot?.gsc || null,
    ga4: snapshot?.ga4 || null,
    sistrix: snapshot?.sistrix || sistrixApi,
    calendar: snapshot?.calendar || null,
    one_search: snapshot?.one_search || null,
    ahrefs_positions: snapshot?.ahrefs_positions || null,
    ahrefs_live: ahrefsLive
  });
}

function settled(p) {
  if (p.status === 'fulfilled') return p.value;
  return { error: p.reason?.message || String(p.reason) };
}

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
