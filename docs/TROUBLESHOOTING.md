# Troubleshooting

## Error `SELF_SIGNED_CERT_IN_CHAIN` al llamar APIs desde Node en local

### Síntoma

Al ejecutar `vercel dev`, `node` o cualquier script que haga `fetch` a una API externa (Ahrefs, Sistrix, Google APIs…) ves un error parecido a:

```
[TypeError: fetch failed] {
  [cause]: Error: self-signed certificate in certificate chain
      code: 'SELF_SIGNED_CERT_IN_CHAIN'
}
```

### Causa

Tu equipo está conectado a una red corporativa (Havas, Generali, Vivendi…) cuyo proxy intercepta el tráfico HTTPS. El proxy reemplaza el certificado del servidor por uno propio firmado por una autoridad raíz interna (por ejemplo `Havas IT Root CA` o `GS01-CSRV001-CA`).

Windows ya confía en esas CAs porque están preinstaladas por IT. Pero **Node.js no las usa por defecto**: tiene su propio store de CAs (Mozilla bundle). Por eso falla.

### Solución

Configurar la variable de entorno `NODE_EXTRA_CA_CERTS` apuntando a un archivo PEM con los certificados raíz corporativos.

Tienes un script automatizado en este repo que lo hace por ti:

```powershell
# Desde la carpeta del repo, en PowerShell:
.\scripts\setup-corp-cert.ps1
```

El script:
1. Busca en tu almacén de certificados de Windows los CAs corporativos conocidos (Havas, Generali/globalservs, Zscaler, Forcepoint, etc.).
2. Los exporta a `%LOCALAPPDATA%\NodeCerts\corp-roots.pem`.
3. Configura `NODE_EXTRA_CA_CERTS` como variable de usuario permanente.

**Después de ejecutarlo, cierra y reabre tu terminal / VSCode** para que Node lea la variable nueva.

### Verificación

```powershell
# Comprueba que la variable está seteada
$env:NODE_EXTRA_CA_CERTS

# Prueba una llamada a Ahrefs (necesita AHREFS_API_TOKEN en .env.local)
node --env-file=.env.local --eval "fetch('https://api.ahrefs.com/v3/subscription-info/limits-and-usage', { headers: { Authorization: 'Bearer ' + process.env.AHREFS_API_TOKEN } }).then(r => r.json()).then(j => console.log(JSON.stringify(j, null, 2)))"
```

Si ves el JSON con tu plan Ahrefs, está OK.

### Si el script no encuentra tu CA

Probablemente tu organización usa un CA con un nombre distinto. Edita `scripts/setup-corp-cert.ps1` y añade el patrón de tu CA al array `$patterns`. Encuentra el nombre con:

```powershell
Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Subject -eq $_.Issuer -and $_.NotAfter -gt (Get-Date) } | Select-Object Subject
```

Y busca cualquier `CN=` que no sea una CA pública estándar (DigiCert, GlobalSign, Let's Encrypt / ISRG, etc.).

### En producción (Vercel)

**No aplica.** Los servidores de Vercel no están detrás del proxy corporativo, así que ninguna de estas medidas es necesaria. Las APIs se llaman normalmente.

---

## Otros problemas frecuentes

### `vercel dev` falla con "Project not found"

Necesitas hacer `vercel link` una vez para asociar la carpeta local al proyecto en Vercel. Te pedirá login (browser) y elegir el proyecto correspondiente en la organización `seo-HMK`.

### `npm install` falla con `EACCES` o errores de proxy

Si estás detrás de proxy corporativo y npm no lo está usando:

```powershell
npm config set proxy http://proxy.havas.com:8080
npm config set https-proxy http://proxy.havas.com:8080
```

(Ajusta la URL al proxy real de tu red. Pregunta a IT si no la conoces.)

### Cambios en `index.html` no se ven en `vercel dev`

`vercel dev` cachea agresivamente. Hard-refresh en el navegador (Ctrl+F5) o reinicia el server con Ctrl+C y vuelve a lanzar.

### El refresh token de GSC ha caducado

Por defecto los refresh tokens de OAuth Google no caducan, **excepto si la app sigue en modo "Testing" en OAuth Consent Screen** (caducan a los 7 días). Para evitarlo:
- O publicar la app a "In production" (recomendado).
- O renovar el refresh token cada semana repitiendo los pasos de [CONFIGURAR_GSC.md](./CONFIGURAR_GSC.md).
