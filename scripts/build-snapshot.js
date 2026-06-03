#!/usr/bin/env node
/**
 * Build snapshot JSON desde los CSVs de data/.
 *
 * Uso:
 *   node scripts/build-snapshot.js
 *
 * Lee data/ con la estructura:
 *   data/GSC/extracted/<each-zip-folder>/
 *   data/GA4/*.csv
 *   data/Sistrix/*.csv
 *   data/Calendario/*.csv
 *   data/Otros/*.csv  (One Search, Ahrefs Positions, etc)
 *
 * Escribe lib/snapshot.json con la estructura para /api/data.
 */

import { writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseAllGSC, findGSCExport } from './parsers/gsc.js';
import { parseGA4 } from './parsers/ga4.js';
import { parseSistrix } from './parsers/sistrix.js';
import { parseCalendar } from './parsers/calendar.js';
import { parseOneSearch } from './parsers/one-search.js';
import { parseAhrefsPositions } from './parsers/ahrefs-positions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA = join(ROOT, 'data');
const OUT = join(ROOT, 'lib', 'snapshot.json');

const log = (...args) => console.log('[build-snapshot]', ...args);

const MES_ES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function exists(path) { try { statSync(path); return true; } catch { return false; } }

/**
 * Convierte "1/5/26 - 31/5/26" en { start: '2026-05-01', end: '2026-05-31', key: '2026-05', label: 'Mayo 2026' }
 */
