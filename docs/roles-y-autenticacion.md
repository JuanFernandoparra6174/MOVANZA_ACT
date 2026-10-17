# Roles y autenticación de MOVANZA

Cada cuenta de Supabase Auth tiene un único perfil y un único rol en `public.perfiles.rol`: `empresa`, `trabajador` o `administrador`. El UUID permanece en `usuario_auth_id`; las tablas propias conservan sus identificadores numéricos y sus relaciones.

## Estado y orden de puesta en marcha

La migración `separar_roles` se aplicó mediante Supabase MCP en el proyecto `pjyusanlrvoptqzpdxod`, con la versión `20261017020446`. El archivo local conserva esa misma versión para evitar que una sincronización posterior intente aplicarla de nuevo. El frontend está preparado en el repositorio y no se ha publicado desde esta tarea.

1. Comprobar que el proyecto de destino corresponde a la URL de `configuracion/supabase.js`: `pjyusanlrvoptqzpdxod`.
2. En el proyecto actual, la migración `supabase/migrations/20261017020446_separar_roles.sql` ya está aplicada: no volver a ejecutarla. Para otro entorno, comprobar primero el esquema previo y aplicar el archivo con una conexión autorizada como `postgres`.
3. El esquema, las políticas y las pruebas SQL remotas ya se verificaron. También se probaron registro, inicio y cierre de sesión contra Supabase Auth y REST reales con cuentas temporales. Actualmente el registro por correo está habilitado y no exige confirmación; no se modificó esa configuración.
4. Publicar el frontend después de aplicar la migración. Sin la columna `rol`, el frontend deniega el acceso al no poder verificar los permisos.

La migración no elimina datos. Clasifica como Empresa los propietarios actuales y como Trabajador los demás perfiles. Se detiene sin cambios si una cuenta propietaria también tiene registros como trabajadora; ese caso requiere una clasificación explícita antes de continuar. En la inspección inicial la base conectada estaba vacía.

## Registro y permisos

El formulario público ofrece Empresa y Trabajador. El trigger valida esa elección al insertar el usuario y la guarda en el perfil. Un alta de Auth sin rol recibe `trabajador`, para permitir también altas autorizadas desde el panel. El trigger rechaza `administrador` y cualquier otro valor. Cambiar posteriormente los metadatos de Auth no cambia el rol.

El inicio de sesión es común. El frontend consulta el rol en la base, construye la navegación y comprueba el permiso antes de importar cada módulo. Las páginas restringidas permanecen ocultas durante la comprobación. La autorización efectiva sigue en las políticas RLS y las RPC, que validan rol, propiedad, destinatario y pertenencia.

| Rol | Módulos |
| --- | --- |
| Empresa | Trabajos, Mensajes, Estadísticas, Equipo, Empresas |
| Trabajador | Mis asignaciones, Mis invitaciones, Mensajes |
| Administrador | Panel administrativo básico |

Una cuenta Empresa puede conservar varias empresas. Un trabajador puede pertenecer a varias mediante `membresias`. Los trabajadores leen los datos relacionados que necesitan para sus tareas e invitaciones; no administran empresas. El administrador no tiene acceso general a los datos operativos en esta versión.

Las escrituras directas de perfiles siguen revocadas. `actualizar_mi_perfil` conserva su firma y solo permite modificar los nombres. No existe una RPC pública para cambiar roles.

## Habilitar un administrador

Crear o invitar primero una cuenta dedicada desde Supabase Auth mediante un operador autorizado. Completar el acceso y la contraseña con los mecanismos de Auth; no insertar contraseñas ni usuarios manualmente en sus tablas internas. No usar una cuenta con empresas o actividad operativa pendiente.

Un operador con acceso SQL como `postgres` habilita esa cuenta usando su UUID real de Auth:

```sql
select privado.habilitar_administrador('UUID_REAL_DE_AUTH'::uuid);
```

