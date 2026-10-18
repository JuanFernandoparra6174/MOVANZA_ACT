# Mis asignaciones: lista, mapa y acciones del trabajador

`paginas/mis_asignaciones.html` utiliza el encabezado compartido `encabezadoTrabajador()` con Mis asignaciones activo, el footer del Index y la identidad visual oficial. Se reemplazan el banner con identificador técnico, el bloque extenso de GPS y la lista de detalles repetidos por un banner compacto, resumen de estados, lista filtrable y mapa con detalle seleccionado.

## Arquitectura

- `scripts/asignaciones-interfaz.js` verifica sesión y rol mediante `consultarAcceso()` y los permisos existentes antes de importar el módulo de acciones. Pasa el perfil verificado a `iniciarAsignaciones()`, evitando otra autenticación/consulta del perfil. La página ya no carga el shell genérico `modulo.js`.
- `scripts/mis_asignaciones.js` conserva las consultas de asignaciones por `trabajador_id`, trabajos y empresas, los estados, acciones, confirmaciones, validaciones de resultado y RPC existentes. La presentación entrega las cards de detalle y sus botones reales a `asignaciones-vista.js`; los handlers de las acciones no se duplican.
- `scripts/asignaciones-vista.js` presenta cards compactas, conecta la selección con Leaflet, mantiene una única instancia del mapa y muestra los formularios existentes en un diálogo nativo. Las cancelaciones con datos modificados confirman el descarte. Cerrar sesión o cambiar de cuenta retira los datos y el mapa e invalida respuestas pendientes.
- `componentes/asignaciones-formularios.html` conserva los formularios originales de rechazo/finalización. `scripts/generar-mis-asignaciones.mjs` los incorpora con el encabezado y footer compartidos.
- `estilos/mis-asignaciones.css` organiza lista izquierda/mapa derecha, estados oficiales con texto, detalle contextual, foco visible y respuestas hover discretas. En móvil el mapa aparece primero, el detalle solo se muestra al seleccionar y la lista tiene desplazamiento interno. Se respeta movimiento reducido.

## Información geográfica

Se reutiliza Leaflet 1.9.4 y OpenStreetMap, como en Trabajos de Empresa. No se modifica ese módulo ni se incorpora otra biblioteca.

Cada trabajo legible con coordenadas numéricas válidas tiene un marcador violeta. Varias asignaciones del mismo trabajo comparten punto, pero conservan sus acciones y estados separados. Los popups muestran nombre real, empresa cuando es legible, radio registrado y las actividades visibles. Los círculos violetas utilizan exactamente `radio_metros`, sin radios por defecto. Datos y popups se insertan mediante `textContent`.

La búsqueda por título, objetivo, trabajo o empresa y el filtro por estado sincronizan lista y marcadores. Las actividades sin coordenadas permanecen en la lista y se identifican como ubicación no disponible. No se inventan direcciones ni campos ausentes.

Ubicarme reutiliza `obtenerUbicacion()` y muestra un marcador azul y un círculo discontinuo con la precisión real. La ayuda y la leyenda distinguen ese margen del radio autorizado del trabajo. No se consulta GPS al cargar la página, no se usa `watchPosition` y Ubicarme no llama a Supabase ni persiste la posición. Se eliminaron los logs de coordenadas del navegador.

Si Leaflet falla, la lista y las acciones continúan disponibles. Ver trabajos permite reintentar el mapa; Ubicarme permanece deshabilitado mientras no haya mapa.

## Inicio, finalización y seguridad

Ambas acciones solicitan una posición nueva con las opciones existentes: alta precisión, máximo 20 segundos y `maximumAge: 0`. No reutilizan el punto mostrado por Ubicarme como autorización.

Las RPC originales `iniciar_asignacion` y `finalizar_asignacion` siguen recibiendo ID, latitud, longitud y precisión; finalizar conserva además objetivo cumplido y observaciones. El cliente no envía ni permite editar `inicio_en` o `fin_en`. La duración continúa calculándose con las marcas del servidor.

La función SQL existente `privado.validar_ubicacion` exige precisión de hasta `min(radio, 50)` metros y distancia al punto más precisión dentro del radio. La misma función se ejecuta al iniciar y finalizar. No se cambian estas reglas, RLS, tablas, Auth, roles ni permisos. Los mensajes de permiso denegado y fuera del radio se presentan con instrucciones claras; la precisión insuficiente conserva la explicación del servidor.

Los botones se bloquean durante las operaciones y la confirmación de éxito requiere la respuesta de la RPC y la consulta actualizada. GPS pendiente tras cerrar sesión no dispara una RPC. No se exponen asignaciones fuera del trabajador autenticado, además del control RLS existente.

## Generación y validación

```powershell
node scripts/generar-mis-asignaciones.mjs
node --experimental-vm-modules --disable-warning=ExperimentalWarning pruebas/asignaciones.mjs <directorio-con-jsdom>
node pruebas/roles.mjs <directorio-con-pglite>
```

La suite de interfaz verifica asignaciones reales simuladas, filtro por trabajador, mapa único, radios exactos, sincronización bidireccional, trabajos sin coordenadas, búsqueda, formularios, aceptar/rechazar, inicio/finalización, carga, envíos duplicados, duración del servidor, errores GPS y limpieza de sesión. Las pruebas SQL locales comprueban que iniciar y finalizar fuera del radio o con precisión insuficiente se rechazan sin modificar las marcas de tiempo. No escriben en Supabase.

También se ejecutaron las suites existentes de Perfil, acceso, Home Trabajador y Trabajos de Empresa. No había navegador conectado: quedan por verificar visualmente el renderizado de Leaflet, el comportamiento en dispositivos y una lectura GPS real. Las pruebas con jsdom no sustituyen esa verificación.
