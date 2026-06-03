/**
 * Parser del export de Ahrefs "Organic Positions".
 *
 * Schema (tab-separated o comma con quotes):
 *   Keyword,Position,Previous position,Search Volume,Keyword Difficulty,CPC,
 *   URL,Traffic,Traffic (%),Traffic Cost,Competition,Number of Results,
 *   Trends,Timestamp,SERP Features by Keyword,Keyword Intents,Position Type
 *
 * El campo "SERP Features by Keyword" contiene "AI overview" cuando aplica.
 * Lo usamos para contar keywords con IA Overview (s2 ia: 1078).
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readText, parseCSV, parseCSVObjects, toNum } from './util.js';

const SECTIONS = ['blog', 'causas', 'educa', 'noticia', 'colabora'];

export function parseAhrefsPositions(dir) {
  const files = readdirSync(dir).filter(f => /organic.*positions/i.test(f) && f.endsWith('.csv'));
  if (files.length === 0) return null;

  const txt = readText(join(dir, files[0]));
  if (!txt) return null;

  // Ahrefs CSV usa comma con quotes
  const rows = parseCSVObjects(txt)
    .map(obj => {
      const serpFeatures = (obj['SERP Features by Keyword'] || obj['SERP Features'] || '').toLowerCase();
      const url = obj['URL'] || '';
      // Detectar seccion del path
      let section = 'home';
      for (const s of SECTIONS) {
        if (url.includes(`/${s}/`)) { section = s; break; }
      }
      return {
        keyword: (obj['Keyword'] || '').trim(),
        position: toNum(obj['Position']),
        prev_position: toNum(obj['Previous position']),
        volume: toNum(obj['Search Volume']),
        difficulty: toNum(obj['Keyword Difficulty']),
        cpc: toNum(obj['CPC']),
        url,
        section,
        traffic: toNum(obj['Traffic']),
        traffic_pct: toNum(obj['Traffic (%)']),
        traffic_cost: toNum(obj['Traffic Cost']),
        serp_features: serpFeatures,
        has_ai_overview: /ai overview/i.test(serpFeatures),
        intent: (obj['Keyword Intents'] || '').toLowerCase(),
        position_type: (obj['Position Type'] || '').toLowerCase()
      };
    })
    .filter(r => r.keyword);

  // Stats principales
  const aiOverviewKeywords = rows.filter(r => r.has_ai_overview);
  const top3 = rows.filter(r => r.position !== null && r.position <= 3);

  // Top IA Overview por trafico
  const topAIByTraffic = [...aiOverviewKeywords]
    .filter(r => r.traffic)
    .sort((a, b) => (b.traffic || 0) - (a.traffic || 0))
    .slice(0, 50);

  // IA Overview por seccion
  const aiBySection = {};
  for (const s of [...SECTIONS, 'home', 'other']) {
    aiBySection[s] = aiOverviewKeywords.filter(r => r.section === s).length;
  }

  return {
    total_keywords: rows.length,
    keywords_top3: top3.length,
    keywords_with_ai_overview: aiOverviewKeywords.length,
    ai_overview_by_section: aiBySection,
    top_ai_overview: topAIByTraffic,
    summary: {
      total_estimated_traffic: rows.reduce((s, r) => s + (r.traffic || 0), 0),
      total_traffic_cost: Math.round(rows.reduce((s, r) => s + (r.traffic_cost || 0), 0) * 100) / 100
    }
  };
}