La función es `SECURITY INVOKER`, reside en el esquema privado y no permite ejecución a `anon`, `authenticated` ni `service_role`. Ni siquiera una sesión de administrador puede conceder este rol desde el cliente. El procedimiento rechaza cuentas con empresas, membresías activas, invitaciones pendientes o asignaciones pendientes, aceptadas o en curso.

## Validación local

Las pruebas locales no conectan con Supabase. `pruebas/estructura_previa.sql` reproduce el esquema público y las funciones inspeccionadas; usa una simulación mínima de `auth.users` y `auth.uid()` únicamente para ejecutar pruebas SQL de autorización. Nunca aplicar ese fixture en Supabase.

Instalar los paquetes de pruebas en un directorio temporal, sin agregar dependencias a MOVANZA:

```powershell
$carpetaPruebas = Join-Path $env:TEMP ('movanza-roles-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $carpetaPruebas | Out-Null
npm install --prefix $carpetaPruebas --no-save --package-lock=false @electric-sql/pglite jsdom
node pruebas/roles.mjs $carpetaPruebas
node --experimental-vm-modules --disable-warning=ExperimentalWarning pruebas/interfaz.mjs $carpetaPruebas
```

Las pruebas SQL cubren altas, elevación de privilegios, aislamiento por empresa y trabajador, pertenencia múltiple, invitaciones, perfiles, equipo, mensajes y ejecución de tareas con GPS. También comprueban que la migración conserva relaciones previas y revierte por completo ante cuentas ambiguas.

Las pruebas del frontend ejecutan los módulos de acceso con DOM y Auth simulados: verifican la matriz de roles, registro, navegación, cierre de sesión y entrada directa a cada página. No sustituyen una prueba visual en navegador ni la validación remota del servicio Auth, sus correos y su configuración.

`pruebas/roles_remotos.sql` permite comprobar los triggers, las RPC y RLS en la base real, como operador `postgres`. Crea filas de prueba dentro de una transacción y ejecuta `ROLLBACK` al finalizar; no deja usuarios ni datos operativos persistentes. Las secuencias de identificadores pueden avanzar, algo normal en PostgreSQL incluso tras un rollback. No envía correos ni prueba el servicio HTTP de Auth.

## Resultado de la validación aplicada

- 56 comprobaciones SQL locales y 206 comprobaciones del frontend correctas.
- Prueba SQL transaccional correcta en Supabase: separación de roles, aislamiento de empresas y trabajadores, invitaciones, ejecución de asignaciones con GPS y mensajes. Se revirtieron todos sus datos de prueba.
- Prueba HTTP real correcta de Supabase Auth y REST para los tres roles: registro de Empresa y Trabajador, cuenta administrativa temporal habilitada solo mediante el procedimiento SQL, inicio y cierre de sesión, consulta del perfil, rechazo de cambios directos de rol y creación de empresas permitida únicamente al rol Empresa.
- Se eliminaron las tres cuentas temporales de Auth, sus perfiles y la empresa creada por la prueba HTTP. Al finalizar, Auth y las siete tablas operativas volvieron a tener cero registros.
- RLS continúa habilitado en las siete tablas. El asesor de seguridad de Supabase no reportó alertas.
- El asesor de rendimiento señaló un aviso informativo previo: falta un índice que cubra `mensajes.remitente_id`. La migración de roles no cambia esa tabla ni sus índices. [Referencia del aviso](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).
- No se publicó el frontend ni se creó una cuenta administrativa permanente. No se realizó una revisión visual en navegador durante esta validación.

`pruebas/auth-remoto.mjs` conserva el procedimiento de prueba HTTP para futuras verificaciones asistidas. No forma parte de la batería local: crea cuentas temporales reales, imprime sus UUID y espera que un operador habilite la cuenta administrativa temporal antes de recibir `validar` por entrada estándar. Solo funciona cuando el servicio confirma automáticamente el correo, para no enviar mensajes. No guarda ni imprime contraseñas o tokens. Tras ejecutarlo, el operador debe eliminar exclusivamente la empresa y las cuentas cuyos identificadores imprime el script; la limpieza no es automática.
