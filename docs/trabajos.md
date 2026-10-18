# Rediseño de Trabajos

La ruta existente sigue siendo `paginas/trabajos.html`. El trabajo se limita a
presentación e interacción: no cambia tablas, Auth, RLS, roles ni permisos.
Equipo y Estadísticas no se modifican.

## Distribución

- Encabezado empresarial compartido, con Trabajos activo y menú Cuenta.
- Banner breve con el título y descripción solicitados y la empresa real.
- Explorador con pestañas Mapa y Lista. Conserva Leaflet 1.9.4, las capas de
  OpenStreetMap, sus controles, el centrado, la selección y los radios.
- Card lateral de detalle, creación o edición. En móvil, el mismo nodo y los
  mismos formularios pasan a un diálogo nativo con fondo desenfocado. No se
  duplican formularios, listeners ni registros.
- Footer extraído íntegramente del Index, con enlaces relativos adaptados.

Los registros de la lista reutilizan la adaptación de `recursos/tabla`:
superficie y bordes degradados, ampliación, sombra y efectos de foco. Los puntos
seleccionados se identifican en la lista y en los marcadores. El panel utiliza
`efecto-card` y su borde animado existentes. Las asignaciones se despliegan dentro
del detalle para evitar mostrar todos sus campos a la vez.

## Formularios y acciones existentes

`componentes/trabajos-formularios.html` conserva los tres formularios originales
con sus IDs, campos, límites y restricciones. El generador los incorpora en la
card, sin reemplazar sus operaciones. `trabajos.js` mantiene las consultas,
filtros, RPC, validaciones y las reglas que restringen las acciones según las
asignaciones iniciadas o en curso. Sus cambios conectan esos métodos con el
adaptador visual `trabajos-panel.js`.

Seleccionar desde un marcador o la lista abre el detalle con los datos y acciones
reales. Crear o editar usa la misma card; agregar asignaciones sigue bloqueando
los campos del punto existente. El éxito vuelve al detalle actualizado. Los
errores mantienen los campos y mensajes operativos, incluido el resultado
parcial de crear un trabajo y fallar al crear alguna asignación. No se añade
atomicidad, reintento automático ni otra operación empresarial.

El módulo original **no dispone de eliminación de puntos**. Se conservan
Cancelar asignación y Cancelar pendientes, con confirmación que identifica el
registro. No se añade ningún borrado ni se elimina el historial.

## Interacción, carga y accesibilidad

Las operaciones muestran el loader solo durante la espera real. Se bloquean los
envíos repetidos y el cierre o cambio de punto mientras se procesa una operación.
Los formularios con cambios o una ubicación nueva requieren confirmar su
descarte antes de cerrar, cambiar de punto o navegar. La navegación confirmada
no vuelve a pedir la misma confirmación al salir.

En móvil, Elegir ubicación deja el mapa accesible y conserva el formulario.
Seleccionar el punto reabre la card; Volver a la card permite regresar sin cambiar
la ubicación. Usar centro del mapa ofrece una alternativa de selección mediante
teclado utilizando la misma función geográfica existente. Las pestañas admiten
flechas, Inicio y Fin; el diálogo gestiona el foco y Escape. La cabecera de la
card permanece accesible al desplazar formularios extensos.

Las transiciones y el desplazamiento respetan movimiento reducido. Se conservan
el fondo exterior y sus colores originales. No se añaden dependencias: Leaflet
ya cubre el mapa y CSS, Web Animations y el diálogo nativo cubren la presentación.

## Acceso y archivos

`trabajos-interfaz.js` reutiliza `consultarAcceso()` y el permiso Trabajos,
equivalentes a los del guard anterior. Carga el módulo operativo después de
verificar el rol. La validación del propietario y de
`sessionStorage.movanza_empresa_activa` sigue dentro de `trabajos.js`.
El cierre o cambio de sesión retira la interfaz y las cards, incluso con una
respuesta pendiente. Al recargar o volver desde la caché de navegación se
repiten las comprobaciones. `trabajos-carga.js` maneja la carga inicial y los
fallos de dependencias, sin esperas artificiales.

Archivos nuevos de presentación: `estilos/trabajos.css`,
`scripts/trabajos-panel.js`, `scripts/trabajos-interfaz.js`,
`scripts/trabajos-carga.js`, `scripts/generar-trabajos.mjs` y el fragmento de
formularios. Se actualizan la página existente y los enlaces de presentación
del script operativo; no se crea un sistema de puntos paralelo.

## Regeneración y comprobaciones

```powershell
node scripts/generar-trabajos.mjs
node --experimental-vm-modules --disable-warning=ExperimentalWarning pruebas/trabajos.mjs <directorio-con-jsdom>
```

Las pruebas ejecutan los módulos reales con Supabase y Leaflet simulados.
Verifican filtros empresariales, formularios y restricciones, mapa/lista,
creación, edición, asignaciones, cancelaciones, reglas de trabajos en curso,
resultado parcial, errores, carga, cierre con cambios, modo móvil, sesiones y
componentes compartidos. También comprueban que el CSS oculta los estados
inactivos de la card. No leen ni escriben la base de datos real.
