/**
 * UNICEF Dashboard · Data loader
 *
 * 1. Carga GET /api/data al arrancar la pagina.
 * 2. Inyecta el unicef_month (KPI cabecera del periodo del snapshot) en el
 *    dashboard llamando a:
 *       window.MONTHS[key] = month       (solo si no existe en localStorage)
 *       window.ACTIVE_KEY  = key
 *       window.rebuildSelector()         (refresca el desplegable)
 *       window.applyMonthToUI(month)     (renderiza KPIs)
 *    Asi el usuario PUEDE seleccionar el periodo nuevo en el dropdown.
 * 3. No persiste a localStorage. Las ediciones manuales del modal siguen
 *    siendo el override prioritario para ese mes.
 * 4. Expone window.UNICEF_API_DATA para que otras secciones (charts, tablas)
 *    enganchen.
 * 5. Emite evento "unicef:data-ready".
 * 6. Actualiza el indicador #api-status del header.
 */

(function () {
  'use strict';

  const ENDPOINT = '/api/data';
  const TIMEOUT_MS = 12000;
  const STORAGE_KEY = 'unicef_seo_months';

  window.UNICEF_API_DATA = null;
  window.UNICEF_API_STATE = 'loading';

  function setStatusIndicator(state, detail) {
    const el = document.getElementById('api-status');
    if (!el) return;
    const map = {
      loading: { text: 'API · cargando',   color: '#888'    },
      live:    { text: 'API · live',       color: '#2db569' },
      partial: { text: 'API · parcial',    color: '#e0a82e' },
      offline: { text: 'API · offline',    color: '#888'    },
      error:   { text: 'API · error',      color: '#d94949' }
    };
    const cfg = map[state] || map.error;
    el.textContent = cfg.text;
    el.style.color = cfg.color;
    el.title = detail || '';
  }

  function readUserStored() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }

  /**
   * Inyecta el mes del API en el dashboard:
   *   - Anade al objeto MONTHS (en memoria) si el usuario NO lo tiene en localStorage
   *   - Refresca el dropdown con rebuildSelector
   *   - Renderiza los KPIs con applyMonthToUI
   */
  function injectMonthFromAPI(month) {
    if (!month || !month.key) return false;

    const stored = readUserStored();
    const userHasIt = !!stored[month.key];

    // Anadir/actualizar en memoria (sin tocar localStorage)
    if (window.MONTHS && typeof window.MONTHS === 'object') {
      if (!userHasIt) {
        window.MONTHS[month.key] = month;
      }
      // Activar el mes nuevo si no hay uno activo o el activo es mas viejo
      const cur = window.ACTIVE_KEY;
      if (!cur || cur < month.key) {
        window.ACTIVE_KEY = month.key;
      }
    }

    // Refrescar selector
    if (typeof window.rebuildSelector === 'function') {
      try { window.rebuildSelector(); } catch (e) { console.warn('[UNICEF] rebuildSelector failed:', e); }
    }

    // Renderizar (siempre con el mes del API, salvo que el usuario lo tenga en localStorage)
    const toRender = userHasIt ? stored[month.key] : month;
    if (typeof window.applyMonthToUI === 'function') {
      try { window.applyMonthToUI(toRender); } catch (e) { console.warn('[UNICEF] applyMonthToUI failed:', e); }
    }

    console.info('[UNICEF] month injected:', month.key, '· user override:', userHasIt);
    return true;
  }

  function notify(state, data, error) {
    window.UNICEF_API_STATE = state;
    window.UNICEF_API_DATA = data || null;
    setStatusIndicator(
      state,
      data ? `Periodo: ${data.snapshot?.period?.label || '?'} · Gen: ${data.snapshot?.generated_at || data.generated_at || '?'}` : (error?.message || '')
    );

    if (data && data.unicef_month) {
      injectMonthFromAPI(data.unicef_month);
    }

    document.dispatchEvent(new CustomEvent('unicef:data-ready', {
      detail: { state, data, error }
    }));
  }

  async function loadData() {
    setStatusIndicator('loading');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(ENDPOINT, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) {
        if (res.status === 404) {
          notify('offline', null, new Error('/api/data no disponible'));
          return;
        }
        notify('error', null, new Error(`/api/data ${res.status}`));
        return;
      }
      const data = await res.json();
      const sources = data.sources_available || {};
      const okCount = ['snapshot', 'ahrefs', 'gsc', 'ga4'].filter(k => sources[k]).length;
      const allReady = okCount === 4;
      notify(allReady ? 'live' : 'partial', data);
      console.info('[UNICEF dashboard] /api/data:', `${okCount}/4 sources ready`, data);
    } catch (e) {
      clearTimeout(t);
      notify('error', null, e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadData);
  } else {
    loadData();
  }
})();
