# Contacto de MOVANZA

Se implementó el envío en el modal Contacto del Index, conservando sus campos,
estilos y navegación. No hay cambios en Supabase, Auth, roles ni módulos privados.
La integración no requiere modificar DNS, el dominio ni Supabase. La entrega
real requiere configurar el secreto de Resend y verificar el dominio de envío.

## Archivos y decisiones

| Archivo | Función |
| --- | --- |
| `index.html`, `estilos/componentes-publicos.css` | Botón Enviar mensaje, ayuda, campo antispam y estados visuales. |
| `scripts/contacto.js` | Envío asíncrono, bloqueo de duplicados, loader y cards de `alertas.js`. |
| `scripts/contacto-validacion.js` | Validación compartida entre navegador y servidor. |
| `scripts/index-publico.js` | Se retira exclusivamente el antiguo manejador de revisión manual. |
| `worker/index.mjs` | Endpoint y plantilla; el resto se delega a `env.ASSETS.fetch(request)`. |
| `wrangler.jsonc` | Configuración del mismo Worker `movanza-act` y sus bindings. |
| `.assetsignore` | Lista de contenido público; excluye backend, pruebas, configuración de despliegue y secretos. |
| `.gitignore` | Excluye `.dev.vars*`, `.env*`, dependencias y datos locales de Wrangler. |
| `package.json`, `package-lock.json` | Herramientas de desarrollo fijadas: Wrangler y jsdom. Sin dependencias de ejecución. |
| `pruebas/contacto-*.mjs` | Pruebas del backend, interfaz real con jsdom y servidor local de Wrangler. |
| `pruebas/index-publico.mjs`, `pruebas/contenido-publico.mjs` | Expectativas actualizadas al envío y correo empresarial. |
| `informacion/Movanza_Contenido_Index.txt`, `docs/index-publico.md` | Fuente editorial y documentación coherentes con el nuevo contacto. |

El repositorio inspeccionado no tenía un Worker, configuración Wrangler ni
pipeline de Cloudflare versionados. Se añade el punto de entrada del proyecto
existente, sin crear otro Worker ni mover las páginas. Los estáticos continúan
en la raíz; solo `/api/*` invoca el Worker primero. `.assetsignore` permite
los seis HTML de la raíz y sus carpetas de recursos. Si en el futuro se añade
otro HTML en la raíz, debe incorporarse a esta lista.

El backend llama directamente al endpoint oficial `https://api.resend.com/emails`
mediante `fetch`; no necesita SDK, framework, base de datos ni servicio adicional.
El remitente, destinatario y asunto están fijados en el servidor. El visitante
solo determina el contenido y `reply_to`. HTML escapado y alternativa de texto.

## Validación y abuso

- Nombre: obligatorio, hasta 150 caracteres.
- Correo: obligatorio, formato válido, hasta 254 caracteres.
- Mensaje: obligatorio, hasta 4000 caracteres; se permiten saltos de línea.
- JSON UTF-8 hasta 32 KiB, comprobado también al leer el stream. Se rechazan
  tipos incorrectos, campos desconocidos y caracteres de control.
- Campos JSON admitidos: `nombre`, `correo`, `mensaje` y `sitioWeb` (honeypot
  opcional que debe estar vacío). Nunca se acepta un destinatario enviado por el navegador.
- Mismo origen y JSON; no se habilita CORS abierto. La cabecera Origin puede
  falsificarse fuera del navegador y no se considera una protección antispam por sí sola.
- Binding `CONTACTO_LIMITE`: 3 solicitudes por 60 segundos por IP; adicionalmente
  3 por correo normalizado, cuya clave se calcula con SHA-256.
- Binding `CONTACTO_LIMITE_TOTAL`: 30 intentos de envío por 60 segundos.
  Los namespace `11001` y `11002` deben reservarse para este uso en la cuenta;
  si ya están ocupados, elige otros dos antes del despliegue.
- Los limitadores de Cloudflare son por ubicación de red y de consistencia
  eventual; no constituyen una cuota global exacta. No hay un contador en memoria
  del Worker presentado como protección distribuida. Una campaña distribuida
  podría requerir posteriormente Turnstile o reglas WAF, sin cambiar este formulario.
