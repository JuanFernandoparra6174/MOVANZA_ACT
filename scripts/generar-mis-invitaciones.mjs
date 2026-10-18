import { readFile, writeFile } from 'node:fs/promises';
import { encabezadoTrabajador } from './encabezado-trabajador.js';
const raiz = new URL('../', import.meta.url);
const index = await readFile(new URL('index.html', raiz), 'utf8');
const pie = index.match(/<footer class="pie-publico">[\s\S]*?<\/footer>/)?.[0];
if (!pie) throw new Error('No se encontró el footer del Index.');
const footer = pie.replace(/href="#([^"]+)"/g, 'href="../index.html#$1"').replaceAll('href="./politicas/', 'href="../politicas/');
const filtros = [['todas', 'Todas'], ['pendiente', 'Pendientes'], ['aceptada', 'Aceptadas'], ['rechazada', 'Rechazadas'], ['cancelada', 'Canceladas']];
await writeFile(new URL('paginas/mis_invitaciones.html', raiz), `<!DOCTYPE html>
<html lang="es"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="robots" content="noindex">
    <title>Mis invitaciones | MOVANZA</title>
    <link rel="stylesheet" href="../estilos/general.css">
    <link rel="stylesheet" href="../estilos/alertas.css" data-estilo-alertas>
    <script type="module" src="../scripts/alertas.js"></script><link rel="stylesheet" href="../estilos/index.css">
    <link rel="stylesheet" href="../recursos/efecto_fondo/fondo.css"><link rel="stylesheet" href="../estilos/componentes-publicos.css">
    <link rel="stylesheet" href="../estilos/cuenta.css"><link rel="stylesheet" href="../estilos/home-trabajador.css"><link rel="stylesheet" href="../estilos/mis-invitaciones.css">
    <script src="../scripts/componentes-publicos.js" defer></script><script src="../scripts/invitaciones-carga.js" defer></script>
</head><body class="pagina-publica pagina-invitaciones" data-modulo="mis_invitaciones">
    <div class="container fondo-exterior" aria-hidden="true" inert><div id="stars"></div><div id="stars2"></div><div id="stars3"></div><div></div></div>
    <section id="estado-acceso" class="estado-acceso"><p id="mensaje-acceso" role="status">Comprobando tu cuenta…</p><a href="../login.html">Iniciar sesión</a></section>
    <div class="sitio-publico" id="sitio-invitaciones" hidden>
        <a class="saltar-contenido" href="#contenido">Saltar al contenido</a>
        ${encabezadoTrabajador({ raiz: '../', actual: 'mis_invitaciones' })}
        <main id="contenido" class="invitaciones-principal" hidden>
            <section class="banner-invitaciones" aria-labelledby="titulo-invitaciones"><div><p class="antetitulo">TU PRÓXIMO EQUIPO EMPIEZA AQUÍ</p><h1 id="titulo-invitaciones">Conecta con nuevas oportunidades</h1><p>Consulta las invitaciones que recibes de las empresas y decide de cuáles equipos de trabajo quieres formar parte.</p></div><span class="simbolo-invitaciones" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="17" width="48" height="34" rx="6"/><path d="m10 20 22 17 22-17M24 9h16M28 5h8"/></svg></span></section>
            <div id="estado-invitaciones"><p id="mensaje" role="status" aria-live="polite"></p></div>
            <div class="espacio-invitaciones" id="contenido-invitaciones" aria-busy="true">
                <section class="bandeja-invitaciones" aria-labelledby="titulo-invitaciones-recibidas"><div class="cabecera-bandeja"><div><p class="antetitulo">TÚ ELIGES DÓNDE CRECER</p><h2 id="titulo-invitaciones-recibidas" tabindex="-1">Invitaciones recibidas</h2><p id="cantidad-invitaciones" aria-live="polite">Consulta tus invitaciones</p></div><button id="actualizar-invitaciones" class="boton-relleno" type="button">↻ Actualizar</button></div>
                    <div class="filtros-invitaciones" role="group" aria-label="Filtrar invitaciones por estado">${filtros.map(([id, texto]) => `<button type="button" data-filtro-invitaciones="${id}" aria-pressed="${id === 'pendiente'}">${texto} <span aria-hidden="true">—</span></button>`).join('')}</div>
                    <div id="lista-invitaciones" class="lista-invitaciones"><p class="invitaciones-vacio">Consultando tus invitaciones…</p></div>
                </section>
                <aside class="mis-equipos" aria-labelledby="titulo-equipos"><div class="titulo-equipos"><span aria-hidden="true">↗</span><p class="antetitulo">CONEXIONES ACTIVAS</p><h2 id="titulo-equipos">Empresas donde trabajo</h2><p>Tus equipos actuales <strong id="cantidad-equipos">—</strong></p></div><div id="lista-membresias"><p class="equipos-vacio">Consultando tus equipos…</p></div><p class="ayuda-equipos">Las empresas pueden invitarte utilizando tu nombre de usuario de MOVANZA.</p></aside>
            </div>
        </main>
        ${footer}
    </div>
    <noscript><p class="aviso-noscript">Activa JavaScript para consultar tus invitaciones.</p></noscript>
</body></html>
`);
console.log('Mis invitaciones actualizado con el encabezado y footer compartidos.');
