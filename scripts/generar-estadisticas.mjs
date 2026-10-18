import { readFile, writeFile } from 'node:fs/promises';
import { encabezadoEmpresarial } from './encabezado-empresarial.js';
import { ESTADOS } from './estadisticas-calculos.js';
const raiz = new URL('../', import.meta.url);
const index = await readFile(new URL('index.html', raiz), 'utf8');
const footer = index.match(/<footer class="pie-publico">[\s\S]*?<\/footer>/)?.[0];
if (!footer) throw new Error('No se encontró el footer del Index.');
const indicador = (id, titulo, ayuda, icono) => `<article class="indicador-principal efecto-card"><span class="efecto-card-borde" aria-hidden="true"></span><div class="interior-indicador"><span class="icono-indicador" aria-hidden="true">${icono}</span><h2>${titulo}</h2><strong id="${id}">—</strong><p>${ayuda}</p></div></article>`;
const grafico = (id, titulo, descripcion, clase = '') => `<section class="panel-grafico ${clase}" aria-labelledby="titulo-${id}"><div class="titulo-grafico"><h2 id="titulo-${id}">${titulo}</h2><p>${descripcion}</p></div><div class="lienzo-grafico"><canvas id="${id}" role="img" aria-label="${titulo}" aria-describedby="resumen-${id}"></canvas><p id="vacio-${id}" class="grafico-vacio">Aún no se han consultado los datos.</p></div><p id="resumen-${id}" class="resumen-grafico"></p><details class="datos-grafico"><summary>Consultar valores del gráfico</summary><ul id="valores-${id}"></ul></details></section>`;
await writeFile(new URL('paginas/estadisticas.html', raiz), `<!DOCTYPE html>
<html lang="es"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="robots" content="noindex">
    <title>Estadísticas de tu operación | MOVANZA</title>
    <link rel="stylesheet" href="../estilos/general.css">
    <link rel="stylesheet" href="../estilos/alertas.css" data-estilo-alertas>
    <script type="module" src="../scripts/alertas.js"></script><link rel="stylesheet" href="../estilos/index.css">
    <link rel="stylesheet" href="../recursos/efecto_fondo/fondo.css"><link rel="stylesheet" href="../estilos/componentes-publicos.css">
    <link rel="stylesheet" href="../estilos/home-empresa.css"><link rel="stylesheet" href="../estilos/home-empresa-2.css">
    <link rel="stylesheet" href="../estilos/encabezado-empresarial.css"><link rel="stylesheet" href="../estilos/cuenta.css">
    <link rel="stylesheet" href="../estilos/seleccionar-empresa.css"><link rel="stylesheet" href="../estilos/estadisticas.css">
    <script id="biblioteca-graficos" src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js" async></script>
    <script src="../scripts/componentes-publicos.js" defer></script><script src="../scripts/estadisticas-carga.js" defer></script>
</head><body class="pagina-publica pagina-estadisticas" data-modulo="estadisticas">
    <div class="container fondo-exterior" aria-hidden="true" inert><div id="stars"></div><div id="stars2"></div><div id="stars3"></div><div></div></div>
    <section id="estado-acceso" class="estado-acceso"><p id="mensaje-acceso" role="status" aria-live="polite">Comprobando el acceso a tus estadísticas…</p><a href="../home_empresa_2.html">Volver a mi empresa</a></section>
    <div id="sitio-estadisticas" class="sitio-publico" hidden>
        <a class="saltar-contenido" href="#contenido">Saltar al contenido</a>
        ${encabezadoEmpresarial({ raiz: '../', actual: 'estadisticas' })}
        <main id="contenido" class="administracion-principal estadisticas-principal" hidden>
            <section class="bienvenida-administracion banner-estadisticas" aria-labelledby="titulo-estadisticas"><div><p class="antetitulo">ESTADÍSTICAS DE TU OPERACIÓN</p><h1 id="titulo-estadisticas">Comprende el rendimiento de tu operación</h1><p>Consulta indicadores, analiza los tiempos de ejecución y descubre información útil sobre las actividades de tu empresa.</p></div><p class="empresa-identificada"><span>Informe de</span><strong id="empresa-informe">Verificando empresas…</strong></p></section>
            <section class="panel-filtros" aria-labelledby="titulo-filtros"><div class="cabecera-filtros"><div><h2 id="titulo-filtros">Explora tus resultados</h2><p id="ultima-actualizacion">Las métricas se calculan sobre asignaciones reales.</p></div><button type="button" id="boton-actualizar-panel" class="boton-relleno">↻ Actualizar indicadores</button></div>
                <fieldset id="filtros-controles" class="estadisticas-filtros" disabled><legend class="solo-lectores">Filtros del informe</legend>
                    <div id="contenedor-empresa" class="oculto"><label for="filtro-empresa">Empresa</label><select id="filtro-empresa"><option value="todas">Todas mis empresas</option></select></div>
                    <div id="contenedor-trabajador" class="oculto"><label for="filtro-trabajador">Trabajador</label><select id="filtro-trabajador"><option value="todos">Todos los trabajadores</option></select></div>
                    <div><label for="filtro-periodo">Período</label><select id="filtro-periodo"><option value="todo">Todo el historial</option><option value="7">Últimos 7 días</option><option value="30" selected>Últimos 30 días</option><option value="90">Últimos 90 días</option><option value="personalizado">Personalizado</option></select></div>
                    <div><label for="filtro-estado">Estado de la asignación</label><select id="filtro-estado"><option value="todos">Todos los estados</option>${ESTADOS.map(([id, nombre]) => `<option value="${id}">${nombre}</option>`).join('')}</select></div>
                    <div><label for="filtro-punto">Punto de trabajo</label><select id="filtro-punto"><option value="todos">Todos los puntos con asignaciones</option></select></div>
                    <div id="contenedor-fecha-inicio" class="oculto"><label for="fecha-inicio">Desde</label><input id="fecha-inicio" type="date"></div><div id="contenedor-fecha-fin" class="oculto"><label for="fecha-fin">Hasta</label><input id="fecha-fin" type="date"></div>
                </fieldset>
                <p class="criterio-fechas">Período según la fecha programada de las asignaciones · Hora de Colombia (UTC−5).</p><p id="descripcion-filtros" class="filtros-activos" role="status">Esperando los datos del informe.</p>
            </section>
            <div id="estado-informe"><p id="mensaje" role="status" aria-live="polite"></p></div>
            <section id="resumen-indicadores" class="resumen-indicadores" aria-label="Indicadores principales">
                ${indicador('indicador-total', 'Asignaciones', 'Registros únicos que cumplen los filtros activos.', '▤')}
                ${indicador('indicador-finalizadas', 'Finalizadas', 'Asignaciones con estado finalizada, según su fecha programada.', '✓')}
                ${indicador('indicador-tiempo-promedio', 'Tiempo real promedio', 'Solo finalizadas con inicio y fin válidos.', '◷')}
                ${indicador('indicador-cumplimiento', 'Objetivos cumplidos', 'Porcentaje sobre finalizadas con resultado registrado.', '◎')}
            </section>
            <div class="estados-resumen" aria-label="Otros estados">${[['pendiente','Pendientes','indicador-pendientes'],['aceptada','Aceptadas','indicador-aceptadas'],['en_curso','En curso','indicador-en-curso'],['rechazada','Rechazadas','indicador-rechazadas'],['cancelada','Canceladas','indicador-canceladas']].map(([estado, nombre, id]) => `<p data-estado="${estado}"><span>${nombre}</span><strong id="${id}">—</strong></p>`).join('')}</div>
            <div class="cuadricula-graficos">
                ${grafico('grafico-estados', 'Distribución por estado', 'Todas las asignaciones incluidas en el informe.', 'grafico-distribucion')}
                ${grafico('grafico-evolucion', 'Evolución de las actividades', 'Asignaciones por fecha programada; no por fecha de finalización.', 'grafico-evolucion')}
                ${grafico('grafico-equipo', 'Actividad del equipo', 'Asignaciones totales y finalizadas; hasta ocho grupos con mayor actividad.')}
                ${grafico('grafico-tiempos', 'Tiempo real registrado', 'Horas acumuladas en finalizadas con marcas de tiempo válidas.')}
            </div>
            <section class="panel-tiempos" aria-labelledby="titulo-tiempos"><div><p class="antetitulo">TIEMPOS Y RESULTADOS</p><h2 id="titulo-tiempos">Cada resultado, con su contexto</h2><p id="muestras-tiempo">Aún no se han consultado marcas de tiempo.</p><p>Los objetivos sin resultado registrado no cuentan como incumplidos.</p></div><dl><div><dt>Tiempo real total</dt><dd id="indicador-tiempo-total">—</dd></div><div><dt>Objetivos cumplidos</dt><dd id="indicador-objetivos-cumplidos">—</dd></div><div><dt>Objetivos no cumplidos</dt><dd id="indicador-objetivos-no-cumplidos">—</dd></div></dl></section>
            <details class="detalle-informe"><summary><span id="titulo-agrupacion">Resultados por empresa</span><span class="ayuda-desplegar">Comparar resultados ↗</span></summary><p class="nota-agrupacion">Comparativa de <span id="columna-grupo">Empresa</span>: asignaciones, resultados y tiempos del mismo conjunto filtrado.</p><div id="tabla-agrupacion" class="tabla-empresas grupos-estadisticos"></div></details>
            <details class="detalle-informe"><summary><span>Detalle de asignaciones</span><span class="ayuda-desplegar">Explorar registros ↗</span></summary><div class="estadisticas-tabla-contenedor"><table class="estadisticas-tabla"><caption class="solo-lectores">Asignaciones incluidas en el informe; las fechas se muestran en hora de Colombia.</caption><thead><tr>${['Asignación','Empresa','Trabajador','Fecha programada','Estado','Tiempo real','Objetivo'].map(t => `<th scope="col">${t}</th>`).join('')}</tr></thead><tbody id="tabla-detalle"></tbody></table></div></details>
            <p class="usuario-informe">Informe consultado por <span id="usuario-actual"></span>.</p>
        </main>
        ${footer.replace(/href="#([^"]+)"/g, 'href="../index.html#$1"')}
    </div>
    <noscript><p class="aviso-noscript">Activa JavaScript para verificar tu sesión y consultar estadísticas.</p></noscript>
</body></html>`);
console.log('Estadísticas generadas con los componentes empresariales compartidos.');
