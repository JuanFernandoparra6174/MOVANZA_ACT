// Reutiliza el header/footer del Index y el módulo existente de empresas.
import { readFile, writeFile } from 'node:fs/promises';
import { cuentaInterfaz } from './cuenta-interfaz.js';
const raiz = new URL('../', import.meta.url);
const index = await readFile(new URL('index.html', raiz), 'utf8');
const originalHeader = index.match(/<header class="cabecera-publica"[\s\S]*?<\/header>/)?.[0];
const originalFooter = index.match(/<footer class="pie-publico">[\s\S]*?<\/footer>/)?.[0];
if (!originalHeader || !originalFooter) throw new Error('No se encontró el header o footer del Index.');
const nav = `<nav id="navegacion-principal" aria-label="Navegación principal">
            <a href="./home_empresa_1.html" aria-current="page">Inicio</a>
            <a href="./paginas/seleccionar_empresa.html">Seleccionar empresa</a>
            <button type="button" data-crear-empresa>Crear empresa</button>
            <button type="button" data-abrir-perfil aria-haspopup="dialog">Mi perfil</button>
            <a href="./index.html#contacto">Contacto</a>
        </nav>`;
const header = originalHeader
    .replace('href="#inicio"', 'href="./home_empresa_1.html"')
    .replace('MOVANZA, inicio', 'MOVANZA, espacio empresarial')
    .replace(/<nav id="navegacion-principal"[\s\S]*?<\/nav>/, nav)
    .replace(/<a class="boton boton-acceso"[\s\S]*?<\/a>/, cuentaInterfaz());
const footer = originalFooter.replace(/href="#([^"]+)"/g, 'href="./index.html#$1"');
const cards = [
    ['seleccionar', 'Seleccionar empresa', 'Accede a una empresa existente para consultar y administrar sus trabajadores, actividades y operaciones.'],
    ['crear', 'Crear empresa', 'Registra una nueva empresa en MOVANZA y comienza a organizar tus trabajadores y actividades desde un solo lugar.']
];
const home = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex">
    <title>Mi espacio empresarial | MOVANZA</title>
    <link rel="stylesheet" href="./estilos/general.css">
    <link rel="stylesheet" href="./estilos/alertas.css" data-estilo-alertas>
    <script type="module" src="./scripts/alertas.js"></script>
    <link rel="stylesheet" href="./estilos/index.css">
    <link rel="stylesheet" href="./recursos/efecto_fondo/fondo.css">
    <link rel="stylesheet" href="./estilos/componentes-publicos.css">
    <link rel="stylesheet" href="./estilos/home-empresa.css">
    <link rel="stylesheet" href="./estilos/autenticacion.css">
    <link rel="stylesheet" href="./estilos/cuenta.css">
    <script src="./scripts/componentes-publicos.js" defer></script>
    <script src="./scripts/home-empresa-carga.js" defer></script>
</head>
<body class="pagina-publica home-empresa">
    <div class="container fondo-exterior" aria-hidden="true" inert><div id="stars"></div><div id="stars2"></div><div id="stars3"></div><div></div></div>
    <section id="estado-acceso" class="estado-acceso"><p id="mensaje-home" role="status" aria-live="polite">Comprobando tu cuenta…</p><a href="./index.html">Volver al inicio</a></section>
    <div class="sitio-publico" id="contenido-empresa" hidden>
        <a class="saltar-contenido" href="#contenido">Saltar al contenido</a>
        ${header}
        <main id="contenido" class="home-empresa-principal">
            <section class="bienvenida-empresa" aria-labelledby="titulo-bienvenida">
                <div><p class="antetitulo">TU ESPACIO EN MOVANZA</p><h1 id="titulo-bienvenida">Bienvenido a tu espacio empresarial</h1><p>Selecciona una empresa existente o registra una nueva para comenzar a gestionar tus equipos, actividades y operaciones desde MOVANZA.</p></div>
                <div class="simbolo-empresa" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2"><rect x="18" y="8" width="28" height="46" rx="3"/><path d="M10 54h44M26 18h4m4 0h4m-12 8h4m4 0h4m-12 8h4m4 0h4M28 54V44h8v10"/></svg></div>
            </section>
            <section class="acciones-empresa" aria-label="Acciones de empresa"><div class="mosaico mosaico-empresa">
