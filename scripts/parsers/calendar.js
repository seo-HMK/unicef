/**
 * Parser del calendario de Días Mundiales.
 *
 * Schema:
 *   Día,Fecha,Estado,Documento,URL ÚNICA
 *
 * Fecha en formato dd/mm/yyyy o d/mm/yyyy. Año a veces es 2024 (placeholder),
 * lo normalizamos al año actual o siguiente segun el mes.
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readText, parseCSVObjects, toDate } from './util.js';

export function parseCalendar(dir, currentDate = new Date()) {
  const files = readdirSync(dir).filter(f => f.endsWith('.csv'));
  if (files.length === 0) return null;

  const txt = readText(join(dir, files[0]));
  if (!txt) return null;

  const objects = parseCSVObjects(txt);
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;

  const items = objects
    .map(obj => {
      let date = toDate(obj['Fecha']);
      // Si el año del archivo es viejo (2024), recalculamos al año actual / siguiente
      if (date) {
        const [y, m, d] = date.split('-').map(Number);
        // El calendario es "evergreen" (mismo dia cada anyo). Reanyadimos anyo.
        // Si el mes ya paso este año, usar año siguiente. Si no, año actual.
        const year = (m < currentMonth || (m === currentMonth && d < currentDate.getDate()))
          ? currentYear + 1
          : currentYear;
        date = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
      return {
        day: (obj['Día'] || '').trim(),
        date,
        month_day: date ? date.slice(5) : null,
        status: (obj['Estado'] || '').trim() || null,
        document: (obj['Documento'] || '').trim() || null,
        url: (obj['URL ÚNICA'] || '').trim() || null
      };
    })
    .filter(it => it.day && it.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  const todayStr = currentDate.toISOString().slice(0, 10);
  const upcoming = items.filter(it => it.date >= todayStr).slice(0, 30);

  // El "mes que viene" (proximo mes calendario)
  const nextMonth = new Date(currentDate);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const nextMonthKey = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;
  const nextMonthItems = items.filter(it => it.date.startsWith(nextMonthKey));

  return {
    all: items,
    upcoming,
    next_month: { key: nextMonthKey, items: nextMonthItems }
  };
}
