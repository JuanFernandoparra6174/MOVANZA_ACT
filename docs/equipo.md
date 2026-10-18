# Interfaz Equipo

Ruta existente: `paginas/equipo.html`.

## Presentación

`scripts/generar-equipo.mjs` genera el shell de Equipo con el componente
`encabezadoEmpresarial({ raiz: '../', actual: 'equipo' })` y extrae el footer
completo del Index, ajustando sus enlaces. El banner usa los estilos existentes
de Home Empresa 2 con el título y descripción propios de Equipo. El nombre real
de la empresa sigue asignándose desde `equipo.js`.

La interfaz mantiene el formulario de búsqueda, sus campos y restricciones,
los resultados con Enviar invitación, los integrantes con edición de alias y
Retirar integrante, y la lista de invitaciones pendientes. El contenido se
ordena en secciones separadas, con etiquetas visibles y mensajes de estado.

Las listas usan las clases del recurso adaptado de `recursos/tabla`, ya empleado
en la selección de empresas: columnas, ampliación, sombra, superficie degradada
al pasar el cursor o enfocar un control, y bordes laterales degradados. Los
estilos compartidos se cargan sin modificarlos. `estilos/equipo.css` adapta las
alturas y acciones para que los inputs y ambos botones sean accesibles, con
distribución de una columna en móvil. Los botones conservan el recurso de
relleno interior. Se mantienen las preferencias de movimiento reducido.

## Conservación funcional

No cambian consultas, RPC, filtros, campos, normalizaciones, confirmaciones ni
mensajes operativos de `scripts/equipo.js`. Sus únicos cambios son las clases de
presentación de los registros y botones, y la exposición de la promesa de inicio
para que la interfaz pueda terminar el estado de carga en el momento real.

`equipo-interfaz.js` reutiliza `consultarAcceso()` y
`puedeAbrirModulo(rol, 'equipo')`, los mismos permisos que el guard existente.
Importa el módulo operativo únicamente después de verificar el rol. La
comprobación de la empresa activa y su propietario continúa dentro del módulo
original, usando `sessionStorage.movanza_empresa_activa`. No hay consultas
adicionales a empresas, integrantes ni invitaciones.

El encabezado compartido permite volver a Home Empresa 2, cambiar empresa,
abrir los módulos existentes, consultar el perfil y cerrar sesión. Estadísticas
recibe el mismo identificador activo como filtro inicial. El cambio o cierre de
sesión retira la vista; una respuesta pendiente no vuelve a mostrarla. Volver
desde la caché de navegación exige recargar las comprobaciones.

`equipo-carga.js` cubre la carga inicial real y los errores de dependencias. Los
procesos de búsqueda y gestión muestran el loader compartido siguiendo los
mensajes existentes hasta su éxito o error. Una carga fallida no deja textos de
«Cargando» indefinidamente. No se simulan esperas.

No se modifican la base de datos, Auth, roles, RLS ni otros módulos empresariales.

## Regeneración y verificación

```powershell
node scripts/generar-equipo.mjs
node --experimental-vm-modules --disable-warning=ExperimentalWarning pruebas/equipo.mjs <directorio-con-jsdom>
```

Las pruebas ejecutan el código operativo real con transporte Supabase simulado.
Comprueban las columnas y filtros de consultas, empresa activa, búsqueda,
invitación, alias, retirada con confirmación, errores, carga real, acceso,
sesiones, enlaces, encabezado y footer. No consultan ni escriben en la base real.
