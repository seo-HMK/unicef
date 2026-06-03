/**
 * Parser del export "One Search" (cruce SEO/SEA).
 *
 * Schema:
 *   Query, Clics SEA, Coste, Impressions, Clics SEO, URL CTR, Ranking SEO
 *
 * Util para s11 "13.066 € reinversión estimada":
 * candidatos a "parar en paid" = queries donde rankeas top 1-3 en SEO
 * y todavia estas gastando en SEA.
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readText, parseCSVObjects, toNum } from './util.js';

export function parseOneSearch(dir) {
  // Buscar el archivo de One Search en /Otros
  const files = readdirSync(dir).filter(f => /one.search/i.test(f) && f.endsWith('.csv'));
  if (files.length === 0) return null;

  const txt = readText(join(dir, files[0]));
  if (!txt) return null;

  const rows = parseCSVObjects(txt)
    .map(obj => ({
      query: (obj['Query'] || '').trim(),
      sea_clicks: toNum(obj['Clics SEA']) || 0,
      sea_cost_eur: toNum(obj['Coste']) || 0,
      impressions: toNum(obj['Impressions']) || 0,
      seo_clicks: toNum(obj['Clics SEO']) || 0,
      seo_ctr: toNum(obj['URL CTR']) || 0,
      seo_ranking: toNum(obj['Ranking SEO']) || null
    }))
    .filter(r => r.query);

  // Candidatos a parar en paid: SEO en top 3 y SEA con coste > 0
  const candidatesStop = rows.filter(r =>
    r.seo_ranking !== null &&
    r.seo_ranking <= 3 &&
    r.sea_cost_eur > 0
  );

  const totalSavings = candidatesStop.reduce((s, r) => s + r.sea_cost_eur, 0);

  return {
    all: rows,
    candidates_stop: candidatesStop.sort((a, b) => b.sea_cost_eur - a.sea_cost_eur),
    estimated_savings_eur: Math.round(totalSavings * 100) / 100,
    summary: {
      total_queries: rows.length,
      total_sea_cost_eur: Math.round(rows.reduce((s, r) => s + r.sea_cost_eur, 0) * 100) / 100,
      total_sea_clicks: rows.reduce((s, r) => s + r.sea_clicks, 0),
      total_seo_clicks: rows.reduce((s, r) => s + r.seo_clicks, 0)
    }
  };
}
