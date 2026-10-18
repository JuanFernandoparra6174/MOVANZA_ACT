import { ESTADOS, serieEvolucion, ZONA_INFORME } from './estadisticas-calculos.js';
const $ = id => document.getElementById(id);
const graficos = new Map();
const idsGraficos = ['grafico-estados', 'grafico-evolucion', 'grafico-equipo', 'grafico-tiempos'];
let disponible = false;
let enCarga = false;
let loader;
let modelo = null;
let activa = false;
const reducido = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
const numero = valor => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(valor);
function destruir(id) { graficos.get(id)?.destroy(); graficos.delete(id); }
function mensajeGrafico(id, texto) {
    destruir(id); $(id).hidden = true; $('vacio-' + id).hidden = false;
    $('vacio-' + id).textContent = texto;
}
function dibujar(id, config, alternativas, resumen, hayDatos, mensajeVacio) {
    $('resumen-' + id).textContent = resumen;
    const lista = $('valores-' + id); lista.replaceChildren();
    alternativas.forEach(texto => { const li = document.createElement('li'); li.textContent = texto; lista.append(li); });
    if (!hayDatos) { mensajeGrafico(id, mensajeVacio); return; }
    if (typeof window.Chart !== 'function') {
        mensajeGrafico(id, 'El gráfico no está disponible. Puedes consultar sus valores a continuación.');
        lista.closest('details').open = true;
        return;
    }
    $(id).hidden = false; $('vacio-' + id).hidden = true;
    const base = {
        responsive: true, maintainAspectRatio: false,
        animation: reducido() ? false : { duration: 350 },
        interaction: { intersect: false, mode: 'index' },
        plugins: {
            legend: { position: 'bottom', labels: { color: '#303044', usePointStyle: true, boxWidth: 9, padding: 16, font: { family: 'Aptos, Inter, sans-serif', size: 11 } } },
            tooltip: { backgroundColor: '#303044', titleColor: '#fff', bodyColor: '#fff', padding: 12, cornerRadius: 8,
                callbacks: { label: contexto => `${contexto.dataset.label || contexto.label}: ${numero(contexto.parsed.y ?? contexto.parsed)}` } }
        }
    };
    config.options = { ...base, ...config.options, plugins: { ...base.plugins, ...config.options?.plugins } };
    try {
        if (graficos.has(id)) { const chart = graficos.get(id); chart.data = config.data; chart.options = config.options; chart.update(reducido() ? 'none' : undefined); }
        else graficos.set(id, new window.Chart($(id), config));
    } catch {
        mensajeGrafico(id, 'No se pudo dibujar el gráfico. Consulta los valores disponibles.');
        lista.closest('details').open = true;
    }
}
const ejesConteo = () => ({ x: { grid: { display: false }, ticks: { color: '#303044', maxTicksLimit: 8, maxRotation: 0 } }, y: { beginAtZero: true, ticks: { precision: 0, color: '#303044' }, grid: { color: '#dddddd70' } } });

