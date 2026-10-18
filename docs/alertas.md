# Cards de alerta globales

`scripts/alertas.js` y `estilos/alertas.css` implementan una sola card reutilizable con cola FIFO. Se carga en las 21 páginas propias con interfaz (públicas, autenticación, módulos y políticas) y se incorpora a sus generadores. La ruta de compatibilidad de Crear Empresa sigue siendo una redirección existente y no necesita otra interfaz.

## Recurso y presentación

Se revisaron todos los archivos de `recursos/card_alerta`: `alerta.html` y `alerta.css`; el recurso no incluye JavaScript ni botones. Se conservan su estructura card/bg/blob, superficie blanca translúcida con desenfoque de 24 px, esfera difuminada de 12 px y recorrido de cinco segundos mediante `translate3d`. Se adaptan tamaño, contraste, sombras y colores a la guía visual de MOVANZA. Los botones utilizan el relleno interior y la pulsación del recurso de botones, con foco visible y prioridad diferenciada.

La card utiliza `dialog.showModal()` y su capa superior nativa: queda sobre Perfil, Crear Empresa, formularios de asignaciones o el panel móvil de Trabajos. Mantiene el fondo difuminado e inerte y restaura sus valores previos al cerrar. Escape, cerrar o cancelar devuelven una decisión negativa. En confirmaciones el foco inicial está en Cancelar, incluidas las destructivas. Los eventos de la card no se propagan a manejadores de cierre o navegación del fondo.

Hay entrada y salida breves; las animaciones se desactivan con movimiento reducido. La card admite desplazamiento interno, botones táctiles, texto largo y ajuste al viewport visual cuando aparece el teclado móvil. No cambia rutas ni usa nuevas páginas, recargas o iframes.

El acceso embebido existente de Login/Sign Up utiliza la card en la ventana superior del mismo origen, compartiendo la instancia y la cola. Se conserva el formulario de origen y se restaura su foco.

## API

```js
import { mostrarAlerta, confirmarAccion, solicitarTexto } from './alertas.js';

await mostrarAlerta({ tipo: 'exito', titulo: 'Cambios guardados', mensaje: 'Los cambios se guardaron correctamente.' });

const confirmado = await confirmarAccion({
    titulo: 'Cancelar asignación', mensaje: 'El historial se conservará.',
    textoConfirmar: 'Cancelar asignación', textoCancelar: 'Volver', destructiva: true
});
if (!confirmado) return;
// Ejecutar aquí la operación existente y sus validaciones.

const texto = await solicitarTexto({
    titulo: 'Nombre visible', etiqueta: 'Nombre', requerido: true,
    minLength: 3, maxLength: 30,
    validar: valor => valor.trim() ? '' : 'Completa este campo.'
});
if (texto === null) return;
```

Tipos de aviso: `exito`, `error`, `advertencia`, `informacion`. `confirmarAccion` devuelve booleano; `solicitarTexto` devuelve texto o `null`. También admite valor inicial, placeholder, patrón y validador asíncrono, cuyo procesamiento bloquea envíos duplicados. No admite campos de contraseña ni introduce flujos de credenciales. No había llamadas a `prompt()` en el código propio.

La API escapa los mensajes con `textContent`, no ejecuta HTML y no conoce Supabase. Las operaciones siguen en sus módulos. Una confirmación repetida mientras ya está pendiente se cancela para el segundo llamador: una decisión nunca reanuda dos operaciones. Los avisos idénticos pendientes se agrupan. Se cancelan decisiones cuyo formulario de origen fue retirado o cerrado.

## Sustituciones y resultados

La auditoría encontró y sustituyó 11 llamadas reales a `confirm()` y dos a `alert()`:

- Perfil, Crear Empresa, formularios de asignaciones y panel de Trabajos: descarte de cambios.
- Equipo: retiro de un integrante conservando el historial.
- Trabajos: cancelación de asignación y de asignaciones no iniciadas de un trabajo.
- Mis asignaciones: aceptación, verificación GPS al iniciar y confirmación de finalización.
- Mis invitaciones: rechazo.
- Cuenta: error al cargar Perfil.

Se revisaron también las referencias indirectas y los manejadores. Las funciones de descarte y sus llamadores esperan la promesa. En navegación desde Trabajos se hace `preventDefault()` antes de esperar la decisión, y solo se navega si se confirma. Los guards de operación y sesión permanecen activos.

`observarResultados()` presenta mediante el mismo componente los errores y éxitos publicados por los mensajes de sistema existentes. Conserva el estado en línea y no convierte cargas, filtros o estados vacíos normales en interrupciones. Reconoce las advertencias de GPS y muestra el resultado real de las validaciones, sin alterar precisión, radio, consultas ni RPC. Los resultados iniciales de módulos ocultos se presentan al hacerse visible la interfaz.

No se han cambiado Auth, tablas, RLS, roles, reglas de negocio, operaciones de Supabase ni diálogos de permisos del navegador. Las dos protecciones `beforeunload` contra pérdida de formularios se conservan: al cerrar o abandonar una pestaña el navegador no permite esperar una card asíncrona. La navegación interna que necesita confirmación sí utiliza las cards.

## Verificación

```powershell
node --experimental-vm-modules --disable-warning=ExperimentalWarning pruebas/alertas.mjs <directorio-con-jsdom>
```

La suite usa el componente real, con diálogos nativos de JS prohibidos. Verifica cola, deduplicación, cancelación, Escape, foco, inercia, formularios superpuestos, texto seguro, validación de entrada, validación asíncrona, avisos GPS y éxitos, acceso embebido, rechazo real de invitación y bloqueo inmediato de navegación con cambios. Incluye una auditoría automática que comprueba ausencia de llamadas nativas y disponibilidad en las páginas propias. No modifica recursos de terceros.

Las suites de regresión existentes utilizan `pruebas/alertas-simuladas.js` exclusivamente para configurar decisiones de sus fixtures sin interacción manual; las promesas y el comportamiento visual se prueban con el servicio real en la suite anterior. Se adaptaron las expectativas síncronas a la nueva espera asíncrona.

Las verificaciones con jsdom se complementan con `pruebas/alertas-estilos.mjs`, ejecutada con Chrome headless real. Carga las hojas locales en el orden de seis páginas (Index, Login, ambos Home y los dos módulos del trabajador), incluyendo los estilos de Perfil. Comprueba contraste mínimo de 4,5:1 sin hover en los botones primario, secundario y destructivo; el recorrido del brillo hasta las cuatro esquinas; y el ancho de la card, en vistas de 1365 y 390 píxeles. Guarda capturas para revisión visual.

Los estilos del componente se aíslan mediante `#movanza-alerta` para evitar que los botones de cada página sobrescriban su presentación. El círculo difuminado conserva las capas y el ciclo de cinco segundos del recurso `card_alerta`, con un recorrido ajustado al perímetro real de la card, independientemente de la longitud del mensaje.

```powershell
node pruebas/alertas-estilos.mjs "C:/Program Files/Google/Chrome/Application/chrome.exe"
```
