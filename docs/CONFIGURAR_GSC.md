# Configuración de acceso a Google Search Console

> **Para reenviar al webmaster / responsable técnico de unicef.es con acceso de propietario en Google Search Console.**

---

## Contexto

Estamos conectando el dashboard SEO mensual de UNICEF España a sus fuentes de datos en vivo (Search Console, Analytics, Ahrefs y Sistrix). En lugar de actualizar las cifras manualmente cada mes, el panel tomará los datos directamente de la API oficial.

Para que el dashboard pueda leer datos de Search Console **sin necesidad de iniciar sesión cada vez** y **sin compartir contraseña**, Google ofrece un mecanismo estándar llamado **OAuth con refresh token**. Es el método recomendado por Google y el que usan herramientas como Looker Studio, Screaming Frog API mode, Search Console Insights, etc.

El resultado del proceso son **3 valores de texto** que nos tienes que pasar:

```
GSC_CLIENT_ID
GSC_CLIENT_SECRET
GSC_REFRESH_TOKEN
```

Con esos 3 valores podemos consultar GSC en modo lectura. Nunca tendremos acceso a tu contraseña, ni a tu correo, ni a otras propiedades.

**Tiempo estimado**: 20-30 minutos. **Se hace una sola vez**.

---

## Requisitos previos

- Cuenta de Google con permisos de **Propietario** sobre la propiedad de Search Console de `unicef.es` (o `sc-domain:unicef.es`).
- La misma cuenta debe poder acceder a [Google Cloud Console](https://console.cloud.google.com) (cualquier cuenta gratuita sirve).

> **Recomendación**: usar una cuenta dedicada del cliente, no una personal. Por ejemplo: `seo@unicef.es` o similar. Así el acceso sobrevive a cambios de personal y queda trazado a una identidad institucional.

---

## Paso 1 · Crear un proyecto en Google Cloud Console

1. Entra en [console.cloud.google.com](https://console.cloud.google.com) con la cuenta delegada.
2. Arriba a la izquierda, selector de proyectos → **NEW PROJECT**.
3. **Project name**: `unicef-seo-dashboard` (o el nombre que prefieras).
4. **Create**. Espera unos segundos a que se cree.
5. Vuelve al selector de proyectos y asegúrate de que el nuevo proyecto está activo.

## Paso 2 · Habilitar la Search Console API

1. En el buscador superior escribe: `Search Console API`.
2. Selecciona el resultado **Google Search Console API**.
3. Pulsa **ENABLE**. Espera unos segundos.

## Paso 3 · Configurar la pantalla de consentimiento OAuth

1. Menú lateral → **APIs & Services** → **OAuth consent screen**.
2. **User Type**: selecciona **External** → **CREATE**.
3. Rellena:
   - **App name**: `UNICEF SEO Dashboard`
   - **User support email**: tu correo
   - **Developer contact email**: tu correo
   - Resto en blanco → **SAVE AND CONTINUE**.
4. **Scopes**: pulsa **ADD OR REMOVE SCOPES**, busca `webmasters.readonly`, marca la casilla, **UPDATE** → **SAVE AND CONTINUE**.
5. **Test users**: pulsa **ADD USERS**, añade el correo de la cuenta delegada (la misma con la que estás logueado) → **ADD** → **SAVE AND CONTINUE**.
6. **Summary**: **BACK TO DASHBOARD**.

## Paso 4 · Crear las credenciales OAuth Client ID

1. Menú lateral → **APIs & Services** → **Credentials**.
2. **+ CREATE CREDENTIALS** → **OAuth client ID**.
3. **Application type**: **Web application**.
4. **Name**: `UNICEF Dashboard OAuth`.
5. **Authorized redirect URIs** → **+ ADD URI** → pega exactamente:
   ```
   https://developers.google.com/oauthplayground
   ```
6. **CREATE**.
7. Aparecerá un cuadro con dos valores. **Cópialos a un sitio seguro**:
   - **Client ID** (acaba en `.apps.googleusercontent.com`)
   - **Client secret** (cadena alfanumérica corta)

## Paso 5 · Obtener el refresh token con OAuth Playground

1. Abre en una pestaña nueva: [developers.google.com/oauthplayground](https://developers.google.com/oauthplayground)
2. Arriba a la derecha, icono de **engranaje** (Settings):
   - Marca **Use your own OAuth credentials**.
   - **OAuth Client ID**: pega el Client ID del paso anterior.
   - **OAuth Client secret**: pega el Client secret del paso anterior.
   - Cierra el panel de Settings.
3. En la columna izquierda **Step 1 · Select & authorize APIs**:
   - En la caja **Input your own scopes** pega exactamente:
     ```
     https://www.googleapis.com/auth/webmasters.readonly
     ```
   - Pulsa **Authorize APIs**.
4. Se abre la pantalla de login de Google:
   - Inicia sesión con **la cuenta delegada** (la que tiene permisos en GSC).
   - Verás un aviso "Google hasn't verified this app" — pulsa **Advanced** → **Go to UNICEF SEO Dashboard (unsafe)**. Es normal: la app está en modo Test y sólo tú puedes usarla.
   - Acepta los permisos.
5. Vuelves a OAuth Playground. En **Step 2 · Exchange authorization code for tokens**:
   - Pulsa **Exchange authorization code for tokens**.
   - Aparecerá un panel con `Access token`, `Refresh token`, `Token expiration`.
6. **Cópia el Refresh token** (cadena larga que empieza por `1//`). Es el valor que no caduca.

## Paso 6 · Enviar los 3 valores

Pásanos por canal seguro (correo cifrado, Bitwarden compartido, password manager o similar — **no Slack abierto**) los tres valores:

```
GSC_CLIENT_ID:      <pegado del paso 4>
GSC_CLIENT_SECRET:  <pegado del paso 4>
GSC_REFRESH_TOKEN:  <pegado del paso 5 (empieza por 1//)>
```

Adicionalmente confirma:

```
GSC_PROPERTY:       sc-domain:unicef.es   (o https://www.unicef.es/ según esté dada de alta la propiedad)
```

---

## Qué pasa después

- Guardaremos esos valores como variables de entorno en Vercel (no quedarán en el código).
- El dashboard llamará a la API de Search Console en modo **lectura** sobre la propiedad de `unicef.es` únicamente.
- El refresh token **no caduca** salvo que tú lo revoques manualmente.

## Cómo revocar el acceso (si en algún momento quieres)

1. Ve a [myaccount.google.com/permissions](https://myaccount.google.com/permissions) con la cuenta delegada.
2. Busca **UNICEF SEO Dashboard**.
3. **Remove access**.

A partir de ese momento el dashboard dejará de poder leer datos hasta que se renueve.

---

## Dudas frecuentes

**¿Necesitáis mi contraseña?**
No. Sólo los 3 valores de OAuth. El refresh token reemplaza el login.

**¿Pueden ver otras propiedades o servicios de Google que tengo?**
No. El scope `webmasters.readonly` da acceso de sólo lectura a Search Console, nada más.

**¿Y si cambia el responsable de SEO en UNICEF?**
Por eso recomendamos crear la cuenta como buzón compartido (`seo@unicef.es`). El refresh token sobrevive al cambio de persona si la cuenta sigue activa.

**¿Cuánto tarda el setup?**
Una sola vez, 20-30 minutos. Después no hay que volver a tocarlo.

---

*Cualquier duda durante el proceso, escríbeme y lo resolvemos en directo.*