export const vistaEstadisticas = {
    iniciar() {
        activa = true;
        $('biblioteca-graficos')?.addEventListener('load', () => { if (activa && modelo) this.representar(modelo); });
        if (window.MovanzaUI) { loader = window.MovanzaUI.crearLoader('Consultando estadísticas…'); $('estado-informe').append(loader); }
    },
    carga(valor) {
        enCarga = valor;
        if (loader) loader.hidden = !valor;
        $('filtros-controles').disabled = valor || !disponible;
        $('resumen-indicadores').setAttribute('aria-busy', String(valor));
        $('contenido').classList.toggle('informe-cargando', valor);
    },
    actualizado() { $('ultima-actualizacion').textContent = 'Datos consultados: ' + new Date().toLocaleString('es-CO', { timeZone: ZONA_INFORME, dateStyle: 'medium', timeStyle: 'short' }); },
    sinDatos(texto, { filtros = false } = {}) {
        modelo = null;
        disponible = filtros;
        document.querySelectorAll('[id^="indicador-"]').forEach(n => { n.textContent = '—'; });
        $('descripcion-filtros').textContent = texto;
        $('empresa-informe').textContent = filtros ? $('filtro-empresa').selectedOptions[0]?.textContent.trim() || 'Selecciona una empresa' : 'Informe no disponible';
        $('muestras-tiempo').textContent = 'No hay un cálculo disponible con los criterios actuales.';
        $('tabla-agrupacion').replaceChildren(); $('tabla-detalle').replaceChildren();
        for (const id of idsGraficos) { mensajeGrafico(id, texto); $('resumen-' + id).textContent = ''; $('valores-' + id).replaceChildren(); }
        $('filtros-controles').disabled = enCarga || !disponible;
    },
    grupos(filas, porcentaje, duracion) {
        const contenedor = $('tabla-agrupacion'); contenedor.replaceChildren();
        if (!filas.length) { const p = document.createElement('p'); p.textContent = 'No hay resultados para estos filtros.'; contenedor.append(p); }
        for (const fila of filas) {
            const card = document.createElement('article'); card.className = 'elemento-empresa grid-1-5';
            const nombre = document.createElement('h3'); nombre.textContent = fila.nombre;
            const dl = document.createElement('dl');
            const campos = [['Asignaciones', numero(fila.datos.total)], ['Finalizadas', numero(fila.datos.conteos.finalizada)], ['Rechazadas', numero(fila.datos.conteos.rechazada)], ['Objetivos cumplidos', porcentaje(fila.datos.cumplimiento)], ['Tiempo real', duracion(fila.datos.tiempoTotal)]];
            for (const [titulo, valor] of campos) { const div = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = titulo; dd.textContent = valor; div.append(dt, dd); dl.append(div); }
            card.append(nombre, dl); contenedor.append(card);
        }
    },
    representar({ datos, registros, grupos, formatoDuracion }) {
        if (!activa) return;
        modelo = { datos, registros, grupos, formatoDuracion };
        disponible = true;
        $('filtros-controles').disabled = enCarga;
        $('muestras-tiempo').textContent = `${datos.muestrasTiempo} de ${datos.conteos.finalizada} asignaciones finalizadas tienen inicio y fin válidos. El promedio usa solo esas ${datos.muestrasTiempo} muestras.`;
        const estados = ESTADOS.map(([id, nombre, color]) => ({ nombre, cantidad: datos.conteos[id], color }));
        if (datos.otros) estados.push({ nombre: 'Otros estados registrados', cantidad: datos.otros, color: '#A89CC8' });
        dibujar('grafico-estados', { type: 'doughnut', data: { labels: estados.map(e => e.nombre), datasets: [{ label: 'Asignaciones', data: estados.map(e => e.cantidad), backgroundColor: estados.map(e => e.color), borderColor: '#fff', borderWidth: 3, hoverOffset: 7 }] }, options: { cutout: '68%', plugins: { tooltip: { backgroundColor: '#303044', padding: 12, callbacks: { label: c => `${c.label}: ${c.parsed} (${numero(c.parsed / datos.total * 100)} % del total)` } } } } }, estados.map(e => `${e.nombre}: ${e.cantidad}`), `${datos.total} asignaciones únicas distribuidas por su estado registrado.`, datos.total > 0, 'No hay asignaciones para estos filtros.');

        const evolucion = serieEvolucion(registros);
        const etiquetas = evolucion.filas.map(f => evolucion.mensual ? `${f.fecha.slice(5)}/${f.fecha.slice(0, 4)}` : `${f.fecha.slice(8)}/${f.fecha.slice(5, 7)}/${f.fecha.slice(2, 4)}`);
        dibujar('grafico-evolucion', { type: 'line', data: { labels: etiquetas, datasets: [
            { label: 'Asignaciones programadas', data: evolucion.filas.map(f => f.total), borderColor: '#5F4D93', backgroundColor: '#A89CC826', fill: true, pointRadius: 2, pointHoverRadius: 5, tension: .15 },
            { label: 'De ellas, finalizadas', data: evolucion.filas.map(f => f.finalizadas), borderColor: '#24784D', pointRadius: 2, pointHoverRadius: 5, tension: .15 }
        ] }, options: { scales: ejesConteo() } }, evolucion.filas.map(f => `${f.fecha}: ${f.total} programadas; ${f.finalizadas} finalizadas`), `Agrupación ${evolucion.mensual ? 'mensual' : 'diaria'} en hora de Colombia, según fecha programada.${evolucion.sinFecha ? ` ${evolucion.sinFecha} registros sin fecha válida no aparecen en esta serie.` : ''}`, evolucion.filas.length > 0, 'No hay fechas programadas válidas para representar la evolución.');

        const tipo = $('filtro-empresa').value === 'todas' ? 'empresa' : 'trabajador';
        $('titulo-grafico-equipo').textContent = `Actividad por ${tipo}`;
        const principales = grupos.slice(0, 8);
        dibujar('grafico-equipo', { type: 'bar', data: { labels: principales.map(g => g.nombre), datasets: [
            { label: 'Asignaciones', data: principales.map(g => g.datos.total), backgroundColor: '#5F4D93', borderRadius: 5 },
            { label: 'Finalizadas', data: principales.map(g => g.datos.conteos.finalizada), backgroundColor: '#8CC9F0', borderRadius: 5 }
        ] }, options: { scales: ejesConteo() } }, principales.map(g => `${g.nombre}: ${g.datos.total} asignaciones; ${g.datos.conteos.finalizada} finalizadas`), `Hasta ocho grupos por número de asignaciones. La comparativa desplegable incluye los ${grupos.length} grupos.`, principales.length > 0, 'No hay actividad del equipo con estos filtros.');

        const tiempos = [...grupos].filter(g => g.datos.tiempoTotal !== null).sort((a, b) => b.datos.tiempoTotal - a.datos.tiempoTotal).slice(0, 8);
        dibujar('grafico-tiempos', { type: 'bar', data: { labels: tiempos.map(g => g.nombre), datasets: [{ label: 'Horas registradas', data: tiempos.map(g => g.datos.tiempoTotal / 3600), backgroundColor: '#A89CC8', borderRadius: 5 }] }, options: { indexAxis: 'y', scales: { x: { beginAtZero: true, title: { display: true, text: 'Horas registradas' }, grid: { color: '#dddddd70' } }, y: { grid: { display: false } } }, plugins: { legend: { display: false }, tooltip: { backgroundColor: '#303044', padding: 12, callbacks: { label: c => formatoDuracion(c.parsed.x * 3600) } } } } }, tiempos.map(g => `${g.nombre}: ${formatoDuracion(g.datos.tiempoTotal)} (${g.datos.muestrasTiempo} muestras)`), 'Hasta ocho grupos por tiempo total. Se excluyen tiempos ausentes, negativos o de asignaciones no finalizadas.', tiempos.length > 0, 'Aún no hay finalizadas con inicio y fin válidos para mostrar tiempos.');
    },
    redimensionar() { for (const chart of graficos.values()) chart.resize(); },
    destruir() { activa = false; modelo = null; for (const id of [...graficos.keys()]) destruir(id); }
};
