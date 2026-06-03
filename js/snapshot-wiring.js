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

  /**
   * Aplica TODO el wiring del snapshot. Cada uno aislado en try/catch.
   */
  window.applySnapshotWiring = function applySnapshotWiring(data) {
    if (!data) return;
    const results = {};
    const wirings = [
      ['paises',    () => wirePaises(data)],
      ['ia_kw',     () => wireIAKeywords(data)],
      ['calendar',  () => wireDiasCalendar(data)],
      ['one_search', () => wireOneSearchKeywords(data)]
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
      banner.innerHTML =
        '<div style="position:fixed;top:10px;left:50%;transform:translateX(-50%);' +
        'background:linear-gradient(90deg,#0CC0DF 0%,#003F7D 100%);color:#fff;' +
        'padding:14px 28px;border-radius:8px;box-shadow:0 8px 32px rgba(0,63,125,.4);' +
        'z-index:99999;font-family:Baikal,Roboto,sans-serif;font-weight:600;' +
        'font-size:14px;letter-spacing:.3px;border:2px solid #fff;' +
        'display:flex;align-items:center;gap:14px">' +
        '<span style="font-size:22px">✓</span>' +
        '<div>' +
          '<div style="font-size:16px;font-weight:800;letter-spacing:.5px">DATOS API CARGADOS: ' + period + '</div>' +
          '<div style="font-size:11px;opacity:.9;margin-top:3px">' +
            'Wirings OK: ' + okCount + '/' + totalCount + ' · ' +
            'Paises: ' + (results.paises ? 'OK' : 'KO') + ' · ' +
            'IA kw: ' + (results.ia_kw ? 'OK' : 'KO') + ' · ' +
            'Calendario: ' + (results.calendar ? 'OK' : 'KO') + ' · ' +
            'One Search: ' + (results.one_search ? 'OK' : 'KO') +
          '</div>' +
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
