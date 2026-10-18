import { readFile, writeFile } from 'node:fs/promises';
import { encabezadoTrabajador } from './encabezado-trabajador.js';
const raiz = new URL('../', import.meta.url);
const index = await readFile(new URL('index.html', raiz), 'utf8');
const pie = index.match(/<footer class="pie-publico">[\s\S]*?<\/footer>/)?.[0];
if (!pie) throw new Error('No se encontró el footer del Index.');
const footer = pie.replace(/href="#([^"]+)"/g, 'href="../index.html#$1"').replaceAll('href="./politicas/', 'href="../politicas/');
const formularios = await readFile(new URL('componentes/asignaciones-formularios.html', raiz), 'utf8');
await writeFile(new URL('paginas/mis_asignaciones.html', raiz), `<!DOCTYPE html>
<html lang="es"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="robots" content="noindex">
    <title>Mis asignaciones | MOVANZA</title>
    <link rel="stylesheet" href="../estilos/general.css">
    <link rel="stylesheet" href="../estilos/alertas.css" data-estilo-alertas>
    <script type="module" src="../scripts/alertas.js"></script><link rel="stylesheet" href="../estilos/index.css">
    <link rel="stylesheet" href="../recursos/efecto_fondo/fondo.css"><link rel="stylesheet" href="../estilos/componentes-publicos.css">
    <link rel="stylesheet" href="../estilos/cuenta.css"><link rel="stylesheet" href="../estilos/home-trabajador.css"><link rel="stylesheet" href="../estilos/mis-asignaciones.css">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" defer></script>
    <script src="../scripts/componentes-publicos.js" defer></script><script src="../scripts/asignaciones-carga.js" defer></script>
</head><body class="pagina-publica pagina-asignaciones" data-modulo="mis_asignaciones" data-presentacion="asignaciones-mapa">
    <div class="container fondo-exterior" aria-hidden="true" inert><div id="stars"></div><div id="stars2"></div><div id="stars3"></div><div></div></div>
    <section id="estado-acceso" class="estado-acceso"><p id="mensaje-acceso" role="status">Comprobando tu cuenta…</p><a href="../login.html">Iniciar sesión</a></section>
    <div class="sitio-publico" id="sitio-asignaciones" hidden>
        <a class="saltar-contenido" href="#contenido">Saltar al contenido</a>
        ${encabezadoTrabajador({ raiz: '../', actual: 'mis_asignaciones' })}
        <main id="contenido" class="asignaciones-principal" hidden>
            <section class="banner-asignaciones" aria-labelledby="titulo-asignaciones"><div><p class="antetitulo">TU AGENDA · TU RECORRIDO</p><h1 id="titulo-asignaciones">Tus asignaciones, en un solo lugar</h1><p>Consulta tus actividades, encuentra sus ubicaciones y gestiona tus trabajos de forma sencilla y organizada.</p></div><span class="simbolo-agenda" aria-hidden="true">↗</span></section>
            <div class="resumen-asignaciones" aria-label="Resumen de asignaciones"><span><strong id="total-pendientes">—</strong> Pendientes</span><span><strong id="total-aceptadas">—</strong> Aceptadas</span><span><strong id="total-en-curso">—</strong> En curso</span><span><strong id="total-finalizadas">—</strong> Finalizadas</span></div>
            <div id="anclaje-estado"><div id="estado-operacion"><p id="mensaje" role="status" aria-live="polite"></p></div></div>
            <div class="espacio-asignaciones">
                <section class="explorador-asignaciones" aria-labelledby="titulo-listado"><div class="filtros-asignaciones"><div class="fila-asignaciones"><h2 id="titulo-listado">Mis asignaciones</h2><button id="boton-actualizar" type="button" aria-label="Actualizar asignaciones">↻ Actualizar</button></div><label for="buscar-asignaciones">Buscar actividad o trabajo</label><input id="buscar-asignaciones" type="search" placeholder="¿Qué actividad buscas?" autocomplete="off"><label for="filtro-estado">Estado de la asignación</label><select id="filtro-estado"><option value="todas">Todos los estados</option><option value="pendiente">Pendientes</option><option value="aceptada">Aceptadas</option><option value="en_curso">En curso</option><option value="finalizada">Finalizadas</option><option value="rechazada">Rechazadas</option><option value="cancelada">Canceladas</option></select><p id="cantidad-visibles" aria-live="polite"></p></div><div id="lista-asignaciones"><p>Cargando tus actividades…</p></div></section>
                <section class="geografia-asignaciones" aria-labelledby="titulo-mapa"><div class="barra-mapa"><div><p class="antetitulo">ENCUENTRA TU PRÓXIMO PUNTO</p><h2 id="titulo-mapa">Tu mapa de trabajo</h2></div><div><button type="button" id="ver-puntos">Ver trabajos</button><button type="button" id="ubicarme" class="accion-primaria">◎ Ubicarme</button></div></div><div id="mapa-asignaciones" role="region" aria-label="Mapa de los trabajos asignados"></div><p id="error-mapa" role="status" hidden></p><div class="pie-mapa-asignaciones"><p class="leyenda-mapa"><span><i class="leyenda-trabajo" aria-hidden="true"></i> Trabajo · radio autorizado</span><span><i class="leyenda-personal" aria-hidden="true"></i> Mi ubicación · precisión GPS</span></p><p id="estado-gps" role="status">Tu posición se consulta solo cuando tú lo solicitas.</p><details class="ayuda-ubicacion"><summary>¿Cómo se utiliza mi ubicación?</summary><p>Ubicarme muestra tu posición en este mapa. Iniciar y finalizar solicitan una posición nueva y verifican la precisión y el radio en el servidor. No hay seguimiento continuo. Ubicarme no guarda ni envía tu posición a MOVANZA.</p></details></div>
                    <section class="detalle-asignacion" aria-labelledby="titulo-detalle"><div class="fila-asignaciones"><h2 id="titulo-detalle" tabindex="-1">Detalle de la actividad</h2><button type="button" id="cerrar-detalle" hidden>Cerrar detalle</button></div><div id="contenido-detalle"><div class="detalle-vacio"><span aria-hidden="true">⌖</span><h3>Elige tu siguiente actividad</h3><p>Selecciona una asignación o un punto en el mapa para consultar sus detalles y acciones disponibles.</p></div></div></section>
                </section>
            </div>
        </main>
        ${footer}
    </div>
    <dialog id="acciones-asignacion" aria-labelledby="titulo-accion"><div class="fila-asignaciones"><p class="antetitulo" id="titulo-accion">GESTIONA TU ACTIVIDAD</p><button type="button" id="cerrar-accion" aria-label="Cerrar formulario">×</button></div>${formularios}<div id="estado-en-formulario"></div></dialog>
    <noscript><p class="aviso-noscript">Activa JavaScript para consultar tus asignaciones.</p></noscript>
</body></html>
`);
console.log('Mis asignaciones actualizado con el encabezado y footer compartidos.');