function parseDateRange(rangeStr) {
  if (!rangeStr) return null;
  const m = rangeStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  const yr = (s) => s.length === 2 ? '20' + s : s;
  const start = `${yr(m[3])}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const end = `${yr(m[6])}-${m[5].padStart(2, '0')}-${m[4].padStart(2, '0')}`;
  const monthNum = parseInt(m[2]);
  return {
    start, end,
    key: start.slice(0, 7),
    label: `${MES_ES[monthNum]} ${yr(m[3])}`
  };
}

/**
 * Extrae solo los campos relevantes para un top-N (limitando filas).
 */
function takeTop(arr, n = 50) {
  return (arr || []).slice(0, n);
}

/**
 * Convierte porcentaje (de % delta de GA4: 0.25 = +25%) a valor previo absoluto.
 */
function fromDelta(current, deltaDecimal) {
  if (deltaDecimal === null || deltaDecimal === undefined) return null;
  const ratio = 1 + deltaDecimal;
  if (ratio === 0) return null;
  return Math.round(current / ratio);
}

// ────────────────────────────────────────────────────────────────────
// Build pipeline
// ────────────────────────────────────────────────────────────────────

log('Reading data from', DATA);
if (!exists(DATA)) {
  console.error('ERROR: data/ folder not found. Place CSVs there first.');
  process.exit(1);
}

// 1) GSC (todos los ZIPs extraidos)
const gscExtracted = join(DATA, 'GSC', 'extracted');
const gscAll = exists(gscExtracted) ? parseAllGSC(gscExtracted) : [];
log('GSC exports parsed:', gscAll.length);

// Identificar el global (Web, todos los paises) y Spain (Web, Espana)
const gscGlobal = findGSCExport(gscAll, { tipoBusqueda: 'Web', pais: '' });
const gscSpain = findGSCExport(gscAll, { tipoBusqueda: 'Web', pais: 'España', pagina: '' });
const gscBlog = findGSCExport(gscAll, { tipoBusqueda: 'Web', pais: 'España', pagina: '+/blog/' });
const gscNoticia = findGSCExport(gscAll, { tipoBusqueda: 'Web', pais: 'España', pagina: '+/noticia/' });
const gscCausas = findGSCExport(gscAll, { tipoBusqueda: 'Web', pais: 'España', pagina: '+/causas/' });
const gscDesgrav = findGSCExport(gscAll, { tipoBusqueda: 'Web', pais: 'España', pagina: '+/desgravacion-fiscal-unicef' });
const gscDiscover = findGSCExport(gscAll, { tipoBusqueda: 'Discover' });
const gscNews = findGSCExport(gscAll, { tipoBusqueda: 'Google News' });

const period = parseDateRange(gscSpain?.date_ranges?.current || gscGlobal?.date_ranges?.current);
const comparison = parseDateRange(gscSpain?.date_ranges?.previous || gscGlobal?.date_ranges?.previous);
log('Period detected:', period?.label, '(', period?.start, '->', period?.end, ')');
log('Comparison:', comparison?.label);

// 2) GA4 (forzamos al periodo detectado por GSC)
const ga4Dir = join(DATA, 'GA4');
const ga4 = exists(ga4Dir) ? parseGA4(ga4Dir, period?.key) : null;
log('GA4 KPI:', ga4?.kpi);

// 3) Sistrix
const sistrixDir = join(DATA, 'Sistrix');
const sistrix = exists(sistrixDir) ? parseSistrix(sistrixDir) : null;
log('Sistrix current:', sistrix?.current);

// 4) Calendario
const calendarDir = join(DATA, 'Calendario');
const calendar = exists(calendarDir) ? parseCalendar(calendarDir) : null;
log('Calendar items:', calendar?.all?.length);

// 5) One Search (en Otros/)
const otrosDir = join(DATA, 'Otros');
const oneSearch = exists(otrosDir) ? parseOneSearch(otrosDir) : null;
log('One Search candidates_stop:', oneSearch?.candidates_stop?.length, '· savings €', oneSearch?.estimated_savings_eur);

// 6) Ahrefs Positions (tambien en Otros/)
const ahrefsPos = exists(otrosDir) ? parseAhrefsPositions(otrosDir) : null;
log('Ahrefs Positions: total', ahrefsPos?.total_keywords, '· AI Overview', ahrefsPos?.keywords_with_ai_overview);

// ────────────────────────────────────────────────────────────────────
// Composicion del snapshot
// ────────────────────────────────────────────────────────────────────

// SEED_MONTH compatible con el dashboard actual (shape minimal)
// Usamos cifras de ESPANYA (matchea el label "Clics España" del dashboard).
const spainCountries = gscSpain?.paises || [];
const spainRow = spainCountries.find(r => r.key === 'España') || spainCountries[0] || null;

const unicef_month = period ? {
  key: period.key,
  label: period.label,
  // GSC España (del export con filtro pais=Espana)
  clicks: spainRow?.current?.clicks ?? null,
  clicksPrev: spainRow?.previous?.clicks ?? null,
  impr: spainRow?.current?.impressions ?? null,
  imprPrev: spainRow?.previous?.impressions ?? null,
  // GA4 (mes mas reciente con datos completos)
  sess: ga4?.kpi?.sessions ?? null,
  sessPrev: ga4?.kpi?.sessions_yoy ?? null,
  // IA Overview keywords count (de Ahrefs Positions)
  ia: ahrefsPos?.keywords_with_ai_overview ?? null,
  // Sistrix (solo main por ahora, subpaths siguen siendo manual/null)
  sist: {
    main: sistrix?.current?.visibility ?? null,
    blog: null,
    causas: null,
    educa: null,
    noticia: null
  }
} : null;

// Top global countries: usar el export global (sin filtro pais)
const topCountries = gscGlobal?.paises?.length
  ? takeTop(gscGlobal.paises.map(r => ({
      country: r.key,
      clicks: r.current?.clicks ?? null,
      clicks_prev: r.previous?.clicks ?? null,
      impressions: r.current?.impressions ?? null,
      ctr: r.current?.ctr ?? null,
      position: r.current?.position ?? null
    })), 20)
  : [];

// Por seccion
function packSection(gscExp) {
  if (!gscExp) return null;
  return {
    filters: gscExp.filters,
    kpi: {
      // Total = primera fila de Paises.csv (deberia ser España global del filtro)
      clicks: gscExp.paises?.[0]?.current?.clicks ?? null,
      clicks_prev: gscExp.paises?.[0]?.previous?.clicks ?? null,
      impressions: gscExp.paises?.[0]?.current?.impressions ?? null,
      impressions_prev: gscExp.paises?.[0]?.previous?.impressions ?? null,
      ctr: gscExp.paises?.[0]?.current?.ctr ?? null,
      position: gscExp.paises?.[0]?.current?.position ?? null
    },
    top_pages: takeTop(gscExp.paginas, 30).map(r => ({
      url: r.key,
      clicks: r.current?.clicks ?? null,
      clicks_prev: r.previous?.clicks ?? null,
      impressions: r.current?.impressions ?? null,
      ctr: r.current?.ctr ?? null,
      position: r.current?.position ?? null
    })),
    top_queries: takeTop(gscExp.consultas, 30).map(r => ({
      query: r.key,
      clicks: r.current?.clicks ?? null,
      clicks_prev: r.previous?.clicks ?? null,
      impressions: r.current?.impressions ?? null,
      ctr: r.current?.ctr ?? null,
      position: r.current?.position ?? null
    }))
  };
}

const snapshot = {
  generated_at: new Date().toISOString(),
  source: 'data/ + CSV exports',
  client: {
    id: 'unicef',
    name: 'UNICEF España',
    domain: 'unicef.es',
    country: 'es'
  },
  period,
  comparison,

  unicef_month,

  gsc: {
    spain: packSection(gscSpain),
    global: gscGlobal ? {
      top_countries: topCountries,
      top_queries: takeTop((gscGlobal.consultas || []).map(r => ({
        query: r.key,
        clicks: r.current?.clicks ?? null,
        clicks_prev: r.previous?.clicks ?? null,
        impressions: r.current?.impressions ?? null,
        ctr: r.current?.ctr ?? null,
        position: r.current?.position ?? null
      })), 50)
    } : null,
    by_section: {
      blog: packSection(gscBlog),
      noticia: packSection(gscNoticia),
      causas: packSection(gscCausas),
      desgravacion: packSection(gscDesgrav)
    },
    discover: gscDiscover ? {
      filters: gscDiscover.filters,
      chart: gscDiscover.chart,
      top_pages: takeTop(gscDiscover.paginas, 20).map(r => ({
        url: r.key,
        clicks: r.current?.clicks ?? null,
        impressions: r.current?.impressions ?? null,
        ctr: r.current?.ctr ?? null
      }))
    } : null,
    google_news: gscNews ? {
      filters: gscNews.filters,
      chart: gscNews.chart,
      top_pages: takeTop(gscNews.paginas, 20).map(r => ({
        url: r.key,
        clicks: r.current?.clicks ?? null,
        impressions: r.current?.impressions ?? null,
        ctr: r.current?.ctr ?? null
      }))
    } : null
  },

  ga4: ga4 ? {
    kpi: ga4.kpi,
    daily_last_90d: (ga4.daily || []).slice(-90),
    monthly: ga4.monthly,
    by_category: ga4.by_category,
    by_category_clicks: ga4.by_category_clicks
  } : null,

  sistrix: sistrix ? {
    current: sistrix.current,
    yoy: sistrix.yoy,
    series_last_24m: sistrix.series_last_24m
  } : null,

  calendar,

  one_search: oneSearch,

  ahrefs_positions: ahrefsPos
};

// ────────────────────────────────────────────────────────────────────
// Escribir
// ────────────────────────────────────────────────────────────────────

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(snapshot, null, 2), 'utf8');

const stats = statSync(OUT);
log('OK ->', OUT, `(${Math.round(stats.size / 1024)} KB)`);

// Resumen rapido
log('Summary:');
log('  Period            ', period?.label || '?');
log('  unicef_month.clicks (España)', unicef_month?.clicks);
log('  unicef_month.sess   (GA4)   ', unicef_month?.sess);
log('  unicef_month.ia              ', unicef_month?.ia);
log('  unicef_month.sist.main       ', unicef_month?.sist?.main);
log('  top countries                ', topCountries.length);
log('  GSC sections                 ', Object.keys(snapshot.gsc.by_section).filter(k => snapshot.gsc.by_section[k]).length);
log('  calendar items               ', calendar?.all?.length || 0);
log('  ai overview keywords         ', ahrefsPos?.keywords_with_ai_overview || 0);
log('  one search candidates_stop   ', oneSearch?.candidates_stop?.length || 0);
log('  one search est savings €     ', oneSearch?.estimated_savings_eur || 0);
