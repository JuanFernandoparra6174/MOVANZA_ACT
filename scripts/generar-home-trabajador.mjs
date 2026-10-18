import { readFile, writeFile } from 'node:fs/promises';
import { encabezadoTrabajador } from './encabezado-trabajador.js';

const raiz = new URL('../', import.meta.url);
const index = await readFile(new URL('index.html', raiz), 'utf8');
const originalFooter = index.match(/<footer class="pie-publico">[\s\S]*?<\/footer>/)?.[0];
if (!originalFooter) throw new Error('No se encontró el footer compartido del Index.');
const footer = originalFooter.replace(/href="#([^"]+)"/g, 'href="./index.html#$1"');
const cards = [
    ['asignaciones', 'Mis asignaciones', 'Consulta los trabajos que tienes asignados, revisa sus detalles y mantén el control de tus actividades.'],
    ['invitaciones', 'Mis invitaciones', 'Revisa las invitaciones que recibes de las empresas y gestiona tu participación en sus equipos de trabajo.']
];
const html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex">
    <title>Mi espacio de trabajo | MOVANZA</title>
    <link rel="stylesheet" href="./estilos/general.css">
    <link rel="stylesheet" href="./estilos/alertas.css" data-estilo-alertas>
    <script type="module" src="./scripts/alertas.js"></script>
    <link rel="stylesheet" href="./estilos/index.css">
    <link rel="stylesheet" href="./recursos/efecto_fondo/fondo.css">
    <link rel="stylesheet" href="./estilos/componentes-publicos.css">
    <link rel="stylesheet" href="./estilos/cuenta.css">
    <link rel="stylesheet" href="./estilos/home-trabajador.css">
    <link rel="stylesheet" href="./estilos/mensajeria.css">
    <script src="./scripts/componentes-publicos.js" defer></script>
    <script src="./scripts/home-trabajador-carga.js" defer></script>
</head>
<body class="pagina-publica home-trabajador">
    <div class="container fondo-exterior" aria-hidden="true" inert><div id="stars"></div><div id="stars2"></div><div id="stars3"></div><div></div></div>
    <section id="estado-acceso" class="estado-acceso"><p id="mensaje-home" role="status" aria-live="polite">Comprobando tu cuenta…</p><a href="./login.html">Iniciar sesión</a> · <a href="./index.html">Volver al inicio</a></section>
    <div class="sitio-publico" id="contenido-trabajador" hidden>
        <a class="saltar-contenido" href="#contenido">Saltar al contenido</a>
        ${encabezadoTrabajador()}
        <main id="contenido" class="home-trabajador-principal">
            <section class="bienvenida-trabajador" aria-labelledby="titulo-bienvenida">
                <div><p class="antetitulo">TU ESPACIO EN MOVANZA</p><h1 id="titulo-bienvenida">Bienvenido a tu espacio de trabajo</h1><p>Consulta tus asignaciones, revisa las invitaciones que recibes y mantente al día con tus actividades desde MOVANZA.</p></div>
                <div class="simbolo-trabajador" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="14" y="13" width="36" height="43" rx="5"/><rect x="23" y="7" width="18" height="12" rx="4"/><path d="m23 32 4 4 12-12M23 44h18"/></svg></div>
            </section>
            <section class="acciones-trabajador" aria-label="Tus actividades"><div class="mosaico mosaico-trabajador">
${cards.map(([id, titulo, descripcion], i) => `                <article class="card-principal efecto-card">
                    <span class="efecto-card-borde" aria-hidden="true"></span>
                    <span class="card-imagen" aria-hidden="true"><img src="./Carpeta_Imagenes/home_trabajador/${id}.avif" alt=""></span>
                    <div class="card-contenido"><p class="card-categoria"><span>0${i + 1}</span> MI ESPACIO DE TRABAJO</p><h2>${titulo}</h2><p>${descripcion}</p><a class="card-accion" href="./paginas/mis_${id}.html">Abrir ${id}<span aria-hidden="true">↗</span></a></div>
                </article>`).join('\n')}
            </div></section>
        </main>
        ${footer}
    </div>
    <noscript><p class="aviso-noscript">Activa JavaScript para verificar tu sesión y acceder a tu espacio de trabajo.</p></noscript>
</body>
</html>
`;
await writeFile(new URL('home_trabajador.html', raiz), html);
console.log('Home Trabajador generado con el encabezado reutilizable y el footer compartido.');