${cards.map(([accion, titulo, descripcion], i) => `                <article class="card-principal efecto-card">
                    <span class="efecto-card-borde" aria-hidden="true"></span>
                    <span class="card-imagen" aria-hidden="true"><img src="./Carpeta_Imagenes/home_empresa_1/${accion}_empresa.avif" width="900" height="600" alt=""></span>
                    <div class="card-contenido"><p class="card-categoria"><span>0${i + 1}</span> MI ESPACIO EMPRESARIAL</p><h2>${titulo}</h2><p>${descripcion}</p>${accion === 'crear' ? '<button type="button" class="card-accion" data-crear-empresa>' : '<a class="card-accion" href="./paginas/seleccionar_empresa.html">'}${titulo}<span aria-hidden="true">↗</span>${accion === 'crear' ? '</button>' : '</a>'}</div>
                </article>`).join('\n')}
            </div></section>
        </main>
        ${footer}
    </div>
    <dialog id="crear-empresa-modal" class="empresa-modal pagina-autenticacion auth-en-modal" aria-labelledby="titulo-crear-empresa">
        <button type="button" class="cerrar-empresa" data-cerrar-empresa aria-label="Cerrar formulario">×</button>
        <div class="registration-form">
            <header><p class="auth-antetitulo">TU ESPACIO EN MOVANZA</p><h1 id="titulo-crear-empresa">Crear empresa</h1><p>Registra una empresa para organizar sus trabajadores, trabajos y asignaciones.</p></header>
            <form id="formulario-empresa">
                <div class="pila-campos"><div class="input-section">
                    <div class="campo-paso"><label for="nombre-empresa">Nombre de la empresa</label><div class="campo-con-control"><input type="text" id="nombre-empresa" placeholder="Nombre de tu empresa" minlength="2" maxlength="120" required aria-describedby="ayuda-empresa"></div></div>
                    <button type="submit" id="boton-crear" class="animated-button" aria-label="Crear empresa" disabled><span aria-hidden="true">＋</span><span aria-hidden="true">→</span></button>
                </div></div>
                <p id="ayuda-empresa">Puedes crear y administrar varias empresas desde una misma cuenta de MOVANZA. Cada empresa tendrá sus propios trabajadores, trabajos y asignaciones.</p>
            </form>
            <div class="auth-estado"><p id="mensaje" role="status" aria-live="polite"></p></div>
            <button type="button" class="cancelar-empresa" data-cerrar-empresa>Cancelar</button>
        </div>
        <div id="lista-empresas" hidden></div>
    </dialog>
    <noscript><p class="aviso-noscript">Activa JavaScript para verificar tu sesión y acceder a tu espacio empresarial.</p></noscript>
</body>
</html>
`;
await writeFile(new URL('home_empresa_1.html', raiz), home);

// Mismo shell y permisos del perfil empresarial; solo cambia el contenido principal.
const seleccion = home
    .replace('Mi espacio empresarial | MOVANZA', 'Seleccionar empresa | MOVANZA')
    .replace('class="pagina-publica home-empresa"', 'class="pagina-publica home-empresa pagina-seleccion" data-raiz="../"')
    .replace('href="./home_empresa_1.html" aria-current="page"', 'href="./home_empresa_1.html"')
    .replace('href="./paginas/seleccionar_empresa.html"', 'href="./paginas/seleccionar_empresa.html" aria-current="page"')
    .replace('<button type="button" data-crear-empresa>Crear empresa</button>', '<a href="./home_empresa_1.html">Crear empresa</a>')
    .replace(/<main id="contenido"[\s\S]*?<\/main>/, `<main id="contenido" class="home-empresa-principal seleccion-principal">
            <section class="bienvenida-empresa banner-seleccion" aria-labelledby="titulo-seleccion">
                <div><p class="antetitulo">TU ESPACIO EMPRESARIAL</p><h1 id="titulo-seleccion">Seleccionar empresa</h1><p>Elige la empresa con la que quieres trabajar en MOVANZA.</p><a class="volver-empresa" href="./home_empresa_1.html">← Volver a mi espacio empresarial</a></div>
                <div class="simbolo-empresa" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2"><rect x="18" y="8" width="28" height="46" rx="3"/><path d="M10 54h44M26 18h4m4 0h4m-12 8h4m4 0h4m-12 8h4m4 0h4M28 54V44h8v10"/></svg></div>
            </section>
            <section class="empresas-disponibles" aria-labelledby="titulo-mis-empresas">
                <div class="cabecera-empresas"><div><p class="antetitulo">TUS EMPRESAS EN MOVANZA</p><h2 id="titulo-mis-empresas">Mis empresas</h2><p>Selecciona una empresa para continuar.</p></div><a class="boton-relleno" href="./home_empresa_1.html">Volver a mi espacio <span aria-hidden="true">↗</span></a></div>
                <div id="lista-empresas" class="tabla-empresas" aria-busy="true"><p role="status">Cargando empresas…</p></div>
                <p id="mensaje" role="status" aria-live="polite"></p>
            </section>
        </main>`)
    .replace(/    <dialog id="crear-empresa-modal"[\s\S]*?<\/dialog>\n/, '')
    .replace('</head>', '<link rel="stylesheet" href="./estilos/botones.css">\n<link rel="stylesheet" href="./estilos/seleccionar-empresa.css">\n</head>')
    .replaceAll(/(href|src)="\.\//g, '$1="../')
    .replace('href="../paginas/seleccionar_empresa.html"', 'href="./seleccionar_empresa.html"');
await writeFile(new URL('paginas/seleccionar_empresa.html', raiz), seleccion);
await writeFile(new URL('paginas/crear_empresa.html', raiz), '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta http-equiv="refresh" content="0;url=../home_empresa_1.html"><title>Crear empresa | MOVANZA</title></head><body><a href="../home_empresa_1.html">Volver a mi espacio empresarial para crear una empresa</a></body></html>');
console.log('Home Empresa 1 y selección de empresas actualizados.');
