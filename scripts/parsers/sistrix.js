/**
 * Parser del CSV de Sistrix.
 *
 * Schema (semicolon-separated, con BOM):
 *   Fecha;unicef.es
 *   13.07.2015;2.6167
 *   ...
 *
 * Una linea por semana desde 2015 hasta hoy.
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readText, parseCSVObjects, toNum, toDate } from './util.js';

export function parseSistrix(dir) {
  // Encuentra el primer CSV en el directorio
  const files = readdirSync(dir).filter(f => f.endsWith('.csv'));
  if (files.length === 0) return null;

  const txt = readText(join(dir, files[0]));
  if (!txt) return null;

  // Sistrix usa ; como separador
  const objects = parseCSVObjects(txt, ';');
  if (objects.length === 0) return null;

  // El nombre de columna de valor varia: puede ser "unicef.es", "Visibilidad", etc.
  // Tomamos la primera columna que no sea "Fecha"
  const headers = Object.keys(objects[0]);
  const dateCol = headers.find(h => /fecha/i.test(h)) || headers[0];
  const valueCol = headers.find(h => h !== dateCol) || headers[1];

  const series = objects
    .map(obj => ({
      date: toDate(obj[dateCol]),
      visibility: toNum(obj[valueCol])
    }))
    .filter(p => p.date && p.visibility !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  const last = series[series.length - 1] || null;
  // Comparar con un anyo atras
  let yoy = null;
  if (last) {
    const lastDate = new Date(last.date);
    const targetYoY = new Date(lastDate);
    targetYoY.setFullYear(targetYoY.getFullYear() - 1);
    const targetStr = targetYoY.toISOString().slice(0, 10);
    // Encuentra el valor mas cercano a la fecha YoY
    let closest = null;
    let minDiff = Infinity;
    for (const p of series) {
      const diff = Math.abs(new Date(p.date) - new Date(targetStr));
      if (diff < minDiff) { minDiff = diff; closest = p; }
    }
    yoy = closest;
  }

  return {
    current: last,
    yoy,
    series,           // serie completa semanal
    series_last_24m: series.slice(-Math.min(series.length, 105)) // 105 semanas = 2 anyos
  };
}
