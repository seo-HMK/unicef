/**
 * Utilidades compartidas para parsers.
 */

import { readFileSync, existsSync } from 'node:fs';

/**
 * Lee un archivo de texto quitando BOM si lo tiene.
 */
export function readText(path) {
  if (!existsSync(path)) return null;
  let txt = readFileSync(path, 'utf8');
  if (txt.charCodeAt(0) === 0xFEFF) txt = txt.slice(1);
  return txt;
}

/**
 * Parser CSV minimal RFC-4180.
 * Maneja: campos entre comillas, comillas escapadas "", separadores arbitrarios,
 * saltos de linea LF/CRLF, lineas vacias.
 */
export function parseCSV(text, sep = ',') {
  const rows = [];
  let row = [];
  let field = '';
  let inQuote = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (inQuote) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuote = false; i++;
      } else {
        field += c; i++;
      }
    } else {
      if (c === '"') { inQuote = true; i++; }
      else if (c === sep) { row.push(field); field = ''; i++; }
      else if (c === '\n' || c === '\r') {
        row.push(field); field = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
        if (c === '\r' && text[i + 1] === '\n') i += 2; else i++;
      } else {
        field += c; i++;
      }
    }
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/**
 * Parsea un CSV y devuelve array de objetos {col1: value, col2: value, ...}
 * usando la primera fila como headers.
 */
export function parseCSVObjects(text, sep = ',') {
  const rows = parseCSV(text, sep);
  if (rows.length === 0) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (r[idx] ?? '').trim(); });
    return obj;
  });
}

/**
 * Convierte string a number (maneja "1.234,56", "1,234.56", porcentajes "2.5%").
 */
export function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  let s = String(v).trim();
  if (s === '' || s === '-') return null;
  // Eliminar porcentaje y guardar como float (2.5% -> 2.5)
  const hadPct = s.endsWith('%');
  if (hadPct) s = s.slice(0, -1);
  // Detectar formato europeo "1.234,56" vs americano "1,234.56"
  // Heuristica: si hay coma Y punto, el ultimo es el decimal
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    if (lastComma > lastDot) {
      // Europeo: 1.234,56
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // Americano: 1,234.56
      s = s.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    // Solo coma. Si tiene 3 digitos despues, es separador de miles, si no decimal.
    const afterComma = s.length - lastComma - 1;
    if (afterComma === 3 && !s.includes('.')) {
      s = s.replace(/,/g, '');
    } else {
      s = s.replace(',', '.');
    }
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parsea fecha en formatos varios: dd/mm/yyyy, yyyy-mm-dd, "3 may 2026", dd.mm.yyyy
 */
export function toDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  // ISO yyyy-mm-dd
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // dd/mm/yyyy o dd/mm/yy
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let yr = m[3];
    if (yr.length === 2) yr = '20' + yr;
    return `${yr}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  // dd.mm.yyyy
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  // "3 may 2026" / "1 ene 2025"
  const meses = {
    ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06',
    jul: '07', ago: '08', sep: '09', oct: '10', nov: '11', dic: '12'
  };
  m = s.toLowerCase().match(/^(\d{1,2})\s+([a-z]{3})[a-z]*\.?\s+(\d{4})$/);
  if (m && meses[m[2]]) {
    return `${m[3]}-${meses[m[2]]}-${m[1].padStart(2, '0')}`;
  }
  return null;
}
