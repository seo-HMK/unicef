/**
 * UNICEF Dashboard · Data loader
 *
 * Carga GET /api/data al arrancar y, una vez el dashboard interno ha hecho
 * su boot (DOMContentLoaded + sus propias inicializaciones), inyecta el
 * unicef_month del periodo del snapshot.
 *
 * Importante: garantizamos que nuestra llamada a applyMonthToUI ocurre
 * SIEMPRE DESPUES del DOMContentLoaded listener del dashboard (que
 * renderiza el SEED_MONTH = Abril por defecto). Si no, hay una race en la
 * que nuestra inyeccion ocurre antes y el dashboard la sobreescribe.
 *
 * Estrategia:
 *   1. La fetch se inicia inmediatamente (no esperamos DOMContentLoaded).
 *   2. Cuando llega la respuesta, guardamos pendingData.
 *   3. Esperamos a que dashboardBooted=true antes de aplicar.
 *   4. dashboardBooted=true se setea DESPUES de DOMContentLoaded + 200ms,
 *      para dar tiempo a que el boot del dashboard corra sus propios
 *      applyMonthToUI(April) primero.
 *   5. Si llega pendingData antes de que dashboardBooted=true: la aplicacion
 *      se ejecutara cuando dashboardBooted se active.
 *   6. Si dashboardBooted=true llega antes que pendingData: la aplicacion
 *      ocurre en cuanto resuelve la fetch.
 */

(function () {
  'use strict';

  const ENDPOINT = '/api/data';
  const TIMEOUT_MS = 12000;
  const BOOT_DELAY_MS = 200;
  const STORAGE_KEY = 'unicef_seo_months';

  window.UNICEF_API_DATA = null;
  window.UNICEF_API_STATE = 'loading';

  let pendingData = null;
  let pendingError = null;
  let dashboardBooted = false;

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

  function injectMonthFromAPI(month) {
    if (!month || !month.key) return false;

    const stored = readUserStored();
    const userHasIt = !!stored[month.key];

    if (window.MONTHS && typeof window.MONTHS === 'object') {
      if (!userHasIt) {
        window.MONTHS[month.key] = month;
      }
      const cur = window.ACTIVE_KEY;
      if (!cur || cur < month.key) {
        window.ACTIVE_KEY = month.key;
      }
    } else {
      console.warn('[UNICEF] window.MONTHS no accesible — el HTML deployado puede tener cache vieja');
    }

    if (typeof window.rebuildSelector === 'function') {
      try { window.rebuildSelector(); } catch (e) { console.warn('[UNICEF] rebuildSelector failed:', e); }
    }

    const toRender = userHasIt ? stored[month.key] : month;
    if (typeof window.applyMonthToUI === 'function') {
      try {
        window.applyMonthToUI(toRender);
        console.info('[UNICEF] applyMonthToUI con', month.key, '· user override:', userHasIt);
      } catch (e) {
        console.warn('[UNICEF] applyMonthToUI failed:', e);
      }
    } else {
      console.warn('[UNICEF] window.applyMonthToUI no disponible');
    }

    return true;
  }

  function tryApply() {
    if (!dashboardBooted) {
      console.debug('[UNICEF] tryApply: dashboard aun no booted, esperando');
      return;
    }
    if (pendingData) {
      const state = window.UNICEF_API_STATE;
      setStatusIndicator(
        state,
        `Periodo: ${pendingData.snapshot?.period?.label || '?'} · Gen: ${pendingData.snapshot?.generated_at || pendingData.generated_at || '?'}`
      );
      if (pendingData.unicef_month) {
        injectMonthFromAPI(pendingData.unicef_month);
      }
      // Wiring de tablas/listas hardcoded del dashboard con datos del snapshot
      if (typeof window.applySnapshotWiring === 'function') {
        try { window.applySnapshotWiring(pendingData); }
        catch (e) { console.warn('[UNICEF] applySnapshotWiring failed:', e); }
      }
      document.dispatchEvent(new CustomEvent('unicef:data-ready', {
        detail: { state, data: pendingData, error: null }
      }));
    } else if (pendingError) {
      setStatusIndicator('error', pendingError.message || '');
      document.dispatchEvent(new CustomEvent('unicef:data-ready', {
        detail: { state: 'error', data: null, error: pendingError }
      }));
    }
  }

  function notify(state, data, error) {
    window.UNICEF_API_STATE = state;
    window.UNICEF_API_DATA = data || null;
    if (data) pendingData = data;
    if (error) pendingError = error;
    setStatusIndicator(state, error?.message);
    tryApply();
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
      console.info('[UNICEF dashboard] /api/data:', `${okCount}/4 sources ready`);
    } catch (e) {
      clearTimeout(t);
      notify('error', null, e);
    }
  }

  // ── Inicio: arrancar fetch YA y esperar boot del dashboard ──

  // 1) Fetch arranca inmediatamente
  loadData();

  // 2) Marcar boot completado DESPUES del DOMContentLoaded del dashboard
  function markDashboardBooted() {
    setTimeout(() => {
      dashboardBooted = true;
      console.debug('[UNICEF] dashboard booted, aplicando data si disponible');
      tryApply();
    }, BOOT_DELAY_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', markDashboardBooted, { once: true });
  } else {
    // DOMContentLoaded ya paso (readyState=interactive o complete)
    // El boot del dashboard puede haber corrido ya o estar a punto.
    // Damos un pequeno margen igual.
    markDashboardBooted();
  }
})();
