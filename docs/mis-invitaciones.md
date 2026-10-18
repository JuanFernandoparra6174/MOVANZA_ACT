# Mis invitaciones

`paginas/mis_invitaciones.html` utiliza exactamente `encabezadoTrabajador()` con Mis invitaciones activo y el footer del Index. Su banner «Conecta con nuevas oportunidades» y la bandeja de invitaciones tienen una presentación propia, sin modificar Home Trabajador ni Mis asignaciones.

## Datos y operaciones conservadas

Se reutiliza la RPC `listar_invitaciones_visibles`, filtrando las filas por el ID del perfil autenticado. La consulta ya devuelve historial; la interfaz anterior solo presentaba pendientes. Ahora se ofrecen filtros locales para Todas, Pendientes, Aceptadas, Rechazadas y Canceladas. Los cuatro estados están definidos en el esquema existente, incluido `cancelada`. Cambiar el filtro no consulta Supabase ni cambia la URL.

Las cards muestran únicamente nombre de empresa, estado y fecha de recepción disponibles en la RPC. El avatar se deriva de las iniciales del nombre real. Los datos ausentes tienen una indicación explícita; no se agregan logotipos, ofertas, fechas de respuesta ni campos inventados. Las invitaciones se ordenan por recepción, con fechas ausentes al final.

La sección «Empresas donde trabajo» conserva la consulta de membresías activas por `trabajador_id`, con alias interno y fecha de ingreso, y la consulta de nombres de sus empresas. Se presenta como un panel de equipos actuales. Un error en este panel no oculta invitaciones que sí pudieron consultarse.

Aceptar y rechazar siguen usando exclusivamente `responder_invitacion({ invitacion_id, aceptar })`. Rechazar conserva su confirmación previa. La RPC existente comprueba rol Trabajador, destinatario, estado pendiente y respuesta válida, y gestiona la membresía y las marcas de tiempo en el servidor. El cliente no realiza inserciones o actualizaciones adicionales, ni cambia estas reglas.

Durante una respuesta se deshabilitan acciones y filtros; el botón indica Aceptando/Rechazando y se muestra el loader compartido. No se cambia el estado hasta confirmar la RPC. Después se actualizan invitaciones y equipos. Si falla la escritura se conserva la última información válida. Si la respuesta se confirmó pero falla la lectura posterior, se mantiene la respuesta confirmada, se informa del fallo y se permite actualizar sin volver a responder.

## Presentación y mantenimiento

- `scripts/mis_invitaciones.js`: consultas y respuesta existentes, contexto de sesión y control de operaciones.
- `scripts/invitaciones-vista.js`: cards, filtros, estados vacíos, equipos, carga, mensajes y foco después de responder.
- `scripts/invitaciones-interfaz.js`: verifica la sesión y permisos con `consultarAcceso()` antes de cargar los datos. Pasa el perfil verificado al módulo y evita una segunda consulta de autenticación. También integra el encabezado, salida de sesión y descarte de respuestas tardías.
- `scripts/invitaciones-carga.js`: estado de carga/error del acceso y las dependencias.
- `estilos/mis-invitaciones.css`: cuadrícula y panel de equipos, tarjetas con borde del recurso compartido, botones de relleno adaptados, adaptación móvil y movimiento reducido. Se revisaron los recursos de cards, botones, inputs, tooltips y loaders; se reutilizan el botón de relleno y el loader existentes. El borde se anima al interactuar con invitaciones pendientes para evitar movimiento permanente.
- `scripts/generar-mis-invitaciones.mjs`: genera únicamente esta página con encabezado y footer compartidos. No reescribe otros módulos.

```powershell
node scripts/generar-mis-invitaciones.mjs
node --experimental-vm-modules --disable-warning=ExperimentalWarning pruebas/invitaciones.mjs <directorio-con-jsdom>
```

## Validación

La suite verifica perfil y rol, ámbito de invitaciones, membresías activas, filtros sin consultas, historial, fechas/nombres ausentes, texto seguro, carga real, duplicados, aceptación, confirmación de rechazo, errores de escritura y actualización posterior, reintentos, estados vacíos, Perfil sobre la misma página, conservación de filtros y limpieza al cambiar de sesión. No escribe en Supabase.

También se ejecutan las suites existentes de autenticación, Home Trabajador, Perfil, Mis asignaciones y permisos SQL locales. No hay modificaciones de base de datos, RLS, Auth, roles, estados, reglas de respuesta ni dependencias. La comprobación SQL utiliza PostgreSQL local aislado, sin tocar el servicio remoto.

No había navegador conectado para una revisión visual: las verificaciones con jsdom no comprueban el renderizado ni las animaciones reales en dispositivos.
