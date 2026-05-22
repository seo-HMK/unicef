# Dashboard SEO UNICEF · Arquitectura técnica

> Documento maestro del proyecto. Mantenido por el equipo SEO de Havas Market.
> Mantener actualizado cuando se conecten APIs nuevas o se reorganicen secciones.

---

## 1. Estado actual

Dashboard servido por Vercel como **HTML estático** (`index.html` ~14 MB, en el que ~95 % son las fuentes Baikal en base64 inline).

- **Datos KPI cabecera por mes** → editables vía modal interno, persistidos en `localStorage('unicef_seo_months')`.
- **Resto de datasets (~15 arrays JS)** → hardcodeados en el `<script>` y se sobrescriben en cada commit.
- **Sin backend**, sin `/api`, sin variables de entorno.
- **Librerías CDN**: Chart.js 4.4, jsPDF 2.5, html2canvas 1.4, xlsx 0.18.

### Esquema de datos por mes (modal + localStorage)

```js
const SEED_MONTH = {
  key: '2026-04', label: 'Abril 2026',
  clicks: 103870, clicksPrev: 113992,     // GSC
  impr: 10191466, imprPrev: 9341720,      // GSC
  sess: 171978,  sessPrev: 181091,        // GA4
  ia: 1078,                                // custom / Sistrix
  sist: {                                  // Sistrix Visibility Index
    main: 5.7146, blog: 2.4523,
    causas: 1.0333, educa: 0.5656,
    noticia: 0.6816
  }
};
```

---

## 2. Estado objetivo

```
                  ┌──────────────────────────┐
                  │  Vercel Cron · 03:00 UTC │
                  └─────────────┬────────────┘
                                │
              ┌─────────────────┴─────────────────┐
              │   /api/sync.js (todas las APIs)   │
              └──┬──────┬──────┬──────┬────────┬──┘
                 │      │      │      │        │
              ┌──▼─┐ ┌──▼─┐ ┌──▼──┐ ┌─▼──┐  ┌──▼────┐
              │GSC │ │GA4 │ │Ahref│ │Sist│  │GAds(*)│
              └──┬─┘ └──┬─┘ └──┬──┘ └─┬──┘  └──┬────┘
                 └──────┴───┬──┴──────┴────────┘
                            │
                  ┌─────────▼─────────┐
                  │ JSONBin (cache)   │
                  └─────────┬─────────┘
                            │
                  ┌─────────▼──────────┐
                  │ /api/data.js       │
                  │ (lee cache, sirve  │
                  │  al frontend)      │
                  └─────────┬──────────┘
                            │
                  ┌─────────▼──────────┐
                  │   index.html       │
                  │ fetch('/api/data') │
                  │ + localStorage     │
                  │   (override modal) │
                  └────────────────────┘
```

Patrón heredado de `seo-HMK/genesis-panel-dynamic` (referencia ya en producción para Génesis Seguros).

---

## 3. Inventario de APIs

### 3.1 Google Search Console (GSC) · imprescindible

- **Auth**: OAuth con cuenta delegada (Workspace bloquea service accounts en GSC).
- **Setup** documentado en `CONFIGURAR_GSC.md` (texto reenviable al webmaster del cliente).
- **Variables de entorno**:
  ```
  GSC_CLIENT_ID
  GSC_CLIENT_SECRET
  GSC_REFRESH_TOKEN
  GSC_PROPERTY          # sc-domain:unicef.es
  ```
- **Endpoints API**: `searchanalytics.query`

### 3.2 Google Analytics 4 (GA4) · imprescindible

- **Auth**: Service Account JSON (GA4 sí admite, a diferencia de GSC).
- **Variables de entorno**:
  ```
  GA4_SERVICE_ACCOUNT_JSON   # contenido del JSON completo
  GA4_PROPERTY_ID            # ej: 311234567
  ```
- **Endpoints API**: Data API v1beta `runReport`.

### 3.3 Ahrefs API v3 · imprescindible

- **Auth**: API token (plan Standard o superior).
- **Variables de entorno**:
  ```
  AHREFS_API_TOKEN
  AHREFS_TARGET           # unicef.es
  ```

### 3.4 Sistrix API · imprescindible

