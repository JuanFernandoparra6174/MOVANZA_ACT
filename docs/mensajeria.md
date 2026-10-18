# Mensajería integrada en Home Empresa 2

## Integración compartida con Home Trabajador

`home_trabajador.html` monta el mismo `montarMensajeria()` después de verificar sesión y rol, e incluye exactamente la misma hoja `estilos/mensajeria.css`. No tiene un segundo botón, panel, renderizador ni operación de envío. Header, banner, cards y footer se conservan; se reserva espacio inferior en el footer para el botón flotante.

El componente recibe el perfil verificado y el ciclo de vida del anfitrión. Para Empresa continúa recibiendo la empresa activa y aplicando el filtro de propietario existente. Para Trabajador no depende de una empresa seleccionada: añade `trabajador_id = perfil.id` a la consulta de asignaciones y descarta filas fuera de ese ámbito antes de consultar los trabajos. Solo presenta asignaciones con un trabajo legible. Los metadatos de empresa son opcionales, de modo que no se pierde un historial autorizado si ya no son visibles.

El filtro del cliente delimita el ámbito; la autorización sigue estando en la base de datos. Se revisaron `pruebas/estructura_previa.sql` y la migración de roles: `mensajes_lectura` utiliza `privado.puede_ver_asignacion(asignacion_id)` y `enviar_mensaje` verifica esa función e identifica al remitente en el servidor. No se infieren permisos por pertenecer a una empresa ni se cambia la lógica de envío. Un identificador modificado no concede acceso bajo esas reglas. Se verificaron las reglas en PostgreSQL local aislado; no se consultó ni modificó el esquema remoto.

Los trabajos pueden proceder de varias empresas autorizadas. Se conserva la relación trabajo → asignaciones → mensajes y los historiales separados. No existen un chat grupal por trabajo, contadores de no leídos, vistas previas de último mensaje ni suscripciones en tiempo real en la implementación actual; no se inventan ni añaden.

La primera apertura carga las conversaciones. Cerrar y reabrir conserva estado sin duplicar consultas. Cierre de sesión, cambio de cuenta y salida de página destruyen la instancia y descartan respuestas pendientes. La misma interfaz proporciona carga, estados vacíos, búsqueda, errores con actualización manual, navegación móvil y movimiento reducido.

`pruebas/mensajeria.mjs` incluye 88 comprobaciones para ambas interfaces, la ruta anterior, aislamiento del trabajador, conversaciones de varias empresas, rechazos de lectura y escritura, relaciones no disponibles, respuestas tardías, borradores, móvil y limpieza de sesión. También pasan las suites de Home Trabajador, Home Empresa 2, Perfil, autenticación y permisos SQL locales. Son pruebas automatizadas; no sustituyen la revisión visual en navegador ni una comprobación de las políticas desplegadas en Supabase.

El acceso nuevo es el botón flotante de `home_empresa_2.html`. El panel se abre
desde la derecha, sin navegación, fragmentos ni recarga. No se consulta
mensajería hasta la primera apertura. Cerrar y reabrir conserva el estado de la
instancia; actualizar conversaciones y mensajes sigue siendo una acción manual.

## Relación real entre trabajos y mensajes

La relación existente es **trabajo → asignaciones → mensajes**.
`mensajes.asignacion_id` referencia una asignación. No existe una conversación
compartida por trabajo que reúna a todos sus participantes.

La lista agrupa las asignaciones por su trabajo real. Un trabajo con una sola
asignación abre su historial directamente. Si hay varias, permite elegir cuál
abrir. La conversación identifica el trabajo, título, estado e ID de la
asignación. Los historiales permanecen separados. Un trabajo sin asignaciones
no tiene un historial disponible mediante el modelo actual y no aparece como
conversación. Esta limitación no requiere cambios de base de datos para la
presentación implementada.

No se añaden vistas previas no consultadas, contadores sin leer, confirmaciones
de lectura, presencia ni funciones de adjuntos. No existían suscripciones en
tiempo real y no se incorpora otro mecanismo de actualización.

## Reutilización y permisos

- `scripts/mensajes.js` expone `crearMensajeria()`. Es la implementación única
  para la página existente y el nuevo panel. Se conservan sus lecturas y envío.
- `scripts/mensajeria-panel.js` monta la interfaz y recibe la empresa y perfil
  verificados por el anfitrión, además de una función `contextoVigente`.
- Home Empresa 2 conserva su comprobación de rol, sesión, propietario y empresa
  activa. Solo después monta el componente.
