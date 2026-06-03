/**
 * Parser de los ZIPs de Google Search Console.
 *
 * Cada ZIP descomprimido contiene:
 *   - Filtros.csv (que filtros se aplicaron)
 *   - Aparición en búsquedas.csv (SERP features)
 *   - Consultas.csv (top keywords)
 *   - Páginas.csv (top URLs)
 *   - Países.csv (top countries)
 *   - Dispositivos.csv (desktop/mobile/tablet)
 *   - Gráfico.csv (serie temporal diaria, en algunos)
 *
 * Las cabeceras tienen formato:
 *   "Consultas principales,1/5/26 - 31/5/26 Clics,1/5/25 - 31/5/25 Clics,..."
 * con comparativa Year-over-Year. Detectamos el rango de fechas y el rango
 * "previous" (-1 ano) automaticamente.
 */

import { readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { readText, parseCSV, parseCSVObjects, toNum, toDate } from './util.js';

/**
 * Lee Filtros.csv y devuelve un objeto con los filtros aplicados.
 */
function parseFiltros(dir) {
  const txt = readText(join(dir, 'Filtros.csv'));
  if (!txt) return {};
  const rows = parseCSV(txt);
  const out = {};
  for (let i = 1; i < rows.length; i++) {
    const [k, v] = rows[i];
    if (k && v) out[k.trim()] = v.trim();
  }
  return out;
}

/**
 * Detecta las columnas de fecha en un header. Devuelve { current, previous }
 * con los prefijos a buscar. Ej: { current: '1/5/26 - 31/5/26', previous: '1/5/25 - 31/5/25' }
 */
function detectDateRanges(headers) {
  const re = /^(\d{1,2}\/\d{1,2}\/\d{2,4} - \d{1,2}\/\d{1,2}\/\d{2,4})\s+(.+)$/;
  const ranges = new Set();
  for (const h of headers) {
    const m = h.match(re);
    if (m) ranges.add(m[1]);
  }
  const arr = Array.from(ranges);
  // El primer rango suele ser el actual, el segundo el comparativo
  return { current: arr[0] || null, previous: arr[1] || null };
}

/**
 * Helper para extraer metrica de fila: row[`${prefix} Clics`] etc.
 */
function metricsFromRow(row, prefix) {
  if (!prefix) return null;
  return {
    clicks: toNum(row[`${prefix} Clics`]),
    impressions: toNum(row[`${prefix} Impresiones`]),
    ctr: toNum(row[`${prefix} CTR`]),  // ya viene como porcentaje "1.61%" -> 1.61
    position: toNum(row[`${prefix} Posición`])
  };
}

/**
 * Parsea un Aparicion-en-busquedas / Consultas / Paginas / Paises / Dispositivos.
 * Devuelve array de { key, current: {clicks,impr,ctr,position}, previous: {...} }
 */
function parseTopRows(dir, filename, keyColumnName) {
  const txt = readText(join(dir, filename));
  if (!txt) return { rows: [], dateRanges: null };
  const objects = parseCSVObjects(txt);
  if (objects.length === 0) return { rows: [], dateRanges: null };
  const headers = Object.keys(objects[0]);
  const ranges = detectDateRanges(headers);
  const keyCol = headers[0]; // suele ser la primera columna
  const rows = objects.map(obj => ({
    key: obj[keyCol],
    current: metricsFromRow(obj, ranges.current),
    previous: metricsFromRow(obj, ranges.previous)
  })).filter(r => r.key);
  return { rows, dateRanges: ranges };
}

/**
 * Parsea Grafico.csv (serie temporal diaria).
 * Schema: Fecha, Clics, Impresiones, CTR
 */
function parseChart(dir) {
  const txt = readText(join(dir, 'Gráfico.csv'));
  if (!txt) return [];
  return parseCSVObjects(txt)
    .map(obj => ({
      date: toDate(obj['Fecha']),
      clicks: toNum(obj['Clics']),
      impressions: toNum(obj['Impresiones']),
      ctr: toNum(obj['CTR'])
    }))
    .filter(p => p.date);
}

/**
 * Parsea un directorio extraido de un ZIP GSC.
 */
export function parseGSCExport(dir) {
  const filtros = parseFiltros(dir);
  const consultas = parseTopRows(dir, 'Consultas.csv');
  const paginas = parseTopRows(dir, 'Páginas.csv');
  const paises = parseTopRows(dir, 'Países.csv');
  const dispositivos = parseTopRows(dir, 'Dispositivos.csv');
  const aparicion = parseTopRows(dir, 'Aparición en búsquedas.csv');
  const aparicionDiscover = parseTopRows(dir, 'Aparición en Discover.csv');
  const grafico = parseChart(dir);

  // Detectar tipo (Search / Discover / Google News) y rango fechas
  const tipoBusqueda = filtros['Tipo de búsqueda'] || 'unknown';
  const fechaRango = filtros['Fecha'] || '';
  const pais = filtros['País'] || null;
  const pagina = filtros['Página'] || null;

  return {
    source_dir: basename(dir),
    filters: { tipo_busqueda: tipoBusqueda, fecha: fechaRango, pais, pagina },
    date_ranges: consultas.dateRanges || paginas.dateRanges || paises.dateRanges,
    chart: grafico,
    aparicion: aparicion.rows.length ? aparicion.rows : aparicionDiscover.rows,
    consultas: consultas.rows,
    paginas: paginas.rows,
    paises: paises.rows,
    dispositivos: dispositivos.rows
  };
}

/**
 * Encuentra todos los directorios extraidos de ZIPs GSC y los parsea.
 */
export function parseAllGSC(extractedRoot) {
  if (!extractedRoot) return [];
  let entries;
  try { entries = readdirSync(extractedRoot); }
  catch { return []; }
  const dirs = entries
    .map(name => join(extractedRoot, name))
    .filter(p => { try { return statSync(p).isDirectory(); } catch { return false; } });
  return dirs.map(parseGSCExport);
}

/**
 * Helper: dado el array de GSC exports parseados, encuentra el que coincide con un filtro.
 */
export function findGSCExport(exports, { tipoBusqueda, pais, pagina }) {
  return exports.find(e =>
    (tipoBusqueda === undefined || e.filters.tipo_busqueda === tipoBusqueda) &&
    (pais === undefined || (e.filters.pais || '') === (pais || '')) &&
    (pagina === undefined || (e.filters.pagina || '') === (pagina || ''))
  );
}
