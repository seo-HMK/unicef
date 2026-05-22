/**
 * Sistrix API client
 * Docs: https://www.sistrix.com/api
 * Auth: api_key como query param
 *
 * Endpoints usados (verificados):
 *   /credits                          -> creditos restantes (no consume)
 *   /domain.sichtbarkeitsindex        -> Visibility Index (history=true para serie temporal)
 *   /domain.kwcount.seo               -> conteo total de keywords organicas
 *   /domain.kw                        -> lista de keywords con posicion, volumen, URL
 *   /domain.urls                      -> top URLs con top10, top100, visindex
 *   /domain.competitors.seo           -> competidores
 */

const BASE = 'https://api.sistrix.com';

async function sistrixFetch(endpoint, params = {}) {
  const key = process.env.SISTRIX_API_KEY;
  if (!key) throw new Error('SISTRIX_API_KEY no configurado');

  const url = new URL(BASE + endpoint);
  url.searchParams.set('api_key', key);
  url.searchParams.set('format', 'json');
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sistrix ${endpoint} ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  if (json.status === 'fail') {
    const err = json.error?.[0]?.error_message || 'unknown';
    if (err === 'no result') return null;
    throw new Error(`Sistrix ${endpoint}: ${err}`);
  }
  return json;
}

export async function credits() {
  const data = await sistrixFetch('/credits');
  return data?.answer?.[0]?.credits?.[0]?.value;
}

export async function visibilityIndex({ domain, country = 'es', mobile = false }) {
  const params = { domain, country };
  if (mobile) params.mobile = 'true';
  const data = await sistrixFetch('/domain.sichtbarkeitsindex', params);
  return data?.answer?.[0]?.sichtbarkeitsindex?.[0] || null;
}

export async function visibilityHistory({ domain, country = 'es', daily = false, mobile = false }) {
  const params = { domain, country, history: 'true' };
  if (daily) params.daily = 'true';
  if (mobile) params.mobile = 'true';
  const data = await sistrixFetch('/domain.sichtbarkeitsindex', params);
  return data?.answer?.[0]?.sichtbarkeitsindex || [];
}

export async function keywordCount({ domain, country = 'es' }) {
  const data = await sistrixFetch('/domain.kwcount.seo', { domain, country });
  return parseInt(data?.answer?.[0]?.['kwcount.seo']?.[0]?.value) || 0;
}

export async function keywords({ domain, country = 'es', limit = 1000, offset = 0, order = 'sv', orderDir = 'desc' }) {
  const data = await sistrixFetch('/domain.kw', {
    domain, country, limit, offset,
    order, orderdir: orderDir
  });
  return data?.answer?.[0]?.kw || [];
}

export async function topUrls({ domain, country = 'es', limit = 200 }) {
  const data = await sistrixFetch('/domain.urls', { domain, country, limit });
  return data?.answer?.[0]?.row || [];
}

export async function competitors({ domain, country = 'es', limit = 20 }) {
  const data = await sistrixFetch('/domain.competitors.seo', { domain, country, limit });
  return data?.answer?.[0]?.result || [];
}

export async function domainOverview({ domain, country = 'es' }) {
  const [vi, kwCount, urls] = await Promise.all([
    visibilityIndex({ domain, country }),
    keywordCount({ domain, country }).catch(() => null),
    topUrls({ domain, country, limit: 5 }).catch(() => [])
  ]);
  return {
    domain, country,
    visibility_index: parseFloat(vi?.value) || null,
    visibility_date: vi?.date,
    keywords_total: kwCount,
    top_urls_preview: urls.slice(0, 5)
  };
}

/**
 * Visibility por subpath (blog, causas, educa, noticia, etc.)
 * UNICEF lo necesita para s1 sist.{main,blog,causas,educa,noticia}.
 * Llama a visibilityIndex para cada path. Cuidado con creditos.
 */
export async function visibilityBySubpaths({ domain, country = 'es', paths }) {
  const results = await Promise.all(
    paths.map(async (p) => {
      const fullPath = p === '' ? domain : `${domain}${p}`;
      try {
        const vi = await visibilityIndex({ domain: fullPath, country });
        return { path: p, value: parseFloat(vi?.value) || null, date: vi?.date };
      } catch (e) {
        return { path: p, value: null, error: e.message };
      }
    })
  );
  return results;
}
