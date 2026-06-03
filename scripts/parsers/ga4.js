/**
 * Parser de los 4 CSVs de GA4 que exporta Looker Studio:
 *   - Serie temporal.csv          (Fecha, Sesiones)              -> daily sessions
 *   - Tabla.csv                   (Categoría URL, Sesiones, %Δ)  -> sessions by section
 *   - Tabla (1).csv               (Categoría URL GSC, Clicks, %Δ, Impressions, %Δ)
 *   - Tabla dinámica.csv          (Año, Mes, Sesiones)           -> monthly historical
 */

import { join } from 'node:path';
import { readText, parseCSVObjects, toNum, toDate } from './util.js';

/**
 * Parsea la serie temporal diaria.
 */
function parseDaily(dir) {
  const txt = readText(join(dir, 'Unicef - SEO Reporting Anual & Mensual_Reporte Mensual_Serie temporal.csv'));
  if (!txt) return [];
  return parseCSVObjects(txt)
    .map(obj => ({
      date: toDate(obj['Fecha']),
      sessions: toNum(obj['Sesiones'])
    }))
    .filter(p => p.date && p.sessions !== null);
}

/**
 * Parsea la tabla por categoria con %Δ (variacion).
 * El %Δ viene como decimal: 0.2546 = +25.46%, -0.13986 = -13.98%
 */
function parseSessionsByCategory(dir) {
  const txt = readText(join(dir, 'Unicef - SEO Reporting Anual & Mensual_Reporte Mensual_Tabla.csv'));
  if (!txt) return [];
  return parseCSVObjects(txt)
    .map(obj => ({
      category: (obj['Categoría de URL'] || '').trim(),
      sessions: toNum(obj['Sesiones']),
      delta_pct: toNum(obj['% Δ']) // ya es decimal (ej 0.25 = +25%)
    }))
    .filter(r => r.category);
}

/**
 * Parsea la tabla con clicks + impressions por categoria (datos GSC pero en export GA4).
 */
function parseClicksByCategory(dir) {
  const txt = readText(join(dir, 'Unicef - SEO Reporting Anual & Mensual_Reporte Mensual_Tabla (1).csv'));
  if (!txt) return [];
  return parseCSVObjects(txt)
    .map(obj => ({
      category: (obj['Categorías de URLS GSC'] || '').trim(),
      url_clicks: toNum(obj['Url Clicks']),
      url_clicks_delta: toNum(obj['% Δ']),
      impressions: toNum(obj['Impressions']),
      impressions_delta: toNum(obj['% Δ_1'] || obj['% Δ.1']) // a veces el segundo "% Δ" se renombra
    }))
    .filter(r => r.category);
}

/**
 * Parsea la tabla dinamica Año + Mes -> Sesiones.
 */
function parseMonthlyHistorical(dir) {
  const txt = readText(join(dir, 'Unicef - SEO Reporting Anual & Mensual_Reporte Mensual_Tabla dinámica.csv'));
  if (!txt) return [];
  return parseCSVObjects(txt)
    .map(obj => {
      const year = parseInt(obj['Año']);
      const month = parseInt(obj['Mes (fx)']);
      return {
        year, month,
        key: `${year}-${String(month).padStart(2, '0')}`,
        sessions: toNum(obj['Sesiones'])
      };
    })
    .filter(r => r.year && r.month && r.sessions !== null)
    .sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Suma sesiones del mes indicado (YYYY-MM) en la serie diaria.
 */
function sumMonth(daily, key) {
  return daily
    .filter(d => d.date.startsWith(key))
    .reduce((sum, d) => sum + (d.sessions || 0), 0);
}

/**
 * Parsea todo GA4 y devuelve estructura unificada.
 *
 * @param dir Carpeta con los CSVs de GA4
 * @param targetPeriod Opcional: clave "YYYY-MM" para forzar el periodo del KPI.
 *                     Si no se pasa, se usa el ultimo mes COMPLETO (excluye actual si esta en curso).
 */
export function parseGA4(dir, targetPeriod = null) {
  const daily = parseDaily(dir);
  const monthlyTable = parseMonthlyHistorical(dir);
  const byCategory = parseSessionsByCategory(dir);
  const byCategoryClicks = parseClicksByCategory(dir);

  const monthlyByKey = Object.fromEntries(monthlyTable.map(r => [r.key, r.sessions]));

  // Determinar el periodo: prioridad al pasado por parametro, si no detectar.
  let period = targetPeriod;
  if (!period) {
    // Ultimo mes completo: si el mes actual del calendario tiene <28 dias de datos, usar anterior
    const monthsInDaily = [...new Set(daily.map(d => d.date.slice(0, 7)))].sort();
    const last = monthsInDaily[monthsInDaily.length - 1];
    const daysInLast = daily.filter(d => d.date.startsWith(last)).length;
    period = (daysInLast >= 28) ? last : monthsInDaily[monthsInDaily.length - 2];
  }

  let kpi = null;
  if (period) {
    const [y, m] = period.split('-');
    const yoyKey = `${parseInt(y) - 1}-${m}`;
    kpi = {
      period,
      yoy_period: yoyKey,
      sessions: sumMonth(daily, period) || monthlyByKey[period] || null,
      sessions_yoy: monthlyByKey[yoyKey] || null
    };
  }

  return {
    kpi,
    daily,                  // [{date, sessions}]
    monthly: monthlyTable,  // [{year, month, key, sessions}]
    by_category: byCategory, // [{category, sessions, delta_pct}]
    by_category_clicks: byCategoryClicks // [{category, url_clicks, ..., impressions, ...}]
  };
}
