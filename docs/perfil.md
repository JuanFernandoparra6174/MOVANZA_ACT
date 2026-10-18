# Perfil personal superpuesto

Los controles «Mi perfil» abren una única instancia de `scripts/perfil-modal.js`, conectada desde `scripts/cuenta-interfaz.js`. Se usa un `dialog.showModal()` nativo, sin iframe, cambios de URL ni sustitución del contenido de los módulos. No se escribe en el contexto de empresa ni se recargan módulos al abrir, guardar o cerrar.

La consulta sigue siendo `consultarAcceso()`: obtiene el usuario de Auth y consulta su perfil por `usuario_auth_id`. Los únicos datos presentados son nombre completo, nombre de usuario, correo y rol. Los dos primeros conservan sus validaciones y la RPC `actualizar_mi_perfil`, ahora encapsulada en `scripts/perfil-datos.js` con los mismos parámetros y normalización. No se cambia la base de datos, Auth, permisos ni RLS.

La edición empieza al pulsar «Editar perfil». Durante el guardado se bloquean campos, envíos repetidos y cierre; solo se confirma el éxito después de la RPC y la consulta actualizada. Los errores conservan el formulario. Cancelar restaura los valores consultados. Cerrar o cancelar con cambios pide confirmar su descarte. También se avisa antes de abandonar la página con cambios pendientes.

El diálogo hace inerte el fondo, mantiene el ciclo de Tab y permite Escape. Al cerrar devuelve el foco al control de apertura. El botón de salida delega en el botón de cierre de sesión existente de cada interfaz. Un cambio o cierre de sesión limpia los datos y descarta respuestas pendientes.

`estilos/perfil-modal.css` centraliza la presentación: violeta oficial, superficies neutras, avatar de iniciales, vista de lectura y formulario, fondo difuminado, transiciones breves, movimiento reducido y distribución de una columna en móvil. Se consultaron la guía visual, recursos de inputs y botones, y las interfaces de acceso y Crear Empresa. No se añadieron dependencias.

El Index conserva su presentación pública y recuperación de sesión, pero ya no contiene el formulario ni los enlaces antiguos dentro de Perfil, ni abre automáticamente el diálogo de cuenta al recuperar una sesión. Las rutas de los demás módulos se conservan.

## Verificación

```powershell
node --experimental-vm-modules --disable-warning=ExperimentalWarning pruebas/perfil.mjs <directorio-con-jsdom>
```

Pruebas con Supabase simulado y controles reales de Home Empresa 1 y 2, selección de empresa, Equipo, Trabajos, Estadísticas y Mis asignaciones. Comprueban identidad autenticada, validaciones, RPC, carga, duplicados, errores, descarte, foco, reutilización, cierre de sesión y conservación de URL, empresa y nodos/filtros del módulo. No escriben en Supabase.

También se ejecutan las suites existentes de Home Empresa, Index y autenticación. jsdom no verifica renderizado, difuminado ni dimensiones reales de dispositivos; queda pendiente esa comprobación visual en un navegador con sesión.
