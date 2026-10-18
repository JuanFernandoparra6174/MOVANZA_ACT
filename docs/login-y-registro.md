# Login y Sign Up independientes

`login.html` y `signup.html` son páginas estáticas independientes, accesibles
directamente y al recargarlas. Ambas enlazan a la otra interfaz y al Index.

Desde el Index, `scripts/auth-modal.js` presenta esas mismas páginas en un
diálogo con fondo difuminado. Mantiene el Index y su posición de desplazamiento,
permite cerrar y restaura el foco. Los enlaces siguen siendo rutas reales y
se pueden abrir en otra pestaña. El formulario conserva el contexto al cambiar
entre acceso y registro. Al completar la sesión, el panel abre en la ventana
principal, no dentro del marco. Los mensajes se comprueban por origen, ventana
emisora y lista de destinos permitidos.

Al entrar directamente en una de las rutas, una vista decorativa e inerte del
Index hace de fondo; sus scripts están bloqueados mediante sandbox. No inicia
otra sesión ni recibe interacción. Los inputs tienen fondo neutro, borde
violeta, ejemplos y resaltado de foco para distinguir la zona de escritura.

Se revisaron los tres originales de `recursos/login_singup`: Pug, SCSS y jQuery.
La adaptación en `estilos/autenticacion.css` y `scripts/auth-interfaz.js`
conserva la cabecera blanca, la pila de campos plegados, el desplazamiento
vertical de iconos y las transiciones de 0,2 segundos. Usa la identidad visual
oficial y respeta movimiento reducido. No requiere compilador, jQuery,
Font Awesome ni dependencias nuevas. Los originales no se modificaron.

Login tiene dos pasos: correo y contraseña. Sign Up tiene cuatro: tipo de
cuenta, correo, contraseña y confirmación. El paso adicional conserva el rol
requerido por MOVANZA. Se puede retroceder sin perder valores, avanzar con Enter,
y mostrar u ocultar las contraseñas. Los pasos inactivos son inertes para el
teclado. El loader reutilizable responde a esperas reales y se retira tras errores.

## Autenticación y permisos

`scripts/autenticacion.js` continúa como único módulo de acceso, registro y
perfil. Se adaptaron sus referencias al DOM para que cada página tenga su
formulario. Se conservan `signInWithPassword`, `signUp`, `getSession`,
`consultarAcceso`, los campos enviados, la validación del rol desde `perfiles`,
la limpieza de `movanza_empresa_activa` y los eventos de sesión.

El registro ofrece Empresa y Trabajador, mantiene contraseñas de al menos ocho
caracteres y confirmación coincidente. Si devuelve una sesión, continúa al
módulo correspondiente. Si no devuelve sesión, abre
`login.html?registro=confirmar` con el mensaje del procedimiento anterior, sin
asumir si una cuenta ya existe o si se exige confirmación por correo.

Se bloquean envíos simultáneos y se permite reintentar tras errores.
No se agregó recuperación de contraseña: actualmente no existe en el proyecto.
No se modificaron configuración de Supabase, tablas, triggers, relaciones ni RLS.

## Destinos y alcance

Después de autenticar y consultar el rol, o al abrir estas páginas con sesión:

| Rol de la base | Página existente |
| --- | --- |
| Empresa | `home_empresa_1.html` |
| Trabajador | `paginas/mis_asignaciones.html` |
| Administrador | `paginas/administracion.html` |

Home Empresa 1 verifica el acceso empresarial y dirige a la selección o creación
existentes; véase `docs/home-empresa-1.md`. Los paneles conservan sus controles.
Antes se
mostraba el perfil por rol en el Index; ahora las páginas de acceso llevan a los
módulos existentes.

El perfil permanece en su ubicación actual del Index, fuera del alcance de esta
separación. Se retiraron de su diálogo los formularios de Login y Sign Up;
sin sesión solo ofrece enlaces a las páginas independientes. Los enlaces del
encabezado, la primera card y Contacto apuntan a las nuevas rutas. El resto del
Index conserva su estructura.

## Verificación

`pruebas/interfaz.mjs` ejecuta ambas interfaces con el mismo módulo Auth y un
transporte Supabase simulado: pasos, validación, contraseña visible, confirmación,
errores, duplicados, loader, confirmación de correo y destinos de los tres roles.
Conserva además las pruebas de permisos y entrada directa a los módulos privados.
Las otras dos baterías comprueban navegación pública, contenido y documentos.

```powershell
node --experimental-vm-modules --disable-warning=ExperimentalWarning pruebas/interfaz.mjs <directorio-con-jsdom>
node --experimental-vm-modules --disable-warning=ExperimentalWarning pruebas/index-publico.mjs <directorio-con-jsdom>
node --experimental-vm-modules --disable-warning=ExperimentalWarning pruebas/contenido-publico.mjs <directorio-con-jsdom>
```

No se crearon cuentas reales ni se modificó la base de datos durante las pruebas.
La revisión visual de las animaciones requiere un navegador conectado.