- Si falta el secreto o un binding, el endpoint falla cerrado con 503.
- Tiempo máximo de espera de Resend: 10 segundos. El navegador espera hasta 20.
  Los errores al usuario son genéricos y no se registran claves ni contenido en logs propios.

El navegador genera una cabecera `Idempotency-Key` con formato
`contacto-<milisegundos-del-primer-intento>-<UUID-v4>`. Conserva esa clave mientras
se reintenta el mismo contenido; al cambiar los datos o completar el envío se
genera otra. Resend recibe la misma clave y una plantilla idéntica en reintentos.
La fecha que aparece en el correo es la del primer intento, en UTC, validada
por el servidor (hasta 23 horas de antigüedad y 60 segundos de adelanto). Es
metadato de solicitud del navegador, no una marca de tiempo de negocio o de entrega.
El equipo del visitante debe tener el reloj correctamente configurado.
Una recarga de página inicia un nuevo intento; no se guardan datos personales en almacenamiento local.

El servidor devuelve 202 únicamente si Resend devuelve una respuesta válida con
un identificador de correo. Eso confirma aceptación del envío, no entrega en
la bandeja de Zoho. Se conservan los datos ante cualquier error. El formulario
no produce confirmaciones optimistas ni abre aplicaciones de correo externas.

## Diagnósticos del envío y corrección del 502

El envío usa `redirect: 'manual'` y rechaza explícitamente cualquier HTTP 3xx
con 502. No sigue `Location` ni reenvía Authorization a otro destino. La opción
`redirect: 'error'` producía un TypeError en workerd antes de realizar la petición;
las pruebas con fetch simulado en Node no detectaban esa incompatibilidad.

Cada llamada al endpoint genera un `solicitudId` aleatorio que también se
devuelve en la cabecera **`X-Contacto-Id`**. Se puede copiar desde Network del
navegador para filtrar los logs de Cloudflare por ese identificador. No es la
clave de idempotencia del visitante.

Se emiten registros JSON con `evento: "contacto"`, identificador, `etapa`,
`categoria`, duración y, cuando corresponda, estado HTTP y código Resend
perteneciente a una lista cerrada. Las etapas son `solicitud`, `configuracion`,
`resend_envio`, `resend_respuesta`, `interno` y `respuesta`.

| Categoría | Significado |
| --- | --- |
| `secreto_ausente`, `limitador_ausente` | Configuración incompleta; respuesta 503. |
| `redireccion_rechazada` | Resend devolvió 3xx; no se sigue el destino. |
| `autenticacion_proveedor` | HTTP 401 del proveedor. |
| `permiso_o_dominio_proveedor` | HTTP 403; el estado por sí solo no distingue la causa exacta. |
| `validacion_proveedor` | HTTP 400 o 422. |
| `conflicto_idempotencia` | HTTP 409. |
| `limite_proveedor` | HTTP 429 de Resend; distinto de los límites locales. |
| `error_proveedor` | HTTP 5xx de Resend. |
| `error_http_proveedor` | Otro rechazo HTTP. |
| `respuesta_invalida` | JSON inválido, cuerpo superior a 32 KiB o identificador ausente. |
| `conexion_o_preparacion` | Fallo al construir o ejecutar la petición saliente. |
| `lectura_fallida` | Fallo de lectura o cancelación posterior a las cabeceras. |
| `tiempo_agotado` | Se agotó la señal de espera del envío o lectura. |
| `aceptado` | Resend devolvió una respuesta válida; el endpoint devuelve 202. |

Los rechazos de Resend se clasifican leyendo su JSON de forma acotada. Se
conserva el estado HTTP aunque el cuerpo del error sea inválido. Nunca se
registran mensajes crudos, stacks, cuerpos, nombres, correos, IP, URLs completas,
Authorization, valores de secretos ni la clave de idempotencia. Los códigos o
tipos de excepción desconocidos se sustituyen por etiquetas constantes.

El frontend conserva las respuestas genéricas y los datos ante un error.
Las categorías se utilizan para diagnóstico del servidor, sin exponer detalles
internos al visitante. Un fallo del logger tampoco cambia el resultado del envío.

