# Index público de MOVANZA

Se conserva la estructura existente: seis cards con imágenes locales, secciones
en diálogos, experiencias y footer. Los formularios y el código de autenticación,
los paneles privados y Supabase conservan su funcionamiento.
Login y Sign Up tienen sus propias páginas, `login.html` y `signup.html`.
El perfil permanece en su ubicación actual; véase `docs/login-y-registro.md`.

## Contenido y documentos

La fuente editorial es `informacion/Movanza_Contenido_Index.txt`. El Index incluye
sus títulos, descripciones, misión, visión, fundadores, canales de contacto,
servicios, público objetivo y preguntas frecuentes. Las redes sociales no se
muestran hasta contar con enlaces oficiales. El usuario confirmó que los tres
testimonios son reales y cuentan con autorización; se retiró el aviso editorial.

| Descripción de política | Documento completo |
| --- | --- |
| Privacidad y protección de datos | `politicas/privacidad.html` |
| Seguridad de la información | `politicas/seguridad.html` |
| Términos y condiciones | `politicas/terminos.html` |
| Prestación del servicio | `politicas/servicio.html` |
| Garantías | `politicas/garantias.html` |
| Cancelaciones y devoluciones | `politicas/cancelaciones.html` |

Cada página conserva íntegramente su documento de
`informacion/Movanza_Politicas_Completas.txt`. Incluye las referencias normativas
y retorno a `index.html#politicas`. Las notas de preparación, el preámbulo
editorial y las listas internas de publicación quedan en el archivo fuente,
fuera de la interfaz pública. Los cuerpos legales se conservan completos.
No se modificó el archivo fuente ni se incorporó el texto extenso al
Index. Para regenerar las páginas sin dependencias adicionales:

```powershell
node scripts/generar-politicas.mjs
```

Los documentos se presentan como artículos de lectura: títulos independientes,
apartados numerados, párrafos fluidos e índice lateral con enlaces por apartado.
En móvil el índice es plegable. Las referencias normativas se organizan en un
desplegable al final. En los cuerpos legales se eliminan solamente los
separadores de ASCII y los saltos de línea artificiales del TXT; el contenido
legal se conserva. Las pruebas comparan todas las palabras de los cuerpos
legales y de las referencias contra la fuente, normalizando ese formato.

Los enlaces de teléfono, WhatsApp y correo utilizan exclusivamente los datos
proporcionados. El chat dirige al acceso existente para utilizar Mensajes.
El formulario envía mediante `POST /api/contacto` al Worker de MOVANZA, que
utiliza Resend para notificar a `contacto@movanza.site`. No guarda solicitudes
en Supabase. Configuración y pruebas: [contacto.md](contacto.md).

## Recursos visuales

Se revisaron los HTML y CSS de las seis carpetas de `recursos`, incluidos los
nombres reales `loarders/loarders.html` y `loarders/loarder.css`.
Los originales permanecen intactos. Las adaptaciones tienen atribución en
`estilos/componentes-publicos.css`:

- **efecto_fondo / sinful_9361:** se enlaza directamente el CSS original, sin
  modificar colores, estrellas, distancias, keyframes ni duraciones de
  50, 100 y 150 segundos. El contenedor fijo, decorativo e inerte tiene
  `pointer-events: none` y queda detrás de `.sitio-publico`, la superficie blanca.
  El fondo conserva sus animaciones también con movimiento reducido, conforme
  a la excepción solicitada.
- **efecto_card / bhaveshxrawat:** banda de gradiente giratoria de 3 segundos
  y máscara interior de 5 píxeles con colores de MOVANZA. Se reutiliza con la
  clase `.efecto-card` y su hijo decorativo `.efecto-card-borde`. Las variables
  `--efecto-card-base`, `--efecto-card-uno` y `--efecto-card-dos` configuran los
  colores. Las imágenes y los enlaces siguen presentes.
- **loaders / xXJollyHAKERXx:** spinner con gradiente, núcleo difuminado y giro
  de 1,7 segundos, adaptado al tamaño del formulario y a los colores de marca.
- **botones / adamgiebl:** relleno interior en los botones secundarios y cierre,
  con transiciones breves y foco visible.
- **inputs / AbanoubMagdy1:** línea y color de foco adaptados; se mantienen
  etiquetas visibles, validaciones e identificadores. No se incorporaron las
  etiquetas flotantes por caracteres.
- **tool_tips / Siyu1017:** ayuda del enlace de chat disponible con ratón y foco
  de teclado, con colores de MOVANZA y `aria-describedby`.

Las animaciones de cards y loaders se detienen con movimiento reducido.
Estos componentes se cargan solamente en la portada; los paneles no los importan.

## Loaders reutilizables

`scripts/componentes-publicos.js` expone `window.MovanzaUI` sin dependencias:

```js
const indicador = MovanzaUI.crearLoader('Procesando solicitud…');
contenedor.append(indicador);
const control = MovanzaUI.observarCarga({
    region: formulario,
    indicador,
    ocupado: () => solicitudPendiente
});
// Al cambiar un estado externo no observable:
control.actualizar();
// Al desmontar el componente:
control.desconectar();
```

El proceso debe proporcionar su mensaje accesible de estado. El indicador es
visual para evitar anuncios duplicados, y la región comunica `aria-busy`.
El observador responde a cambios de botones, clases y mensajes; no modifica
solicitudes ni introduce temporizadores de espera.

La portada lo utiliza al cargar el módulo Auth, comprobar sesión, guardar el
perfil y cerrar sesión. Las páginas independientes lo utilizan para iniciar
sesión y registrar cuentas. Se oculta al finalizar, incluidos los errores.
El formulario de contacto muestra su loader durante el envío real; las páginas legales estáticas no simulan esperas.
`scripts/autenticacion.js` se adaptó a los formularios independientes conservando
sus llamadas, datos y controles de acceso existentes.

## Validación y pendientes

Se utiliza la instalación temporal de jsdom de las pruebas existentes:

```powershell
node --experimental-vm-modules --disable-warning=ExperimentalWarning pruebas/interfaz.mjs <directorio-con-jsdom>
node --experimental-vm-modules --disable-warning=ExperimentalWarning pruebas/index-publico.mjs <directorio-con-jsdom>
node --experimental-vm-modules --disable-warning=ExperimentalWarning pruebas/contenido-publico.mjs <directorio-con-jsdom>
```

Las pruebas verifican autenticación simulada y permisos, enlaces, navegación,
loaders con carga pendiente y error, contenido oficial y la reconstrucción exacta
del contenido legal a partir de sus seis páginas, sin los separadores y saltos
de línea del TXT. No consultan ni modifican la
base de datos real.

La activación del envío requiere el secreto de Resend y un dominio verificado;
véase `docs/contacto.md`. Quedan pendientes las redes oficiales
y la finalización de los borradores legales
según sus notas originales. No se publicó el sitio desde esta tarea.
La revisión visual de escritorio, móvil y animaciones requiere un navegador
conectado; jsdom no realiza renderizado ni comprueba el movimiento visual.
