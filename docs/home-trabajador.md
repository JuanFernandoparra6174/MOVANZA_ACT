# Home Trabajador

`/home_trabajador.html` es el punto de entrada de las cuentas con rol `trabajador`. El destino se incorpora al mapa existente de `autenticacion.js` y a la lista de destinos permitidos del login superpuesto (`auth-modal.js`). Empresa y Administrador conservan sus destinos. El registro con sesión y la recuperación de una sesión en Login/Sign Up utilizan el mismo mapa.

La página incluye un banner compacto, exactamente dos cards y el footer del Index. Las cards enlazan a `paginas/mis_asignaciones.html` y `paginas/mis_invitaciones.html`; no cargan datos ni código de esos módulos hasta navegar a ellos. No se modifican sus operaciones, estados o permisos.

## Componentes y recursos

- `scripts/encabezado-trabajador.js`: genera el encabezado y prepara su menú móvil y Cuenta. Acepta `raiz` y `actual` para reutilizarlo posteriormente en otros módulos. Perfil aparece una sola vez dentro de Cuenta y utiliza el modal existente; no cambia de ruta ni recarga Home.
- `scripts/home-trabajador.js`: consulta `consultarAcceso()` y comprueba el acceso existente a `mis_asignaciones`. Retiene el contenido oculto hasta verificar la cuenta, deniega los otros roles y retira la vista ante cierre o cambio de sesión. La salida usa la operación actual `supabase.auth.signOut()` y vuelve al login.
- `scripts/home-trabajador-carga.js`: loader compartido y estado de error si falla la dependencia remota o la verificación.
- `estilos/home-trabajador.css`: banner, distribución de dos columnas/una columna en móvil y estilos del encabezado. Reutiliza `index.css`, `componentes-publicos.css` y `cuenta.css` sin modificar la presentación empresarial.
- Imágenes originales: `Carpeta_Imagenes/home_trabajador/asignaciones.avif` (lista de tareas) e `invitaciones.avif` (sobre y tarjeta). Se mantienen los archivos y su calidad; `object-fit: cover` evita deformaciones.
- Cards: estructura compartida del Index, borde giratorio de tres segundos adaptado del recurso `recursos/efecto_card`, imagen con zoom, superficie oscura para legibilidad, enlace de toda la card, foco visible y respuesta táctil.
- Fondo: recurso original `recursos/efecto_fondo/fondo.css`. Footer: mismo contenido y estilos del Index, con sus enlaces de fragmento dirigidos al Index.

Para regenerar únicamente esta página con el encabezado y el footer actuales:

```powershell
node scripts/generar-home-trabajador.mjs
```

No hay cambios en tablas, RLS, Auth, roles, consultas de asignaciones/invitaciones ni dependencias.

## Validación

```powershell
node --experimental-vm-modules --disable-warning=ExperimentalWarning pruebas/home-trabajador.mjs <directorio-con-jsdom>
```

64 comprobaciones con Supabase simulado: permisos por rol, sesión ausente o vencida, fallos de carga/consulta, respuestas pendientes de otra sesión, enlaces y recursos locales, footer compartido, navegación móvil, Perfil sobre Home conservando ruta/foco/contexto, cierre de sesión, errores y envíos duplicados. No se escribe en Supabase.

También pasan las suites `interfaz`, `index-publico`, `home-empresa`, `home-empresa-2` y `perfil`, incluyendo los destinos tras login/registro y la comunicación del acceso superpuesto con el Index.

Se inspeccionaron las dos imágenes proporcionadas. Las pruebas con jsdom no verifican renderizado, medidas en dispositivos ni animaciones; queda pendiente la revisión visual de la página en navegador con sesión de trabajador.

## Mensajería

Home monta el componente compartido `montarMensajeria()` después de validar el acceso. Las conversaciones solo se consultan al abrir el botón flotante. El trabajador utiliza sus asignaciones legibles bajo RLS, sin depender de una empresa activa. El panel se destruye al salir o cambiar de cuenta. Se incluyen la hoja compartida `mensajeria.css` y espacio inferior en el footer para el botón; las cards y el encabezado se conservan. Ver `docs/mensajeria.md` y las 88 comprobaciones de `pruebas/mensajeria.mjs` para el alcance y los permisos.
