# Home Empresa 2

Ruta: `home_empresa_2.html`.

Flujo: Login → Home Empresa 1 → Seleccionar Empresa → Home Empresa 2.
El botón de selección guarda el contexto con la función existente y después
navega a Home Empresa 2. Recuperar una selección guardada o crear una empresa
no provoca esa navegación automáticamente.

## Componentes y presentación

- `scripts/encabezado-empresarial.js`: fuente única del encabezado, con Inicio,
  Equipo, Trabajos, Estadísticas, Cambiar empresa y Cuenta. Cuenta permite abrir
  el perfil existente y cerrar sesión. Incluye menú móvil y cierre con Escape.
- `estilos/encabezado-empresarial.css`: estilos del componente compartido.
- `scripts/generar-home-empresa-2.mjs`: genera la página usando ese componente
  y extrae el footer completo del Index, adaptando sus enlaces.
- `estilos/home-empresa-2.css`: bienvenida y distribución de las tres cards.
  La bienvenida ocupa una superficie redondeada con degradado violeta y texto
  blanco. El encabezado no incluye la etiqueta «ESPACIO EMPRESARIAL».
  Las cards reutilizan las clases, imágenes de fondo, enlaces extendidos y
  `efecto-card` del Index. Se emplean los tres AVIF proporcionados en
  `Carpeta_Imagenes/home_empresa_2`. El fondo carga el recurso original.

El menú Cuenta utiliza `scripts/cuenta-interfaz.js` y `estilos/cuenta.css`,
compartidos con Home Empresa 1, selección, el Index autenticado y los módulos
privados de los tres perfiles. Su botón tiene fondo violeta y conserva el efecto
de relleno interior del recurso de botones. El menú permite abrir Mi perfil y
cerrar sesión; se cierra con Escape o al pulsar fuera. En el Index, Iniciar sesión
se sustituye únicamente después de verificar el perfil y reaparece al salir.
Los módulos privados incorporan el componente después de comprobar su permiso.

Para reutilizar el encabezado en los siguientes módulos, importar
`encabezadoEmpresarial({ raiz: '../', actual: 'equipo' })` en su generador y
`prepararEncabezadoEmpresarial(elemento, { cerrarSesion })` en su interfaz.
`actual` admite los identificadores `inicio`, `equipo`, `trabajos`,
`estadisticas` y `cambiar`. No se rediseñan esos módulos en esta etapa.

Regeneración:

```powershell
node scripts/generar-home-empresa-2.mjs
```

## Contexto y acceso

`home-empresa-2-carga.js` muestra el loader durante la carga real y retira el
contenido si falla la verificación. `home-empresa-2.js` reutiliza
`consultarAcceso()` y el permiso del módulo Empresas. Antes de mostrar el
contenido consulta únicamente la empresa identificada por
`sessionStorage.movanza_empresa_activa`, filtrando también `propietario_id`
con el ID del perfil autenticado, como hacen Equipo y Trabajos.

Sin sesión vuelve a Login. Sin selección, con un identificador inválido, una
empresa inexistente o ajena, vuelve a Seleccionar Empresa y descarta ese
contexto. Los fallos de red dejan el contenido oculto, muestran un error y
conservan el identificador para reintentar. No se elige otra empresa por defecto.
Al recargar se repiten las comprobaciones. Las respuestas pendientes no revelan
contenido después de cerrar o cambiar la sesión ni tras cambiar la selección.
El regreso desde la caché de navegación exige una nueva verificación.

Equipo y Trabajos conservan su mecanismo de contexto existente. Estadísticas
ya existe: sus enlaces reciben `?empresa=<id>` y su selector utiliza ese valor
solo si pertenece a las opciones autorizadas. Después conserva el comportamiento
previo de filtros y actualización. No se cambian sus consultas ni cálculos.

No se modifican Supabase Auth, roles, tablas, RLS ni operaciones de registro.
El modelo existente permite administrar empresas propias; no se amplían permisos
a otras asociaciones. No hay estadísticas, métricas ni nombres inventados.

## Verificación

`pruebas/home-empresa-2.mjs` usa los módulos reales con transporte Supabase
simulado para verificar acceso, contexto, errores, respuestas pendientes,
cambio/cierre de sesión, menú, footer, recursos y preselección de Estadísticas.
`pruebas/home-empresa.mjs` comprueba además la navegación desde selección y que
el formulario de creación conserva su comportamiento.

```powershell
node --experimental-vm-modules --disable-warning=ExperimentalWarning pruebas/home-empresa-2.mjs <directorio-con-jsdom>
```

Las pruebas no acceden a la base de datos real. La adopción de este encabezado
en los módulos internos queda para las etapas posteriores solicitadas.