- **Auth**: API key.
- **Variables de entorno**:
  ```
  SISTRIX_API_KEY
  SISTRIX_DOMAIN          # unicef.es
  ```

### 3.5 Google Ads API · opcional (clave para s11)

- **Auth**: OAuth + Developer Token + Customer ID. Setup más burocrático (Google revisa la cuenta antes de aprobar Developer Token).
- **Variables de entorno**:
  ```
  ADS_CLIENT_ID
  ADS_CLIENT_SECRET
  ADS_REFRESH_TOKEN
  ADS_DEVELOPER_TOKEN
  ADS_CUSTOMER_ID
  ```
- **Si no se conecta**: el cálculo de "13.066 € de reinversión estimada" queda como override manual en el modal.

### 3.6 Anthropic API (Claude) · opcional para textos

- **Auth**: API key.
- **Variables de entorno**:
  ```
  ANTHROPIC_API_KEY
  ```
- **Uso**: generar el resumen ejecutivo (s6), recomendaciones por URL (s7), títulos narrativos de slides.

### 3.7 JSONBin · cache compartido

- **Auth**: master key + bin IDs.
- **Variables de entorno**:
  ```
  JSONBIN_MASTER_KEY
  JSONBIN_UNICEF_BIN_ID
  ```

---

## 4. Mapa sección → API

| Sección | Línea HTML | Título | Datos | API origen |
|---|---|---|---|---|
| Header | l.275-289 | Selector mes + export PDF | UI local | — |
| **s1** KPIs España | l.289-557 | "13.066 € de reinversión estimada…" | clicks, impr, sess, ia, sist.{main,blog,causas,educa,noticia}, países, daily | GSC + GA4 + Sistrix |
| **s11** One Search | l.559-777 | "Reinversión / parar en paid" | keywords totales, candidatos a parar, gasto estimado | GSC + Google Ads |
| **s2** IA Overview | l.778-945 | "Nuevo máximo IA Overview: 1.078 kw" | tabla IA keywords + chart histórico + SV | Sistrix (SERP features) + Ahrefs (SV) |
| **s3** Clics vs Sesiones | l.946-1037 | "Clics GSC en descenso; GA4 estable" | series mensuales | GSC + GA4 |
| **s4** Categorías | l.1038-1097 | "Blog, Educa y Noticias ganan terreno" | clicks por path | GSC (filtro path) |
| **s5** Blog motor | l.1098-1164 | "El blog es el motor de crecimiento" | top URLs blog | GSC top pages |
| **s6** Resumen | l.1165-1222 | "Visibilidad record IA, tráfico cualificado…" | texto narrativo | Manual / Claude |
| **s7** URLs a optimizar | l.1223-1294 | "URLs concretas a optimizar" | recomendaciones por URL | GSC bajo CTR + Ahrefs keyword gaps + Claude |
| **s8** Calendario | l.1295-1380 | "Qué Día Mundial trabajar" | DIAS_CAL | Manual (Google Sheet) |
| **s9** Noticias | l.1381+ | "+24,1 % clics y +31,1 % sesiones" | stats sección /noticia/ | GSC + GA4 (filtro path) |

---

## 5. Datasets hardcodeados a sustituir

| Constante JS | Línea | Sustituir por |
|---|---|---|
| `SEED_MONTH` | 2218 | `/api/data` → `month.kpi` |
| `MONTHS` (localStorage) | 2227 | Mantener como override manual sobre `/api/data` |
| `KW` (todas keywords) | 1837 | `/api/data` → `keywords[]` (GSC + Ahrefs cruzados) |
| `STOP_KW` | 1843 | derivado de `KW.filter(stop)` |
| `SIST_SERIES` | 2060 | `/api/data` → `sistrix.series` |
| `IA_DATA` | 2430 | `/api/data` → `ia.keywords` |
| `DIAS_CAL` | 2521 | `/api/calendar` (lee Google Sheet) |
| `PAISES_APR` | 2657 | `/api/data` → `countries` |
| `BL_MONTHS`, `BL_REF`, `BL_POS13` | 2759-61 | `/api/data` → `blog.history` |
| Noticias charts | 2592 | `/api/data` → `noticias` |

---

## 6. Estructura de carpetas objetivo

