/**
 * Ahrefs API v3 client
 * Docs: https://docs.ahrefs.com/docs/api/reference
 * Auth: Bearer token (Standard plan o superior)
 *
 * Endpoints usados (verificados):
 *   /subscription-info/limits-and-usage   -> cuota
 *   /site-explorer/metrics                -> keywords, trafico, costes
 *   /site-explorer/backlinks-stats        -> backlinks, refdomains
 *   /site-explorer/domain-rating          -> DR, ahrefs_rank
 *   /site-explorer/top-pages              -> top URLs por trafico
 *   /site-explorer/organic-keywords       -> keywords organicas
 *   /site-explorer/metrics-history        -> evolucion mensual de trafico
 *
 * Notas:
 *   - Valores monetarios (cpc, org_cost, paid_cost, value) vienen en USD CENTIMOS.
 *     Para mostrar en dolares dividir entre 100.
 *   - Para dominios sin www incluidos usar mode=subdomains.
 */

const BASE = 'https://api.ahrefs.com/v3';

async function ahrefsFetch(path, params = {}) {
  const token = process.env.AHREFS_API_TOKEN;
  if (!token) throw new Error('AHREFS_API_TOKEN no configurado');

  const url = new URL(BASE + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Ahrefs ${path} ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

const today = () => new Date().toISOString().slice(0, 10);

export async function subscriptionInfo() {
  const r = await ahrefsFetch('/subscription-info/limits-and-usage');
  return r.limits_and_usage;
}

export async function metrics({ target, country = 'es', mode = 'subdomains', protocol = 'both', date = today() }) {
  const r = await ahrefsFetch('/site-explorer/metrics', {
    target, country, mode, protocol, date,
    volume_mode: 'monthly'
  });
  return r.metrics;
}

export async function backlinksStats({ target, mode = 'subdomains', protocol = 'both', date = today() }) {
  const r = await ahrefsFetch('/site-explorer/backlinks-stats', { target, mode, protocol, date });
  return r.metrics;
}

export async function domainRating({ target, date = today() }) {
  const r = await ahrefsFetch('/site-explorer/domain-rating', { target, date });
  return r.domain_rating;
}

export async function domainOverview({ target, country = 'es', mode = 'subdomains', protocol = 'both' }) {
  const [m, bl, dr] = await Promise.all([
    metrics({ target, country, mode, protocol }),
    backlinksStats({ target, mode, protocol }),
    domainRating({ target })
  ]);
  return {
    domain_rating: dr.domain_rating,
    ahrefs_rank: dr.ahrefs_rank,
    org_keywords: m.org_keywords,
    org_keywords_top3: m.org_keywords_1_3,
    paid_keywords: m.paid_keywords,
    org_traffic: m.org_traffic,
    paid_traffic: m.paid_traffic,
    org_cost: m.org_cost,
    paid_cost: m.paid_cost,
    backlinks: bl.live,
    backlinks_all_time: bl.all_time,
    refdomains: bl.live_refdomains,
    refdomains_all_time: bl.all_time_refdomains
  };
}

export async function organicKeywords({ target, country = 'es', mode = 'subdomains', protocol = 'both', limit = 1000, offset = 0, date = today() }) {
  return ahrefsFetch('/site-explorer/organic-keywords', {
    target, country, mode, protocol, date, limit, offset,
    select: 'keyword,best_position,best_position_kind,volume,keyword_difficulty,cpc,sum_traffic,best_position_url',
    order_by: 'sum_traffic:desc'
  });
}

export async function topPages({ target, country = 'es', mode = 'subdomains', protocol = 'both', limit = 200, date = today() }) {
  return ahrefsFetch('/site-explorer/top-pages', {
    target, country, mode, protocol, date, limit,
    select: 'url,sum_traffic,value,top_keyword,top_keyword_volume,top_keyword_best_position,keywords',
    order_by: 'sum_traffic:desc'
  });
}

export async function metricsHistory({ target, country = 'es', mode = 'subdomains', protocol = 'both', months = 24 }) {
  const dateTo = today();
  const dateFrom = new Date(Date.now() - months * 30 * 86400000).toISOString().slice(0, 10);
  const r = await ahrefsFetch('/site-explorer/metrics-history', {
    target, country, mode, protocol,
    date_from: dateFrom, date_to: dateTo,
    history_grouping: 'monthly'
  });
  return r.metrics || [];
}

export async function enrichUrlsWithAhrefs(urls, { country = 'es', target }) {
  const top = await topPages({ target, country, limit: 500 });
  const map = {};
  (top.pages || []).forEach(p => {
    map[p.url] = {
      ahrefs_traffic: p.sum_traffic,
      ahrefs_value_cents: p.value,
      ahrefs_keywords: p.keywords,
      ahrefs_top_keyword: p.top_keyword,
      ahrefs_top_volume: p.top_keyword_volume,
      ahrefs_top_position: p.top_keyword_best_position
    };
  });
  return map;
}
