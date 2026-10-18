import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { encabezadoEmpresarial } from './encabezado-empresarial.js';
const raiz = new URL('../', import.meta.url);
const fuenteFormularios = new URL('componentes/trabajos-formularios.html', raiz);
let formularios;
try { formularios = await readFile(fuenteFormularios, 'utf8'); }
catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const original = await readFile(new URL('paginas/trabajos.html', raiz), 'utf8');
    formularios = ['seccion-crear', 'seccion-editar-trabajo', 'seccion-editar-asignacion'].map(id => {
        const seccion = original.match(new RegExp(`<section\\b(?=[^>]*id="${id}")[\\s\\S]*?<\\/section>`))?.[0];
        if (!seccion) throw new Error('No se encontró el formulario original: ' + id);
        return seccion;
    }).join('\n');
    await mkdir(new URL('componentes/', raiz), { recursive: true });
    await writeFile(fuenteFormularios, formularios);
}
const index = await readFile(new URL('index.html', raiz), 'utf8');
const footer = index.match(/<footer class="pie-publico">[\s\S]*?<\/footer>/)?.[0];
if (!footer) throw new Error('No se encontró el footer del Index.');
await writeFile(new URL('paginas/trabajos.html', raiz), `<!DOCTYPE html>
<html lang="es"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="robots" content="noindex">
    <title>Trabajos y mapa | MOVANZA</title>
    <link rel="stylesheet" href="../estilos/general.css">
    <link rel="stylesheet" href="../estilos/alertas.css" data-estilo-alertas>
    <script type="module" src="../scripts/alertas.js"></script><link rel="stylesheet" href="../estilos/index.css">
    <link rel="stylesheet" href="../recursos/efecto_fondo/fondo.css"><link rel="stylesheet" href="../estilos/componentes-publicos.css">
    <link rel="stylesheet" href="../estilos/home-empresa.css"><link rel="stylesheet" href="../estilos/home-empresa-2.css">
    <link rel="stylesheet" href="../estilos/encabezado-empresarial.css"><link rel="stylesheet" href="../estilos/cuenta.css">
    <link rel="stylesheet" href="../estilos/seleccionar-empresa.css"><link rel="stylesheet" href="../estilos/trabajos.css">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" defer></script>
    <script src="../scripts/componentes-publicos.js" defer></script><script src="../scripts/trabajos-carga.js" defer></script>
</head><body class="pagina-publica pagina-trabajos" data-modulo="trabajos">
    <div class="container fondo-exterior" aria-hidden="true" inert><div id="stars"></div><div id="stars2"></div><div id="stars3"></div><div></div></div>
    <section id="estado-acceso" class="estado-acceso"><p id="mensaje-acceso" role="status" aria-live="polite">Comprobando el acceso a tus trabajos…</p><a href="./seleccionar_empresa.html">Seleccionar empresa</a></section>
    <div id="sitio-trabajos" class="sitio-publico" hidden>
        <a class="saltar-contenido" href="#contenido">Saltar al contenido</a>
        ${encabezadoEmpresarial({ raiz: '../', actual: 'trabajos' })}
        <main id="contenido" class="administracion-principal trabajos-principal" hidden>
            <section class="bienvenida-administracion banner-trabajos" aria-labelledby="titulo-trabajos">
                <div><p class="antetitulo">TRABAJOS Y OPERACIONES</p><h1 id="titulo-trabajos">Organiza y gestiona tus trabajos</h1><p>Administra los puntos de trabajo, organiza las actividades de tu empresa y mantén el control de tus operaciones desde un solo lugar.</p></div>
                <p class="empresa-identificada"><span>Empresa</span><strong id="nombre-empresa">Cargando empresa…</strong></p>
            </section>
            <div id="mensajes-trabajos"><div id="estado-operacion"><p id="mensaje" role="status" aria-live="polite"></p></div></div>
            <section class="herramientas-trabajos" aria-label="Herramientas de trabajos">
                <div><h2>Puntos de trabajo <span id="cantidad-trabajos"></span></h2><p>Ubica tus operaciones y abre un punto para gestionarlo.</p></div>
                <button type="button" id="nuevo-punto" class="boton-relleno boton-principal" disabled><span aria-hidden="true">＋</span> Nuevo punto</button>
            </section>
            <div class="espacio-trabajos">
                <section class="explorador-trabajos" aria-label="Explorador de puntos">
                    <div class="barra-explorador"><div role="tablist" aria-label="Vista de puntos"><button type="button" id="tab-mapa" role="tab" aria-selected="true" aria-controls="vista-mapa">Mapa</button><button type="button" id="tab-lista" role="tab" aria-selected="false" aria-controls="vista-lista" tabindex="-1">Lista</button></div><button type="button" id="boton-centrar" class="boton-relleno" disabled>Mostrar todos los trabajos</button></div>
                    <div id="vista-mapa" role="tabpanel" aria-labelledby="tab-mapa"><div id="mapa-trabajos" tabindex="0" aria-label="Mapa de puntos de trabajo. También puedes seleccionar los puntos desde la vista Lista."></div><div class="pie-mapa"><p id="instruccion-mapa">Selecciona un punto existente o pulsa en el mapa para ubicar uno nuevo.</p><button type="button" id="usar-centro" class="boton-relleno" disabled>Usar centro del mapa</button><button type="button" id="volver-card" class="boton-relleno" hidden>Volver a la card</button><p><span>Latitud <strong id="latitud-seleccionada">Sin seleccionar</strong></span><span>Longitud <strong id="longitud-seleccionada">Sin seleccionar</strong></span></p></div></div>
                    <div id="vista-lista" role="tabpanel" aria-labelledby="tab-lista" hidden><div id="lista-trabajos" class="tabla-empresas catalogo-puntos"><p>Cargando trabajos…</p></div></div>
                </section>
                <div id="anclaje-panel"><aside id="panel-trabajo" class="efecto-card panel-trabajo" aria-labelledby="titulo-panel"><span class="efecto-card-borde" aria-hidden="true"></span><div class="interior-panel">
                    <div class="cabecera-panel"><div><p class="antetitulo">GESTIÓN DEL PUNTO</p><h2 id="titulo-panel" tabindex="-1">Tu espacio de gestión</h2></div><button type="button" id="cerrar-panel" class="boton-icono" aria-label="Cerrar panel de trabajo" hidden>×</button></div>
                    <div id="mensajes-panel"></div>
                    <div id="panel-inicial" class="panel-inicial"><span class="icono-punto" aria-hidden="true">◎</span><h3>Cada operación, en su lugar</h3><p>Abre un punto desde el mapa o la lista para consultar sus asignaciones y acciones.</p></div>
                    <div id="panel-detalle" class="oculto"><div id="detalle-contenido"></div></div>
                    <button type="button" id="elegir-ubicacion" class="boton-relleno" hidden>Elegir ubicación en el mapa ↗</button>
                    ${formularios.replace(/class="tarjeta bloque" id="seccion-crear"/, 'class="tarjeta bloque oculto" id="seccion-crear"')}
                    <button type="button" id="cancelar-panel" class="boton-relleno" hidden>Cerrar</button>
                </div></aside></div>
            </div>
        </main>
        ${footer.replace(/href="#([^"]+)"/g, 'href="../index.html#$1"')}
    </div>
    <dialog id="panel-movil" aria-labelledby="titulo-panel"></dialog>
    <noscript><p class="aviso-noscript">Activa JavaScript para verificar tu sesión y gestionar los trabajos de tu empresa.</p></noscript>
</body></html>`);
console.log('Trabajos actualizado; formularios originales conservados en componentes/trabajos-formularios.html.');
