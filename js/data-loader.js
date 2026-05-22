/**
 * UNICEF Dashboard · Data loader
 *
 * Carga /api/data al arrancar la pagina y expone window.UNICEF_API_DATA.
 * Emite el evento "unicef:data-ready" cuando termina (exito o fallo).
 * Actualiza el indicador visual #api-status en el header.
 *
 * Estrategia de fallback: si /api/data falla (404 en local sin vercel
 * dev, error de red, etc), el dashboard sigue funcionando con sus
 * arrays hardcodeados/localStorage como antes. El loader es opt-in.
 */

(function () {
  'use strict';

  const ENDPOINT = '/api/data';
  const TIMEOUT_MS = 8000;

  window.UNICEF_API_DATA = null;
  window.UNICEF_API_STATE = 'loading'; // loading | live | offline | error

  function setStatusIndicator(state, detail) {
    const el = document.getElementById('api-status');
    if (!el) return;
    const map = {
      loading:  { text: 'API · cargando',     color: '#888'           },
      live:     { text: 'API · live',         color: '#2db569'        },
      partial:  { text: 'API · parcial',      color: '#e0a82e'        },
      offline:  { text: 'API · offline',      color: '#888'           },
      error:    { text: 'API · error',        color: '#d94949'        }
    };
    const cfg = map[state] || map.error;
    el.textContent = cfg.text;
    el.style.color = cfg.color;
    el.title = detail || '';
  }

  function notify(state, data, error) {
    window.UNICEF_API_STATE = state;
    window.UNICEF_API_DATA = data || null;
    setStatusIndicator(
      state,
      data ? `Generado: ${data.generated_at || '?'}` : (error?.message || '')
    );
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
          // Probable: dashboard servido como HTML estatico, sin /api.
          notify('offline', null, new Error('/api/data no disponible (servido como estatico)'));
          return;
        }
        notify('error', null, new Error(`/api/data ${res.status}`));
        return;
      }
      const data = await res.json();
      const sources = data.sources_available || {};
      const allReady = sources.ahrefs && sources.sistrix && sources.gsc && sources.ga4;
      notify(allReady ? 'live' : 'partial', data);
      console.info('[UNICEF dashboard] API data:', data);
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