```
unicef/
├── index.html              # frontend (sustituir arrays por fetch + localStorage override)
├── api/
│   ├── data.js             # endpoint principal: devuelve JSON con todos los datos
│   ├── sync.js             # cron + manual refresh
│   ├── calendar.js         # Días Mundiales (Google Sheet)
│   ├── bot/
│   │   └── narrative.js    # Claude genera textos s6, s7, títulos
│   └── keywords/
│       └── gsc.js          # endpoint detalle keywords
├── lib/
│   ├── gsc.js              # cliente GSC (OAuth + searchanalytics)
│   ├── ga4.js              # cliente GA4 (Data API)
│   ├── ahrefs.js           # cliente Ahrefs v3
│   ├── sistrix.js          # cliente Sistrix
│   ├── ads.js              # cliente Google Ads (opcional)
│   ├── anthropic.js        # cliente Claude
│   └── jsonbin.js          # cache
├── docs/
│   ├── ARQUITECTURA.md     # este documento
│   └── CONFIGURAR_GSC.md   # instrucciones para webmaster del cliente
├── package.json
├── vercel.json             # functions, cron, headers, redirects
├── .env.example
└── .gitignore              # ignora .env.local
```

Buena parte de `/lib` se puede copiar tal cual desde `seo-HMK/genesis-panel-dynamic` y adaptar parámetros (`CLIENT_ID=unicef`, `DOMAIN=unicef.es`).

---

## 7. Fases de implementación

| Fase | Alcance | Estimación |
|---|---|---|
| **0. Setup** | `package.json`, `vercel.json`, `.env.example`, `.gitignore`, `vercel link` | 1-2 h |
| **1. Backend Ahrefs + Sistrix** | `/lib/ahrefs.js`, `/lib/sistrix.js`, `/api/data.js` minimal devolviendo SV/Visibility | 1 día |
| **2. Backend GSC** | (cuando lleguen credenciales) `/lib/gsc.js`, ampliar `/api/data.js` | 1 día |
| **3. Backend GA4** | `/lib/ga4.js`, ampliar `/api/data.js` | 0.5 día |
| **4. Cache + cron** | JSONBin + `/api/sync.js` + cron Vercel | 0.5 día |
| **5. Wiring frontend** | Sustituir arrays JS por `fetch('/api/data')`, manejar loading, mantener override del modal | 2-3 días |
| **6. s11 Google Ads** | (opcional) `/lib/ads.js`, cálculo reinversión | 1-2 días |
| **7. Bot Claude (s6, s7)** | `/api/bot/narrative.js`, integrar en frontend | 1 día |
| **8. Calendario s8** | `/api/calendar.js`, configurar Google Sheet | 0.5 día |

Total estimado fases 0-5 (lo crítico): **~6-7 días** repartidos en 2 sprints.

---

## 8. Datos que quedan manuales (no se pueden sacar de API)

- **s8 Días Mundiales** (calendario editorial): editable en Google Sheet, dashboard lo lee vía `/api/calendar`.
- **Override mensual de KPI**: el modal existente sigue funcionando como override sobre los datos auto-importados.
- **Categoría "parar en paid"** (decisión humana): se mantiene como flag manual en el modal o admin UI.

---

## 9. Seguridad

- `.env.local` nunca se commitea (incluido en `.gitignore`).
- En producción, todas las credenciales viven en **Vercel → Settings → Environment Variables**.
- El frontend nunca recibe credenciales: sólo consume `/api/data` que ya devuelve datos procesados.
- `SYNC_SECRET_TOKEN` protege el endpoint de refresh manual.

---

## 10. Referencias

- Repo referencia: [github.com/seo-HMK/genesis-panel](https://github.com/seo-HMK/genesis-panel) (dashboard equivalente para Génesis Seguros, ya en producción).
- Documentación Ahrefs API v3: [ahrefs.com/api/documentation](https://ahrefs.com/api/documentation)
- Documentación Sistrix API: [sistrix.com/api](https://www.sistrix.com/api)
- Documentación GSC API: [developers.google.com/webmaster-tools](https://developers.google.com/webmaster-tools)
- Documentación GA4 Data API: [developers.google.com/analytics/devguides/reporting/data/v1](https://developers.google.com/analytics/devguides/reporting/data/v1)