- El panel restringe la presentación a trabajos de la empresa activa que
  corresponden al propietario verificado; RLS y la RPC conservan la autoridad
  sobre lectura y envío. No se amplían permisos.
- Se destruye al salir, cerrar sesión o detectar cambio de usuario. Se descartan
  resultados asíncronos de contextos antiguos y se retiran listeners. Si cambia
  la empresa activa, no se permiten envíos desde la instancia anterior.
- No se modifican Auth, roles, RLS, SQL, tablas ni registros para implementar el
  componente. Equipo, Trabajos y Estadísticas permanecen sin cambios.

Las lecturas conservadas son:

1. Asignaciones visibles bajo RLS: mismos campos, orden `creado_en` descendente
   y límite existente de 500.
2. Trabajos de esas asignaciones: `id, empresa_id, nombre`.
3. Empresas de esos trabajos: `id, nombre, propietario_id`.
4. Historial seleccionado: mismos campos, filtro `asignacion_id`, orden
   `creado_en`/`id` ascendente y límite existente de 500.

El envío continúa usando exclusivamente `supabase.rpc('enviar_mensaje',
{ asignacion_id, contenido })`, con las validaciones existentes: texto recortado,
no vacío y hasta 4000 caracteres. No se inserta directamente en `mensajes`.
Los límites de 500 son los originales: la paginación de historiales o de
asignaciones queda fuera de este rediseño.

La ruta anterior se conserva para compatibilidad y usuarios trabajadores. No
se crea una página de chat empresarial nueva ni se obliga a Home Empresa 2 a
abrir la antigua.

## Interacción y presentación

- Botón basado en `recursos/boton_mensaje` (Uiverse.io / vinodjangid07): mismo
  SVG, forma circular, sombra, tooltip y degradado de tamaño 300% desplazable
  al interactuar. Colores adaptados a MOVANZA.
- Chat basado en `recursos/chat` (Uiverse.io / ahmed150up): contenedor, avatar,
  encabezado, burbujas izquierda/derecha y redactor con textarea y envío.
- Escritorio: panel amplio de dos columnas, no modal; Home Empresa 2 continúa
  accesible fuera del panel. La capa fija se recorta al viewport y permite clics
  fuera de sus controles para evitar bloqueo o desplazamiento horizontal.
- Móvil: lista y conversación alternadas, retorno a trabajos, panel de altura
  dinámica, áreas seguras, foco contenido y fondo inerte durante la apertura.
- Escape o el botón de cerrar devuelve el foco al botón flotante. Cerrar no
  descarta borradores, aun con envío en curso; la operación conserva su estado.
- Borradores por asignación en memoria de la instancia. No se guardan mensajes
  privados en almacenamiento persistente. Se pierden al abandonar o recargar,
  como el formulario anterior.
- Carga real y errores con reintento manual. Los envíos se bloquean mientras hay
  una operación crítica; los errores conservan el texto. Un envío confirmado
  seguido de un fallo de lectura se informa como enviado para evitar reintentos
  que dupliquen el mensaje.
- Actualizar conserva la posición si el usuario está leyendo mensajes antiguos;
  sigue el final cuando ya está cerca del último mensaje. Cambiar de asignación
  invalida las respuestas pendientes del historial anterior.
- Texto empresarial y mensajes se insertan con `textContent`. Sin HTML de
  terceros ni funciones ficticias. Animaciones breves y movimiento reducido.

## Archivos y validación

- `scripts/mensajes.js`: lógica existente encapsulada y ciclo de vida reutilizable.
- `scripts/mensajeria-panel.js`: componente visual y controles del panel.
- `estilos/mensajeria.css`: recursos adaptados y comportamiento responsivo.
- `scripts/home-empresa-2.js`: montaje tras verificar sesión y empresa.
- `scripts/generar-home-empresa-2.mjs` y `home_empresa_2.html`: hoja de estilos.
- `pruebas/mensajeria.mjs`: pruebas aisladas de integración, sin servicios reales.

Ejecutar con el directorio temporal de dependencias utilizado por las otras
pruebas del proyecto:

```powershell
node --experimental-vm-modules --disable-warning=ExperimentalWarning pruebas/mensajeria.mjs <directorio-con-jsdom>
```

Las pruebas verifican aislamiento, agrupación sin mezclar historiales, RPC
original, carga diferida, fallos y recuperación, borradores, controles de envío,
respuestas fuera de orden, posición del historial, teclado móvil, destrucción al
cerrar sesión y compatibilidad con la interfaz existente. No envían mensajes a
Supabase ni sustituyen una inspección visual en navegador.
