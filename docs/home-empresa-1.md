# Home Empresa 1

`home_empresa_1.html` es la primera página de una cuenta Empresa después del
Login, Sign Up con sesión o recuperación de sesión en esas interfaces.
Los destinos de Trabajador y Administrador no cambiaron. El acceso superpuesto
del Index también admite el nuevo destino empresarial.

La página muestra únicamente el banner de bienvenida y las dos cards solicitadas:

| Acción | Imagen proporcionada | Destino |
| --- | --- | --- |
| Seleccionar empresa | `Carpeta_Imagenes/home_empresa_1/seleccionar_empresa.avif` | `paginas/seleccionar_empresa.html` |
| Crear empresa | `Carpeta_Imagenes/home_empresa_1/crear_empresa.avif` | Formulario superpuesto en Home Empresa 1 |

## Reutilización visual

`scripts/generar-home-empresa.mjs` extrae el header y footer del Index existente.
El header conserva logo, estructura, clases y menú móvil. Se adapta su navegación
a Inicio, Seleccionar empresa, Crear empresa, Mi perfil y Contacto; el botón de
acceso se convierte en Cuenta, con Mi perfil y Cerrar sesión. El footer conserva íntegramente el contenido
actual del Index y apunta a las secciones públicas desde la nueva ruta.
No se agregaron redes sociales sin enlaces oficiales.

Las cards usan las mismas clases de imágenes, enlaces extendidos, transiciones y
`efecto-card` del Index. Se cargan sus estilos existentes; `home-empresa.css`
solo añade el banner propio, la distribución de dos columnas y las adaptaciones
de la nueva página. El Index y los recursos originales no se rediseñaron.

Para regenerar Home, la selección y la compatibilidad con enlaces antiguos:

```powershell
node scripts/generar-home-empresa.mjs
```

## Acceso y sesiones

El contenedor completo (header, contenido y footer) empieza oculto. El cargador
`home-empresa-carga.js` muestra una espera real mientras importa el módulo y
verifica la sesión; también informa de errores de carga del CDN o dependencias.

`home-empresa.js` reutiliza `consultarAcceso()` y
`puedeAbrirModulo(rol, 'empresas')` de `acceso.js`. Solo una cuenta Empresa con
perfil válido puede ver la interfaz. Sin sesión se redirige a Login; las demás
cuentas y los errores de verificación no descubren el contenido ni ejecutan
operaciones sobre empresas. El cambio de usuario y el cierre de sesión retiran
la vista y limpian la empresa activa de la pestaña. El cierre usa `signOut()`
existente e informa si falla, permitiendo reintentar.

## Selección y creación existentes

La selección reutiliza el shell y el guard de Home Empresa 1, con header,
banner propio y footer. Las empresas se presentan con columnas amplias, ampliación,
bordes degradados y botón inferior del recurso `recursos/tabla`. El mismo efecto
se aplica al navegar con teclado. Solo se muestran nombre, ID y fecha reales.
Se contemplan carga, lista vacía y error de consulta.

Crear Empresa abre un `dialog` nativo en Home mediante `empresa-modal.js`, sin
cambiar URL, recargar ni crear otra interfaz. Reutiliza `autenticacion.css` y el
campo existente. El fondo queda visible con desenfoque; la ventana gestiona el
foco, entrada/salida y movimiento reducido. No se cierra al pulsar fuera.
Cerrar, Cancelar y Escape solicitan confirmación si hay datos sin guardar.
Durante una operación se desactiva el cierre y se impiden envíos duplicados.
El loader acompaña las consultas y el registro reales, incluidos sus errores.
Los enlaces antiguos a `paginas/crear_empresa.html` regresan a Home; ese archivo
ya no contiene un formulario independiente.

Ambas vistas reutilizan `empresas.js`: la inicialización se exporta para usarla
en el diálogo después de comprobar el rol, sin duplicar consultas ni la RPC.
Home no carga empresas hasta que se abre el formulario. Un fallo inicial permite
cerrar y volver a abrir para reintentar. Los errores de registro conservan el
nombre y mantienen abierta la ventana. El éxito conserva la selección automática
y muestra únicamente el mensaje de éxito, sin añadir un bloque de espacio de
trabajo ni una nueva redirección al crear.

La selección mantiene el modelo actual: las cuentas empresariales administran
empresas de las que son propietarias. Las membresías de trabajadores no se
convierten en permisos empresariales. Se reutilizan el filtro por propietario,
las comprobaciones de selección y la validación de la empresa guardada.
Una cuenta sin empresas ve el mensaje existente y un enlace para crear una.

La creación utiliza la RPC `crear_empresa`, con el nombre y las validaciones
existentes; después vuelve a consultar las empresas permitidas y selecciona la
nueva. Pulsar Seleccionar Empresa continúa a `home_empresa_2.html`, que verifica
el acceso a la empresa guardada. La recuperación de la selección previa no
navega automáticamente. Véase `docs/home-empresa-2.md`.

No se modificaron Supabase Auth, tablas, roles, relaciones ni RLS. No se tocaron
las interfaces de trabajadores ni el HTML del módulo combinado original.

## Pruebas

`pruebas/home-empresa.mjs` verifica el guard, errores de carga/perfil, estado
inicial oculto, sesiones, cierre y cambio de usuario, dos cards, recursos, footer
compartido y menú. Ejecuta además los módulos reales de selección y creación con
transporte simulado: acceso directo, lista vacía, varias empresas, filtro de
propietario, descarte de empresa ajena y creación mediante la RPC existente.

```powershell
node --experimental-vm-modules --disable-warning=ExperimentalWarning pruebas/home-empresa.mjs <directorio-con-jsdom>
```

Las pruebas no consultan ni modifican la base real. La revisión visual de
escritorio y móvil requiere un navegador conectado.
