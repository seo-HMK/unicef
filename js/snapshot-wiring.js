/**
 * UNICEF Dashboard · Snapshot wiring
 *
 * Conecta los datos del snapshot (/api/data → window.UNICEF_API_DATA) con
 * las tablas y arrays hardcoded del dashboard:
 *
 *   - PAISES_APR  ←  snapshot.gsc.global.top_countries
 *   - IA_KWS      ←  snapshot.ahrefs_positions.top_ai_overview
 *   - DIAS_CAL    ←  snapshot.calendar.upcoming (o all)
 *   - KW          ←  snapshot.one_search.all
 *
 * Estrategia: mutar los arrays IN PLACE (.length=0; .push(...)) para que
 * sigan funcionando el resto de funciones del dashboard (filtros del
 * input de busqueda, ordenacion, etc).
 *
 * Cada wiring esta en su propio try/catch para que un fallo de una
 * fuente no rompa las demas.
 */

(function () {
  'use strict';

  /**
   * Mapa pais -> emoji bandera (top 25 que aparecen en GSC de unicef.es).
   * Los que no esten aqui muestran emoji generico.
   */
  const FLAGS = {
    'España': '🇪🇸', 'Spain': '🇪🇸',
    'México': '🇲🇽', 'Mexico': '🇲🇽',
    'Perú': '🇵🇪', 'Peru': '🇵🇪',
    'Argentina': '🇦🇷',
    'Colombia': '🇨🇴',
    'Guatemala': '🇬🇹',
    'Chile': '🇨🇱',
    'Venezuela': '🇻🇪',
    'Ecuador': '🇪🇨',
    'Bolivia': '🇧🇴',
    'Estados Unidos': '🇺🇸', 'United States': '🇺🇸', 'USA': '🇺🇸',
    'Honduras': '🇭🇳',
    'Puerto Rico': '🇵🇷',
    'República Dominicana': '🇩🇴', 'Dominican Republic': '🇩🇴',
    'El Salvador': '🇸🇻',
    'Nicaragua': '🇳🇮',
    'Costa Rica': '🇨🇷',
    'Paraguay': '🇵🇾',
    'Uruguay': '🇺🇾',
    'Cuba': '🇨🇺',
    'Panamá': '🇵🇦',
    'Francia': '🇫🇷', 'France': '🇫🇷',
    'Reino Unido': '🇬🇧', 'United Kingdom': '🇬🇧',
    'Alemania': '🇩🇪', 'Germany': '🇩🇪',
    'Italia': '🇮🇹', 'Italy': '🇮🇹',
    'Brasil': '🇧🇷', 'Brazil': '🇧🇷'
  };
  const flag = (country) => FLAGS[country] || '🌐';

  /**
   * Categoriza una URL segun los paths del sitio.
   * Para asignar las keywords IA a su "cat" original del dashboard.
   */
  function urlCategory(url) {
    if (!url) return 'Otros';
    if (url.includes('/blog/')) return 'Blog';
    if (url.includes('/noticia/')) return 'Noticias';
    if (url.includes('/causas/')) return 'Causas';
    if (url.includes('/educa/')) return 'Educa';
    if (url.includes('/colabora/')) return 'Colabora';
    if (url.includes('/testamento')) return 'Testamento';
    if (url.includes('/desgravacion')) return 'Desgravación';
    if (url.includes('/quienes-somos')) return 'Quienes somos';
    return 'Otros';
  }

  /**
   * Wire: PAISES_APR ← snapshot.gsc.global.top_countries
   */
  function wirePaises(snapshot) {
    if (!window.PAISES_APR || typeof window.renderPaises !== 'function') return false;
    const src = snapshot?.gsc?.global?.top_countries;
    if (!Array.isArray(src) || src.length === 0) return false;

    const mapped = src.slice(0, 10).map(c => ({
      p: c.country,
      f: flag(c.country),
      c: c.clicks || 0,
      pct: (c.clicks && c.clicks_prev)
        ? Math.round(((c.clicks - c.clicks_prev) / c.clicks_prev * 1000)) / 10
        : 0,
      sess: null,    // no tenemos sesiones por pais en snapshot actual
      sessPct: null
    }));

    window.PAISES_APR.length = 0;
    window.PAISES_APR.push(...mapped);
    window.renderPaises();
    return true;
  }

  /**
   * Wire: IA_KWS ← snapshot.ahrefs_positions.top_ai_overview
   *
   * Schema original IA_KWS: {kw, pos, sv, tr, kd, cat, url}
   */
  function wireIAKeywords(snapshot) {
    if (!window.IA_KWS || typeof window.renderIA !== 'function') return false;
    const src = snapshot?.ahrefs_positions?.top_ai_overview;
    if (!Array.isArray(src) || src.length === 0) return false;

    const mapped = src.map(k => ({
      kw: k.keyword,
      pos: k.position,
      sv: k.volume || 0,
      tr: k.traffic || 0,
      kd: k.difficulty || 0,
      cat: urlCategory(k.url),
      url: k.url ? k.url.replace(/^https?:\/\/[^/]+/, '') : ''
    }));

    window.IA_KWS.length = 0;
    window.IA_KWS.push(...mapped);
    window.renderIA();
    return true;
  }

  /**
   * Wire: DIAS_CAL ← snapshot.calendar.all (o .upcoming)
   *
   * Schema original DIAS_CAL: {dia, fecha, estado, url, mes}
   */
  function wireDiasCalendar(snapshot) {
    if (!window.DIAS_CAL || typeof window.renderDias !== 'function') return false;
    const src = snapshot?.calendar?.all;
    if (!Array.isArray(src) || src.length === 0) return false;

    const MESES = ['', 'Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

    const mapped = src.map(d => {
      const [y, m, day] = (d.date || '').split('-');
      return {
        dia: d.day,
        fecha: `${day || '?'}/${m || '?'}`,
        estado: d.status || 'Pendiente',
        url: d.url || null,
        mes: MESES[parseInt(m)] || ''
      };
    });

    window.DIAS_CAL.length = 0;
    window.DIAS_CAL.push(...mapped);
    window.renderDias();
    return true;
  }

  /**
   * Wire: KW (One Search keywords) ← snapshot.one_search.all
   *
   * Schema original KW: {query, clicsSEA, coste, impressions, clicsSEO, ctr, rankingSEO, stop, brand}
   */
  function wireOneSearchKeywords(snapshot) {
    if (!window.KW || !window.STOP_KW) return false;
    const src = snapshot?.one_search?.all;
    if (!Array.isArray(src) || src.length === 0) return false;

    const isBrand = (q) => /unicef/i.test(q);

    const mapped = src.map(r => {
      const stop = (r.seo_ranking !== null && r.seo_ranking <= 3 && r.sea_cost_eur > 0);
      return {
        query: r.query,
        clicsSEA: r.sea_clicks || 0,
        coste: r.sea_cost_eur || 0,
        impressions: r.impressions || 0,
        clicsSEO: r.seo_clicks || 0,
        ctr: (r.seo_ctr || 0) * 100,
        rankingSEO: r.seo_ranking || 0,
        stop,
        brand: isBrand(r.query)
      };
    });

    window.KW.length = 0;
    window.KW.push(...mapped);

    // STOP_KW es derivado: KW.filter(k=>k.stop)
    window.STOP_KW.length = 0;
    window.STOP_KW.push(...mapped.filter(k => k.stop));

    if (typeof window.renderStop === 'function') {
      try { window.renderStop(); } catch (e) {}
    }
    // No siempre hay funcion para renderizar la tabla "todas las keywords",
    // se renderiza vía os-tbody pero su funcion exacta puede variar.

    return true;
  }

  // ──────────────────────────────────────────────────────
  // Wirings de tablas HARDCODED y CHARTS
  // ──────────────────────────────────────────────────────

  /**
   * Wire: s1 KPI strip — los 4 cells grandes que el usuario ve nada mas cargar.
   * Esos cells NO tienen clases (kpi-strip/kpi-cell), solo estilos inline,
   * por eso applyMonthToUI no los modifica.
   *
   * Estructura de cada cell (4 cells, en orden):
   *   children[0] = titulo
   *   children[1] = numero grande (delta % o conteo)
   *   children[2] = valor vs previous
   *   children[3] = footer global / contexto
   */
  function wireS1KpiStrip(snapshot) {
    const sec = document.getElementById('s1');
    if (!sec) return false;
    // El strip es el div grid con 4 columnas justo despues del header
    const strip = sec.querySelector('div[style*="grid-template-columns:repeat(4,1fr)"]');
    if (!strip) return false;
    const cells = strip.children;
    if (cells.length < 4) return false;

    const fmtNum = (n) => n === null || n === undefined ? '—' : n.toLocaleString('es-ES');
    const fmtBig = (n) => {
      if (n === null || n === undefined) return '—';
      if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2).replace('.', ',') + 'M';
      if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(2).replace('.', ',') + 'K';
      return n.toLocaleString('es-ES');
    };
    const pct = (a, b) => (a !== null && b) ? ((a - b) / b * 100) : null;
    const fmtPct = (p) => p === null ? '—' : (p >= 0 ? '+' : '') + p.toFixed(1).replace('.', ',') + '%';
    const colorPct = (p, inverse) => {
      if (p === null) return 'var(--u-gray)';
      const good = inverse ? (p < 0) : (p >= 0);
      return good ? 'var(--u-green)' : 'var(--u-red)';
    };

    // Datos snapshot
    const spainKpi = snapshot?.gsc?.spain?.kpi || {};
    const topCountries = snapshot?.gsc?.global?.top_countries || [];
    const ia = snapshot?.unicef_month?.ia ?? snapshot?.ahrefs_positions?.keywords_with_ai_overview;
    const ga4 = snapshot?.ga4?.kpi || {};

    // Calcular global como suma de top countries
    const globalClicks = topCountries.reduce((s, c) => s + (c.clicks || 0), 0);
    const globalClicksPrev = topCountries.reduce((s, c) => s + (c.clicks_prev || 0), 0);
    const globalImpr = topCountries.reduce((s, c) => s + (c.impressions || 0), 0);

    const periodLabel = snapshot?.snapshot?.period?.label || snapshot?.unicef_month?.label || '';
    const comparisonLabel = snapshot?.snapshot?.comparison?.label || '';
    const vsLabel = comparisonLabel ? ' (' + comparisonLabel + ')' : '';

    // Helper: actualizar el cell
    function updateCell(cell, { titleHtml, bigText, bigColor, valueHtml, footerHtml }) {
      if (cell.children.length < 4) return;
      if (titleHtml)  cell.children[0].innerHTML = titleHtml;
      if (bigText)    cell.children[1].textContent = bigText;
      if (bigColor)   cell.children[1].style.color = bigColor;
      if (valueHtml)  cell.children[2].innerHTML = valueHtml;
      if (footerHtml) cell.children[3].innerHTML = footerHtml;
    }

    // ── Cell 1: Clics España ──
    const clicksDelta = pct(spainKpi.clicks, spainKpi.clicks_prev);
    const globalClicksDelta = pct(globalClicks, globalClicksPrev);
    updateCell(cells[0], {
      bigText: fmtPct(clicksDelta),
      bigColor: colorPct(clicksDelta),
      valueHtml: fmtNum(spainKpi.clicks) + ' <span style="font-size:11px;font-weight:400;color:var(--u-gray)">vs ' + fmtNum(spainKpi.clicks_prev) + vsLabel + '</span>',
      footerHtml: 'Global: <span style="color:' + colorPct(globalClicksDelta) + ';font-weight:600">' + fmtPct(globalClicksDelta) + '</span> · ' + fmtNum(globalClicks) + ' vs ' + fmtNum(globalClicksPrev)
    });

    // ── Cell 2: Impresiones España ──
    const imprDelta = pct(spainKpi.impressions, spainKpi.impressions_prev);
    updateCell(cells[1], {
      bigText: fmtPct(imprDelta),
      bigColor: colorPct(imprDelta),
      valueHtml: fmtBig(spainKpi.impressions) + ' <span style="font-size:11px;font-weight:400;color:var(--u-gray)">vs ' + fmtBig(spainKpi.impressions_prev) + vsLabel + '</span>',
      footerHtml: 'Global: <span style="color:var(--u-gray);font-weight:600">' + fmtBig(globalImpr) + '</span> imp · top ' + topCountries.length + ' paises'
    });

    // ── Cell 3: Sesiones GA4 ──
    const sessDelta = pct(ga4.sessions, ga4.sessions_yoy);
    updateCell(cells[2], {
      bigText: fmtPct(sessDelta),
      bigColor: colorPct(sessDelta),
      valueHtml: fmtNum(ga4.sessions) + ' <span style="font-size:11px;font-weight:400;color:var(--u-gray)">vs ' + fmtNum(ga4.sessions_yoy) + vsLabel + '</span>',
      footerHtml: 'Periodo: <span style="font-weight:600;color:var(--u-navy)">' + periodLabel + '</span> · YoY'
    });

    // ── Cell 4: Keywords en IA Overview ──
    updateCell(cells[3], {
      bigText: ia !== null && ia !== undefined ? ia.toLocaleString('es-ES') : '—',
      bigColor: 'var(--u-navy)',
      valueHtml: '<strong>Mayo 2026</strong>',
      footerHtml: 'CTR España: <span style="font-weight:600;color:var(--u-navy)">' + (spainKpi.ctr ? spainKpi.ctr.toFixed(2).replace('.', ',') + '%' : '—') + '</span> · Posición: ' + (spainKpi.position ? spainKpi.position.toFixed(2).replace('.', ',') : '—')
    });

    return true;
  }

  /**
   * Wire: tbody#s5-blog-tbody ← snapshot.gsc.by_section.blog.top_pages
   * Schema target (<tr> con 3 columnas): url corta · clics · vs 2025 tag
   */
  function wireTopBlogUrls(snapshot) {
    const tbody = document.getElementById('s5-blog-tbody');
    if (!tbody) return false;
    const pages = snapshot?.gsc?.by_section?.blog?.top_pages;
    if (!Array.isArray(pages) || pages.length === 0) return false;

    const rows = pages.slice(0, 15).map(p => {
      const shortUrl = (p.url || '').replace(/^https?:\/\/[^/]+/, '') || '(?)';
      const clicks = (p.clicks || 0).toLocaleString('es-ES');
      const prev = p.clicks_prev;
      let delta;
      if (prev === null || prev === undefined) {
        delta = '<span class="tag tag-up">nueva</span>';
      } else if (prev === 0) {
        delta = '<span class="tag tag-up">nueva</span>';
      } else {
        const pct = Math.round((p.clicks - prev) / prev * 100);
        const sign = pct >= 0 ? '+' : '';
        const cls = pct >= 0 ? 'tag-up' : 'tag-down';
        delta = '<span class="tag ' + cls + '">' + sign + pct + '%</span>';
      }
      const color = (prev && p.clicks < prev) ? 'var(--u-red)' : 'var(--u-cyan-dark)';
      return '<tr><td style="max-width:320px">' +
        '<a href="' + (p.url || '#') + '" target="_blank" style="color:' + color + ';font-size:12px;text-decoration:none;word-break:break-all">' + shortUrl + '</a>' +
        '</td><td style="text-align:right">' + clicks + '</td>' +
        '<td>' + delta + '</td></tr>';
    });
    tbody.innerHTML = rows.join('');
    return true;
  }

  /**
   * Wire: tbody#s9-noticias-tbody ← snapshot.gsc.by_section.noticia.top_pages
   * Schema target (<tr> con 5 columnas): titulo+url · clics · vs 2025 · tipo · pos media
   */
  function wireTopNoticias(snapshot) {
    const tbody = document.getElementById('s9-noticias-tbody');
    if (!tbody) return false;
    const pages = snapshot?.gsc?.by_section?.noticia?.top_pages;
    if (!Array.isArray(pages) || pages.length === 0) return false;

    const guessType = (url) => {
      const u = (url || '').toLowerCase();
      if (/gaza|ucrania|siria|sudan|conflict|guerra|israel|palestina|emergencia/.test(u)) {
        return { label: '🔴 Emergencia', bg: 'var(--u-red-light)', fg: 'var(--u-red)' };
      }
      if (/informe|publicacion|reporte/.test(u)) {
        return { label: '📊 Informe', bg: 'var(--u-cyan-light)', fg: 'var(--u-cyan-dark)' };
      }
      return { label: '🏢 Institucional', bg: 'var(--u-gray-light)', fg: 'var(--u-gray)' };
    };

    const titleFromUrl = (url) => {
      const last = (url || '').replace(/\/$/, '').split('/').pop() || '';
      return last.replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase());
    };

    const rows = pages.slice(0, 8).map(p => {
      const shortUrl = (p.url || '').replace(/^https?:\/\/[^/]+/, '');
      const tipo = guessType(p.url);
      const title = titleFromUrl(p.url);
      const clicks = (p.clicks || 0).toLocaleString('es-ES');
      const prev = p.clicks_prev;
      let deltaHtml;
      if (!prev) {
        deltaHtml = '<span style="font-size:11px;font-weight:700;color:var(--u-green)">Nueva</span>';
      } else {
        const pct = Math.round((p.clicks - prev) / prev * 100);
        const color = pct >= 0 ? 'var(--u-green)' : 'var(--u-red)';
        deltaHtml = '<span style="font-size:11px;font-weight:700;color:' + color + '">' + (pct >= 0 ? '+' : '') + pct + '%</span>';
      }
      const pos = p.position ? p.position.toFixed(2) : '—';

      return '<tr><td style="max-width:320px">' +
        '<div style="font-size:12px;font-weight:600;color:var(--u-navy)">' + title + '</div>' +
        '<div style="font-size:10px;margin-top:2px"><a href="' + (p.url || '#') + '" target="_blank" style="color:var(--u-cyan-dark);text-decoration:none;word-break:break-all">' + shortUrl + '</a></div>' +
        '</td>' +
        '<td style="text-align:right;font-family:Baikal,sans-serif;font-weight:700;font-size:14px;color:var(--u-navy)">' + clicks + '</td>' +
        '<td style="text-align:right">' + deltaHtml + '</td>' +
        '<td style="text-align:center"><span style="font-size:10px;padding:2px 7px;border-radius:3px;font-weight:600;background:' + tipo.bg + ';color:' + tipo.fg + '">' + tipo.label + '</span></td>' +
        '<td style="text-align:right;font-size:11px;color:var(--u-gray)">' + pos + '</td>' +
        '</tr>';
    });
    tbody.innerHTML = rows.join('');
    return true;
  }

  /**
   * Wire: catChart (Chart.js bar horizontal) ← snapshot.ga4.by_category_clicks
   * Cada categoria con su % delta (Url Clicks %Δ).
   */
  function wireCatChart(snapshot) {
    if (typeof window.Chart === 'undefined') return false;
    const canvas = document.getElementById('catChart');
    if (!canvas) return false;
    const cats = snapshot?.ga4?.by_category_clicks;
    if (!Array.isArray(cats) || cats.length === 0) return false;

    const sorted = cats
      .filter(c => c.url_clicks_delta !== null && c.url_clicks_delta !== undefined)
      .map(c => ({ n: c.category, v: c.url_clicks_delta * 100 }))
      .sort((a, b) => b.v - a.v);

    if (sorted.length === 0) return false;

    const chart = window.Chart.getChart(canvas);
    if (!chart) return false;

    chart.data.labels = sorted.map(c => c.n);
    chart.data.datasets[0].data = sorted.map(c => c.v);
    chart.data.datasets[0].backgroundColor = sorted.map(c =>
      c.v > 0 ? 'rgba(0,182,122,.85)' : 'rgba(232,0,45,.85)'
    );
    chart.update('none');
    return true;
  }

  /**
   * Wire: sessChart (Chart.js stacked bar) ← snapshot.ga4.monthly
   * Anade el dato de Mayo 2026 al g26 dataset (global). Las series anteriores
   * (2023, 2024, 2025) se mantienen ya que son historicas hardcoded.
   */
  function wireSessChart(snapshot) {
    if (typeof window.Chart === 'undefined') return false;
    const canvas = document.getElementById('sessChart');
    if (!canvas) return false;
    const monthly = snapshot?.ga4?.monthly;
    if (!Array.isArray(monthly) || monthly.length === 0) return false;
    const chart = window.Chart.getChart(canvas);
    if (!chart) return false;

    // Buscar el dataset "2026 global"
    const ds2026Global = chart.data.datasets.find(d => /2026.*🌍|2026.*global/i.test(d.label));
    if (!ds2026Global) return false;

    // Rellenar meses 2026 que tenemos en monthly history
    const monthlyMap = Object.fromEntries(monthly.map(r => [r.key, r.sessions]));
    for (let m = 1; m <= 12; m++) {
      const key = '2026-' + String(m).padStart(2, '0');
      if (monthlyMap[key] !== undefined && monthlyMap[key] !== null) {
        ds2026Global.data[m - 1] = monthlyMap[key];
      }
    }
    chart.update('none');
    return true;
  }

  /**
   * Wire: actualizar referencias textuales "Abril 2026" -> "Mayo 2026" (etc)
   * en encabezados de tablas y section-headings. Evitar tocar el bandTag
   * que ya gestiona applyMonthToUI, y los textos analiticos (sum-body).
   */
  function wireDateLabels(snapshot) {
    const label = snapshot?.snapshot?.period?.label || snapshot?.period?.label;
    if (!label) return false;
    // Solo modificar elementos con clase 'section-heading' que contengan "Abril 2026"
    let count = 0;
    document.querySelectorAll('.section-heading, .slide-footer div').forEach(el => {
      if (el.textContent && el.textContent.includes('Abril 2026')) {
        el.innerHTML = el.innerHTML.split('Abril 2026').join(label);
        count++;
      }
    });
    return count > 0;
  }

  /**
   * Hook a applyMonthToUI del dashboard. Cuando el usuario cambia de mes en
   * el dropdown, switchMonth llama a applyMonthToUI(MONTHS[key]). Tras esa
   * llamada, re-ejecutamos nuestro wireS1KpiStrip CON LOS DATOS DEL SNAPSHOT
   * para garantizar que la cabecera siempre muestre Mayo 2026.
   *
   * (Si en el futuro queremos comportamiento por mes, aqui filtraremos.)
   */
  function installApplyMonthHook() {
    if (window._UNICEF_APPLY_MONTH_HOOKED) return;
    const original = window.applyMonthToUI;
    if (typeof original !== 'function') {
      console.warn('[UNICEF] applyMonthToUI no existe aun, no instalo hook');
      return;
    }
    window.applyMonthToUI = function(m) {
      try { original.call(this, m); }
      catch (e) { console.warn('[UNICEF] original applyMonthToUI failed:', e); }
      // Tras render del dashboard, re-aplicar nuestras wirings
      if (window.UNICEF_API_DATA) {
        try { wireS1KpiStrip(window.UNICEF_API_DATA); } catch (e) {}
      }
    };
    window._UNICEF_APPLY_MONTH_HOOKED = true;
    console.info('[UNICEF] hook applyMonthToUI instalado');
  }

  /**
   * Aplica TODO el wiring del snapshot. Cada uno aislado en try/catch.
   */
  window.applySnapshotWiring = function applySnapshotWiring(data) {
    installApplyMonthHook();
    if (!data) return;
    const results = {};
    const wirings = [
      ['s1_kpi',      () => wireS1KpiStrip(data)],
      ['paises',      () => wirePaises(data)],
      ['ia_kw',       () => wireIAKeywords(data)],
      ['calendar',    () => wireDiasCalendar(data)],
      ['one_search',  () => wireOneSearchKeywords(data)],
      ['top_blog',    () => wireTopBlogUrls(data)],
      ['top_noticia', () => wireTopNoticias(data)],
      ['cat_chart',   () => wireCatChart(data)],
      ['sess_chart',  () => wireSessChart(data)],
      ['date_labels', () => wireDateLabels(data)]
    ];
    for (const [name, fn] of wirings) {
      try { results[name] = fn(); }
      catch (e) { results[name] = false; console.warn('[UNICEF] wiring ' + name + ' failed:', e); }
    }
    console.info('[UNICEF] applySnapshotWiring:', results);
    showDebugBanner(data, results);
    return results;
  };

  /**
   * Banner DEBUG: prueba visual de que el wiring corrio.
   * Se quita solo a los 8 segundos. Para retirarlo definitivamente,
   * eliminar esta funcion y la llamada arriba.
   */
  function showDebugBanner(data, results) {
    try {
      const banner = document.createElement('div');
      banner.id = 'unicef-debug-banner';
      const okCount = Object.values(results).filter(Boolean).length;
      const totalCount = Object.values(results).length;
      const period = data.snapshot?.period?.label || data.unicef_month?.label || '?';
      const summary = Object.entries(results)
        .map(([k, v]) => k + ':' + (v ? 'OK' : 'KO'))
        .join(' · ');
      banner.innerHTML =
        '<div style="position:fixed;top:10px;left:50%;transform:translateX(-50%);' +
        'background:linear-gradient(90deg,#0CC0DF 0%,#003F7D 100%);color:#fff;' +
        'padding:14px 28px;border-radius:8px;box-shadow:0 8px 32px rgba(0,63,125,.4);' +
        'z-index:99999;font-family:Baikal,Roboto,sans-serif;font-weight:600;' +
        'font-size:14px;letter-spacing:.3px;border:2px solid #fff;' +
        'display:flex;align-items:center;gap:14px;max-width:90vw">' +
        '<span style="font-size:22px">✓</span>' +
        '<div>' +
          '<div style="font-size:16px;font-weight:800;letter-spacing:.5px">DATOS ACTUALIZADOS A ' + period + '</div>' +
          '<div style="font-size:10px;opacity:.9;margin-top:3px">Wirings ' + okCount + '/' + totalCount + ' OK · ' + summary + '</div>' +
        '</div>' +
        '<button onclick="document.getElementById(\'unicef-debug-banner\').remove()" ' +
          'style="background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.5);' +
          'color:#fff;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px">cerrar</button>' +
        '</div>';
      document.body.appendChild(banner);
      setTimeout(() => {
        const el = document.getElementById('unicef-debug-banner');
        if (el) el.remove();
      }, 12000);
    } catch (e) { console.warn('[UNICEF] banner failed:', e); }
  }
})();
