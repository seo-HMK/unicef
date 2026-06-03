/**
 * UNICEF Dashboard · Data loader
 *
 * 1. Carga GET /api/data al arrancar la pagina.
 * 2. Si /api/data devuelve un `unicef_month` (KPI cabecera del mes), lo inyecta
 *    en el dashboard usando las funciones globales applyMonthToUI/MONTHS si
 *    estan disponibles. NO toca localStorage (las ediciones manuales del
 *    modal siguen siendo el override prioritario para esos meses).
 * 3. Expone window.UNICEF_API_DATA para que otras secciones (charts, tablas)
 *    enganchen.
 * 4. Emite evento "unicef:data-ready" para integraciones futuras.
 * 5. Actualiza el indicador #api-status del header.
 *
 * Fallback: si /api/data falla o no esta disponible, el dashboard sigue
 * funcionando con los arrays JS hardcodeados / localStorage como antes.
 */

(function () {
  'use strict';

  const ENDPOINT = '/api/data';
  const TIMEOUT_MS = 12000;

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

  /**
   * Inyecta el unicef_month en el dashboard llamando a applyMonthToUI con los
   * datos del API. NO toca MONTHS ni localStorage (no son accesibles desde
   * aqui porque estan en let-scope). El selector de meses solo mostrara los
   * meses que ya estaban en localStorage; este loader solo actualiza los
   * NUMEROS visibles a los del periodo del snapshot.
   *
   * Si el usuario abre el modal y guarda un mes manualmente, ese si va a
   * localStorage por el flujo normal del dashboard.
   */
  function injectMonthFromAPI(month) {
    if (!month || !month.key) return false;
    if (typeof window.applyMonthToUI !== 'function') {
      console.info('[UNICEF] applyMonthToUI no disponible aun; data-loader sin efecto en KPIs');
      return false;
    }
    try {
      window.applyMonthToUI(month);
      return true;
    } catch (e) {
      console.warn('[UNICEF] applyMonthToUI failed:', e);
      return false;
    }
  }

  function notify(state, data, error) {
    window.UNICEF_API_STATE = state;
    window.UNICEF_API_DATA = data || null;
    setStatusIndicator(
      state,
      data ? `Periodo: ${data.snapshot?.period?.label || '?'} · Gen: ${data.snapshot?.generated_at || data.generated_at || '?'}` : (error?.message || '')
    );

    // Inyectar KPIs cabecera si vienen
    if (data && data.unicef_month) {
      const injected = injectMonthFromAPI(data.unicef_month);
      if (injected) console.info('[UNICEF] unicef_month injected:', data.unicef_month.key, data.unicef_month);
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
          notify('offline', null, new Error('/api/data no disponible (servido como estatico)'));
          return;
        }
        notify('error', null, new Error(`/api/data ${res.status}`));
        return;
      }
      const data = await res.json();
      const sources = data.sources_available || {};
      const okCount = ['snapshot', 'ahrefs', 'gsc', 'ga4'].filter(k => sources[k]).length;
      const totalCount = 4;
      const allReady = okCount === totalCount;
      notify(allReady ? 'live' : 'partial', data);
      console.info('[UNICEF dashboard] /api/data:', `${okCount}/${totalCount} sources ready`, data);
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