`wrangler.jsonc` habilita Observability y sus logs con muestreo completo. Se
desactivan los logs automáticos de invocación (`invocation_logs: false`) para
evitar que el diagnóstico registre URLs completas con posibles datos en sus
parámetros. Los registros propios de las etapas permiten seguir la solicitud.
Esta configuración solo se activa en Cloudflare cuando el usuario publique los cambios.

La regresión de runtime utiliza el Miniflare/workerd incluido en Wrangler y
compila el Worker real sin sustituir su opción `redirect`. Toda salida se
intercepta localmente y utiliza un secreto ficticio; no carga `.dev.vars`.
Comprueba éxito, 401, redirección sin segunda llamada, JSON inválido, ausencia
de id, respuesta excesiva, caída del proveedor y timeout real de diez segundos,
además de la correlación y privacidad de los logs. No instala dependencias adicionales.

El mismo comando monta también el Worker con los assets y sin secreto, y
reutiliza `pruebas/contacto-local.mjs` para comparar todos los archivos públicos,
la configuración pública de Supabase y las rutas privadas excluidas. Esta
comprobación usa el transporte interno de Miniflare; no necesita iniciar sesión
en Cloudflare ni ejecutar `wrangler dev` en otra terminal.

```powershell
npm run test:contacto
npm run test:contacto:runtime
npm run test:contacto:interfaz
```

## Configurar Resend y DNS — pendiente de autorización

1. En Resend, añade **`notificaciones.movanza.site`** como dominio de envío.
2. Copia del panel de ese dominio los registros que Resend muestre. Para cada
   registro usa exactamente su **tipo, nombre/host, contenido, TTL y prioridad**:

   | Finalidad | Qué copiar del panel |
   | --- | --- |
   | DKIM | Registro(s) de firma y valor generado para tu dominio. |
   | SPF | TXT del dominio de Return-Path indicado por Resend. |
   | Rebotes / Return-Path | MX y prioridad que indique Resend para ese subdominio. |
   | Verificación adicional | Solo los registros adicionales que solicite tu panel. |

   Los valores y hosts concretos dependen de tu cuenta, región y configuración;
   este documento no inventa claves DKIM, destinos MX ni valores SPF.
   Usa DNS only si el panel pide un CNAME de correo. No actives recepción de
   correo en Resend: Zoho sigue recibiendo `contacto@movanza.site`.
   No sustituyas los MX de Zoho ni alteres el SPF o DKIM del dominio principal.
   Verifica cuidadosamente el host completo antes de crear registros.
3. Espera a que Resend muestre el dominio **Verified** y la capacidad de envío habilitada.
4. Crea una API key con permiso de envío, preferiblemente limitada al dominio.

Referencias: [dominios en Resend](https://resend.com/docs/dashboard/domains/introduction),
[registros de verificación](https://resend.com/changelog/domain-verification-events),
[idempotencia](https://resend.com/docs/dashboard/emails/idempotency-keys).

## Secreto de Cloudflare — pendiente de autorización

### Si el proyecto publicado todavía sirve solo archivos estáticos

La configuración local ya declara `main: "worker/index.mjs"` junto con
`assets.binding: "ASSETS"`. Tener estos archivos en el equipo no cambia la
versión que está ejecutando Cloudflare. Si el panel todavía no permite añadir
secretos de ejecución, la activación debe hacerse en este orden:

1. Revisa los cambios locales y autoriza expresamente la primera publicación.
2. Publica en el mismo proyecto `movanza-act` usando `wrangler.jsonc`, con el
   punto de entrada de servidor y los estáticos. El deploy debe usar
   `npx wrangler deploy` desde la raíz; no un flujo que publique solo los assets.
   Si se utiliza la rama conectada de GitHub, su push puede activar ese deploy.
3. Comprueba que la versión publicada incluya el script y los bindings `ASSETS`,
   `CONTACTO_LIMITE` y `CONTACTO_LIMITE_TOTAL`. Las páginas siguen disponibles;
   el formulario devuelve 503 mientras falte `RESEND_API_KEY`.
4. Añade el secreto de ejecución con el panel o Wrangler, según se indica abajo.
   Esto requiere aplicar una nueva versión. No hace falta poner una clave
   temporal en el código ni configurar un secreto de build.
5. Con el dominio de envío ya verificado en Resend, realiza la prueba de envío
   y recepción en Zoho. No es necesario modificar el dominio del sitio ni los
   servicios de Supabase para activar el código de servidor.

La publicación de esta secuencia requiere autorización. Comprueba después el
estado de la versión remota antes de configurar el secreto de ejecución.

En **Workers & Pages → movanza-act → Settings → Variables and Secrets**, añade:

- Tipo: **Secret**.
- Nombre: **`RESEND_API_KEY`**.
- Valor: la clave privada de Resend, pegada directamente en el panel.

Debe ser un secreto de **runtime**, no solo de Workers Builds.
La alternativa por terminal, cuando autorices la publicación, es:

```powershell
npx wrangler secret put RESEND_API_KEY --name movanza-act
```

Introduce el valor en el prompt de Wrangler, nunca como argumento ni en Git.
**Ese comando crea y despliega una versión inmediatamente. No se ejecutó.**
La opción `wrangler versions secret put` crea una versión sin promoverla de
inmediato, para quien utilice despliegues por versiones.
Referencia: [secretos de Workers](https://developers.cloudflare.com/workers/configuration/secrets/).

## Pruebas locales

Requiere Node 22 o posterior; se comprobó con Node 24. En PowerShell utiliza
`npm.cmd` si la política de ejecución impide `npm.ps1`.

```powershell
npm ci
npm run test:contacto
npm run test:contacto:runtime
npm run test:contacto:interfaz
npm run check:worker
npm run dev
```

En otra terminal, sin clave local:

```powershell
node pruebas/contacto-local.mjs
node --experimental-vm-modules --disable-warning=ExperimentalWarning pruebas/index-publico.mjs .
node --experimental-vm-modules --disable-warning=ExperimentalWarning pruebas/contenido-publico.mjs .
```

Abre `http://127.0.0.1:8787/#contacto`. Sin secreto, el envío debe mostrar un
error temporal, conservar los campos y permitir reintentar. Las pruebas unitarias
simulan Resend; no consumen una clave ni envían mensajes reales. La prueba local
comprueba contenido estático y URLs privadas excluidas en el runtime de Wrangler.

Para una prueba real autorizada, crea manualmente `.dev.vars` en la raíz:

```dotenv
RESEND_API_KEY=<pegar-la-clave-solo-en-tu-archivo-local>
```

Reinicia Wrangler, usa el dominio verificado y envía desde el formulario. Esto
sí enviará un correo real a Zoho. No ejecutes la prueba `contacto-local.mjs`
con esa clave: su escenario exige que el secreto esté ausente.

## GitHub y producción

La configuración conserva el nombre **movanza-act** y no declara rutas ni DNS
nuevos. El empaquetado se valida con `--dry-run`; no requiere una compilación
de frontend. El commit/push a una rama de producción conectada puede publicar
automáticamente; solo debe realizarse con autorización.

Antes de publicar, comprueba en el proyecto actual de Cloudflare:

1. Repositorio y rama de producción correctos; directorio raíz del repositorio.
2. Comando de deploy `npx wrangler deploy` usando este `wrangler.jsonc`, no un
   comando que siga subiendo únicamente archivos estáticos de otro directorio.
   No hace falta un comando de build de frontend.
3. Secreto de runtime configurado y namespaces de rate limit disponibles.
4. Dominio existente `movanza.site` asociado al mismo Worker. No se han
   inspeccionado ni modificado los ajustes remotos del panel desde este entorno.

Referencia: [Workers Builds y despliegue desde Git](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

Después de una publicación autorizada, abre `https://movanza.site/#contacto`,
envía una consulta, confirma el 202 en Network y comprueba el registro del correo
en Resend y su recepción en `contacto@movanza.site` en Zoho. Verifica remitente,
asunto, acentos, fecha, contenido y que Responder apunte al visitante. Prueba
doble clic, errores, validación y tamaños móviles; revisa Login, Sign Up,
navegación privada y mapas con tus cuentas habituales. Si Resend acepta pero
Zoho no recibe, revisa el evento de entrega/rebote y Spam: no se debe confundir
aceptación por API con recepción final.

**Pendiente:** comprobar la entrega real con clave válida y dominio verificado.
