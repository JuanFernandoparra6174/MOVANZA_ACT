import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { calcularIndicadores, duracionReal, fechaLocalDesdeCampo, fechaInforme, limitesPeriodo, serieEvolucion } from '../scripts/estadisticas-calculos.js';
import { encabezadoEmpresarial } from '../scripts/encabezado-empresarial.js';
if (!process.argv[2]) throw new Error('Indica el directorio temporal con jsdom.');
const { JSDOM } = await import(pathToFileURL(join(resolve(process.argv[2]), 'node_modules/jsdom/lib/api.js')));
const leer = ruta => readFile(new URL('../' + ruta, import.meta.url), 'utf8');
const esperar = () => new Promise(r => setTimeout(r, 80));
let comprobaciones = 0;
function verificar(valor, mensaje) { assert.ok(valor, mensaje); comprobaciones++; }

// Precisión independiente del DOM, del navegador y de Supabase.
{
    const inicio = '2026-10-15T10:00:00Z';
    const a = (id, estado, objetivo_cumplido, fin_en) => ({ id, estado, objetivo_cumplido, inicio_en: inicio, fin_en });
    const registros = [a(1, 'finalizada', true, '2026-10-15T11:00:00Z'), a(2, 'finalizada', false, '2026-10-15T10:30:00Z'), a(3, 'finalizada', null, null), a(4, 'cancelada', true, '2026-10-15T11:00:00Z'), a(5, 'finalizada', true, '2026-10-15T09:00:00Z'), a(6, 'finalizada', false, inicio), a(7, 'en_curso', true, '2026-10-15T11:00:00Z')];
    const r = calcularIndicadores([...registros, registros[0]]);
    verificar(r.total === 7 && r.conteos.finalizada === 5 && r.conteos.cancelada === 1, 'Deduplica IDs y no cuenta canceladas como finalizadas');
    verificar(r.tiempoTotal === 5400 && r.tiempoPromedio === 1800 && r.muestrasTiempo === 3, 'El total y promedio excluyen tiempos negativos, inexistentes y no finalizados');
    verificar(r.cumplidas === 2 && r.incumplidas === 2 && r.cumplimiento === 50, 'Cumplimiento usa únicamente finalizadas con resultado booleano');
    verificar(duracionReal(a(8, 'finalizada', null, inicio)) === 0, 'Cero segundos reales es válido');
    verificar(duracionReal(a(9, 'finalizada', null, 'inválida')) === null, 'Una fecha inválida no genera tiempo');
    verificar(calcularIndicadores([]).tiempoTotal === null && calcularIndicadores([]).cumplimiento === null && calcularIndicadores([]).total === 0, 'Distingue conteo cero de tiempo y porcentaje sin muestras');
    verificar(calcularIndicadores([a(10, 'finalizada', false, inicio)]).cumplimiento === 0, 'Un resultado negativo real sí produce 0 %');
    verificar(fechaLocalDesdeCampo('2026-10-17').toISOString() === '2026-10-17T05:00:00.000Z', 'El comienzo del día usa Colombia, independientemente del sistema');
    verificar(fechaLocalDesdeCampo('2026-10-17', true).toISOString() === '2026-10-18T04:59:59.999Z', 'El final del día incluye todo el día colombiano');
    verificar(fechaLocalDesdeCampo('2026-02-30') === null && fechaLocalDesdeCampo('2024-02-29') !== null, 'Valida calendario y años bisiestos');
    verificar(fechaInforme('2026-10-18T02:00:00Z') === '2026-10-17', 'Agrupa marcas UTC en el día colombiano correcto');
    const rango = limitesPeriodo('7', '', '', new Date('2026-10-18T02:00:00Z'));
    verificar(rango.desde.toISOString() === '2026-10-11T05:00:00.000Z' && rango.hasta.toISOString() === '2026-10-18T02:00:00.000Z', 'Últimos siete días comienza a medianoche colombiana y termina ahora');
    assert.throws(() => limitesPeriodo('personalizado', '2026-10-20', '2026-10-01')); comprobaciones++;
    const serie = serieEvolucion([{ id: 1, programada_para: '2026-10-18T02:00:00Z', estado: 'finalizada' }, { id: 2, programada_para: '2026-10-19T10:00:00Z', estado: 'pendiente' }, { id: 3, programada_para: null }]);
    verificar(serie.filas.length === 3 && serie.filas[0].fecha === '2026-10-17' && serie.filas[1].total === 0 && serie.sinFecha === 1, 'La evolución incluye ceros reales entre fechas y excluye fechas ausentes');
}

async function entorno({ rol = 'empresa', id = '2', consulta = '', sinChart = false } = {}) {
    const dom = new JSDOM(await leer('paginas/estadisticas.html'), { url: 'https://movanza.example/paginas/estadisticas.html' + consulta });
    const w = dom.window; w.matchMedia = () => ({ matches: true, addEventListener() {} });
    if (id !== null) w.sessionStorage.setItem('movanza_empresa_activa', id);
    const estado = { rol, usuario: rol ? { id: 'auth-7' } : null, consultas: [], eventos: [], redirecciones: [], creados: [], destruidos: [],
        empresas: [{ id: 2, propietario_id: 7, nombre: 'Empresa real A' }, { id: 3, propietario_id: 7, nombre: 'Empresa real B' }, { id: 99, propietario_id: 88, nombre: 'Empresa ajena' }],
        trabajos: [{ id: 20, empresa_id: 2, nombre: 'Punto A' }, { id: 21, empresa_id: 2, nombre: 'Punto B' }, { id: 30, empresa_id: 3, nombre: 'Punto C' }, { id: 99, empresa_id: 99, nombre: 'Punto ajeno' }],
        perfiles: [{ id: 7, rol, nombre_usuario: 'empresa_real' }, { id: 10, nombre_usuario: 'persona_a', nombre_completo: 'Persona A' }, { id: 11, nombre_usuario: 'persona_b', nombre_completo: 'Persona B' }],
        asignaciones: [
            { id: 1, trabajo_id: 20, trabajador_id: 10, titulo: 'Finalizada A', programada_para: '2026-10-15T12:00:00Z', estado: 'finalizada', inicio_en: '2026-10-15T12:00:00Z', fin_en: '2026-10-15T13:00:00Z', objetivo_cumplido: true },
            { id: 2, trabajo_id: 20, trabajador_id: 10, titulo: 'Finalizada B', programada_para: '2026-10-15T14:00:00Z', estado: 'finalizada', inicio_en: null, fin_en: null, objetivo_cumplido: null },
            { id: 3, trabajo_id: 21, trabajador_id: 11, titulo: 'Pendiente A', programada_para: '2026-10-16T12:00:00Z', estado: 'pendiente', inicio_en: null, fin_en: null, objetivo_cumplido: null },
            { id: 4, trabajo_id: 21, trabajador_id: 11, titulo: 'Cancelada A', programada_para: '2026-10-17T12:00:00Z', estado: 'cancelada', inicio_en: '2026-10-17T12:00:00Z', fin_en: '2026-10-17T16:00:00Z', objetivo_cumplido: false },
            { id: 5, trabajo_id: 30, trabajador_id: 10, titulo: 'Otra empresa propia', programada_para: '2026-10-16T12:00:00Z', estado: 'finalizada', inicio_en: '2026-10-16T12:00:00Z', fin_en: '2026-10-16T14:00:00Z', objetivo_cumplido: false },
            { id: 6, trabajo_id: 99, trabajador_id: 11, titulo: 'No debe verse', programada_para: '2026-10-16T12:00:00Z', estado: 'finalizada', inicio_en: '2026-10-16T12:00:00Z', fin_en: '2026-10-16T20:00:00Z', objetivo_cumplido: true }
        ]
    };
    class Grafico {
        constructor(canvas, config) { this.id = canvas.id; this.data = config.data; this.options = config.options; this.tipo = config.type; this.actualizaciones = 0; estado.creados.push(this); }
        update() { this.actualizaciones++; } resize() { this.redimensionado = true; } destroy() { estado.destruidos.push(this); }
    }
    if (!sinChart) w.Chart = Grafico;
    const supabase = {
        auth: { getUser: async () => ({ data: { user: estado.usuario }, error: null }), onAuthStateChange: fn => estado.eventos.push(fn),
            signOut: async () => { if (estado.errorSalida) return { error: new Error('Fallo de red') }; estado.eventos.forEach(fn => fn('SIGNED_OUT', null)); return { error: null }; } },
        from: tabla => {
            const q = { tabla, filtros: [], desde: 0, hasta: Infinity }; estado.consultas.push(q);
            async function resultado(single = false) {
                if (estado.esperaTabla === tabla) await estado.esperaConsulta;
                if (estado.errorTabla === tabla) return { data: null, error: new Error('Fallo de ' + tabla) };
                if (single) return { data: estado.perfiles[0], error: null };
                let datos = estado[tabla].filter(r => q.filtros.every(([campo, valor]) => r[campo] === valor));
                if (q.ids) datos = datos.filter(r => q.ids.includes(r[q.columnaIn]));
                datos = [...datos].sort((a, b) => a.id - b.id).slice(q.desde, q.hasta + 1);
                return { data: datos, error: null };
            }
            return { select(campos) { q.campos = campos; return this; }, order(campo, opciones) { q.orden = [campo, opciones.ascending]; return this; }, range(desde, hasta) { q.desde = desde; q.hasta = hasta; return this; },
                eq(campo, valor) { q.filtros.push([campo, valor]); return this; }, in(campo, ids) { q.columnaIn = campo; q.ids = [...ids]; return this; },
                single: () => resultado(true), then(resolve, reject) { return resultado().then(resolve, reject); } };
        },
        rpc() { throw new Error('Estadísticas no debe escribir datos ni llamar RPC nuevas.'); }
    };
    class FechaControlada extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-17T17:00:00Z'])); } static now() { return new Date('2026-10-17T17:00:00Z').getTime(); } }
    const contexto = vm.createContext({ document: w.document, window: w, sessionStorage: w.sessionStorage, Date: FechaControlada, URLSearchParams,
        location: { replace: url => estado.redirecciones.push(url) }, console: { error() {} } });
    const proveedor = new vm.SyntheticModule(['supabase'], function () { this.setExport('supabase', supabase); }, { context: contexto });
    const cache = new Map();
    async function cargar(nombre) {
        if (cache.has(nombre)) return cache.get(nombre);
        const modulo = new vm.SourceTextModule((nombre === 'alertas.js' ? await readFile(new URL('./alertas-simuladas.js', import.meta.url), 'utf8') : await leer('scripts/' + nombre)), { context: contexto,
            importModuleDynamically: async ruta => { const m = await cargar(ruta.replace('./', '')); await m.evaluate(); return m; } });
        cache.set(nombre, modulo); await modulo.link(ruta => ruta.includes('supabase.js') ? proveedor : cargar(ruta.replace('./', ''))); return modulo;
    }
    async function iniciar() {
        new vm.Script(await leer('scripts/componentes-publicos.js')).runInContext(contexto);
        let importacion;
        new vm.Script(await leer('scripts/estadisticas-carga.js'), { importModuleDynamically: () => importacion = (async () => {
            if (estado.errorCarga) throw new Error('CDN no disponible'); const m = await cargar('estadisticas-interfaz.js'); await m.evaluate(); return m;
        })() }).runInContext(contexto);
        await importacion?.catch(() => {}); await esperar();
    }
    function filtrar(id, valor) { w.document.getElementById(id).value = valor; w.document.getElementById(id).dispatchEvent(new w.Event('change')); }
    return { dom, document: w.document, estado, iniciar, filtrar, Grafico };
}

{
    const t = await entorno(); verificar(t.document.getElementById('sitio-estadisticas').hidden, 'El dashboard empieza oculto'); await t.iniciar();
    verificar(!t.document.getElementById('sitio-estadisticas').hidden, 'La cuenta autorizada accede al dashboard');
    verificar(t.document.getElementById('empresa-informe').textContent === 'Empresa real A', 'El contexto inicial procede de la empresa activa real');
    verificar(t.document.getElementById('indicador-total').textContent === '4' && t.document.getElementById('indicador-finalizadas').textContent === '2', 'Los conteos respetan la empresa y los estados reales');
    verificar(t.document.getElementById('indicador-tiempo-total').textContent === '1 h 0 min 0 s' && t.document.getElementById('indicador-tiempo-promedio').textContent === '1 h 0 min 0 s', 'Tiempos excluyen canceladas y finalizadas sin marcas');
    verificar(t.document.getElementById('indicador-cumplimiento').textContent === '100,0 %' && t.document.getElementById('muestras-tiempo').textContent.includes('1 de 2'), 'Cumplimiento y muestras usan sus denominadores correctos');
    verificar(t.document.getElementById('tabla-detalle').rows.length === 4 && !t.document.getElementById('tabla-detalle').textContent.includes('No debe verse'), 'El detalle no muestra empresas ajenas ni otra empresa propia fuera del filtro');
    verificar(t.estado.creados.length === 4 && t.estado.creados.every(c => c.options.animation === false), 'Crea cuatro gráficos y respeta movimiento reducido');
    verificar(t.estado.creados.find(c => c.id === 'grafico-estados').data.datasets[0].data.reduce((a, b) => a + b, 0) === 4, 'El gráfico representa el mismo total que los indicadores');
    const cabecera = new JSDOM(encabezadoEmpresarial({ raiz: '../', actual: 'estadisticas' })); const esperado = cabecera.window.document.querySelector('header');
    esperado.querySelector('#usuario-empresarial').textContent = 'empresa_real'; esperado.querySelector('[data-estadisticas-empresa]').setAttribute('href', './estadisticas.html?empresa=2');
    verificar(t.document.querySelector('header').outerHTML === esperado.outerHTML, 'Reutiliza el encabezado y marca Estadísticas activo'); cabecera.window.close();
    const indice = new JSDOM(await leer('index.html')); const pie = indice.window.document.querySelector('footer').cloneNode(true);
    pie.querySelectorAll('a[href^="#"]').forEach(a => a.setAttribute('href', '../index.html' + a.getAttribute('href')));
    verificar(t.document.querySelector('footer').outerHTML === pie.outerHTML, 'Reutiliza el footer completo del Index'); indice.window.close();
    for (const recurso of t.document.querySelectorAll('img[src], link[href^="../"], script[src^="../"], a[href^="../"], a[href^="./"]')) {
        const ruta = decodeURIComponent(recurso.getAttribute('src') || recurso.getAttribute('href')).split(/[?#]/)[0]; await access(new URL('../paginas/' + ruta, import.meta.url)); comprobaciones++;
    }
    verificar(t.document.querySelectorAll('#tabla-agrupacion .grid-1-5').length === 2, 'La comparativa usa el recurso de tabla y grupos reales');
    const lecturas = t.estado.consultas.length;
    t.filtrar('filtro-trabajador', '10');
    verificar(t.document.getElementById('indicador-total').textContent === '2', 'El filtro de trabajador actualiza los indicadores');
    verificar(t.estado.creados.find(c => c.id === 'grafico-estados').data.datasets[0].data.reduce((a, b) => a + b, 0) === 2, 'Los gráficos aplican el mismo filtro');
    verificar(t.estado.creados.length === 4 && t.estado.creados.some(c => c.actualizaciones > 0), 'Actualizar filtros reutiliza instancias, sin duplicarlas');
    t.filtrar('filtro-trabajador', 'todos'); t.filtrar('filtro-estado', 'cancelada');
    verificar(t.document.getElementById('indicador-total').textContent === '1' && t.document.getElementById('indicador-finalizadas').textContent === '0' && t.document.getElementById('indicador-tiempo-total').textContent === '—', 'Canceladas no generan finalizadas ni tiempos válidos');
    verificar(t.document.getElementById('grafico-tiempos').hidden && t.document.getElementById('vacio-grafico-tiempos').textContent.includes('finalizadas'), 'La ausencia de tiempos no se sustituye por ceros');
    t.filtrar('filtro-estado', 'todos'); t.filtrar('filtro-punto', '20');
    verificar(t.document.getElementById('indicador-total').textContent === '2', 'El filtro de punto funciona con datos ya descargados');
    verificar(t.estado.consultas.length === lecturas, 'Los cambios de filtros no repiten consultas');
    t.filtrar('filtro-empresa', '3');
    verificar(t.document.getElementById('indicador-total').textContent === '1' && t.document.getElementById('indicador-cumplimiento').textContent === '0,0 %' && t.document.getElementById('empresa-informe').textContent === 'Empresa real B', 'Cambiar de empresa evita mezclar registros y distingue 0 % real');
    verificar(t.dom.window.sessionStorage.getItem('movanza_empresa_activa') === '2', 'Filtrar informes no modifica el mecanismo de empresa activa');
    t.filtrar('filtro-empresa', 'todas');
    verificar(t.document.getElementById('indicador-total').textContent === '5' && t.document.getElementById('indicador-cumplimiento').textContent === '50,0 %', 'La agregación explícita solo considera las empresas propias');
    t.filtrar('filtro-periodo', 'personalizado');
    verificar(t.document.getElementById('indicador-total').textContent === '—' && t.document.getElementById('mensaje').classList.contains('error') && !t.document.getElementById('filtros-controles').disabled, 'Un período incompleto retira métricas anteriores y permite corregirlo');
    t.filtrar('fecha-inicio', '2026-10-15'); t.filtrar('fecha-fin', '2026-10-15');
    verificar(t.document.getElementById('indicador-total').textContent === '2', 'El período personalizado incluye el día correcto en Colombia');
    t.filtrar('fecha-inicio', '2026-11-01'); t.filtrar('fecha-fin', '2026-11-30');
    verificar(t.document.getElementById('indicador-total').textContent === '0' && t.document.getElementById('indicador-cumplimiento').textContent === '—', 'Sin registros, el conteo real es cero pero el porcentaje es ausente');
    t.estado.errorTabla = 'asignaciones'; t.document.getElementById('boton-actualizar-panel').click(); await esperar();
    verificar(t.document.getElementById('indicador-total').textContent === '—' && t.document.getElementById('filtros-controles').disabled && !t.document.getElementById('boton-actualizar-panel').disabled, 'Un error de consulta no muestra métricas antiguas y permite reintentar');
    t.estado.errorTabla = null; t.filtrar('filtro-periodo', 'todo'); t.document.getElementById('boton-actualizar-panel').click(); await esperar();
    verificar(t.document.getElementById('indicador-total').textContent === '5' && !t.document.getElementById('filtros-controles').disabled, 'Reintentar recupera un informe completo');
    t.document.getElementById('cerrar-sesion').click(); await esperar();
    verificar(t.document.getElementById('sitio-estadisticas').hidden && t.estado.redirecciones[0] === '../index.html', 'Cuenta retira el dashboard al cerrar sesión');
    verificar(new Set(t.estado.destruidos).size === t.estado.creados.length, 'Destruye todas las instancias al retirarse');
    t.dom.window.close();
}
{
    const t = await entorno({ sinChart: true }); await t.iniciar();
    verificar(t.document.getElementById('indicador-total').textContent === '4' && t.document.getElementById('valores-grafico-estados').textContent.includes('Finalizadas: 2'), 'Si Chart.js no carga siguen disponibles indicadores y valores accesibles');
    const lecturas = t.estado.consultas.length; t.dom.window.Chart = t.Grafico;
    t.document.getElementById('biblioteca-graficos').dispatchEvent(new t.dom.window.Event('load'));
    verificar(t.estado.creados.length === 4 && t.estado.consultas.length === lecturas, 'La biblioteca puede cargar después sin volver a consultar datos');
    t.dom.window.close();
}
for (const rol of [null, 'trabajador', 'administrador']) {
    const t = await entorno({ rol }); await t.iniciar();
    verificar(t.document.getElementById('sitio-estadisticas').hidden && !t.estado.consultas.some(q => q.tabla === 'asignaciones'), 'Sin permiso empresarial no consulta asignaciones'); t.dom.window.close();
}
{
    const t = await entorno({ consulta: '?empresa=99' }); await t.iniciar();
    verificar(t.document.getElementById('indicador-total').textContent === '—' && t.document.getElementById('mensaje').textContent.includes('empresa disponible'), 'Una empresa ajena solicitada no se convierte en agregación de otras empresas'); t.dom.window.close();
}
{
    const t = await entorno(); t.estado.asignaciones = []; await t.iniciar();
    verificar(t.document.getElementById('indicador-total').textContent === '0' && t.estado.creados.length === 0 && t.document.getElementById('tabla-detalle').textContent.includes('No hay asignaciones'), 'Una empresa sin registros presenta un estado vacío real'); t.dom.window.close();
}
{
    const t = await entorno(); t.estado.asignaciones = Array.from({ length: 501 }, (_, i) => ({ id: i + 1, trabajo_id: 20, trabajador_id: 10, titulo: 'Registro de prueba', programada_para: '2026-10-15T12:00:00Z', estado: 'pendiente', inicio_en: null, fin_en: null }));
    t.estado.asignaciones.push(t.estado.asignaciones[0]); await t.iniciar();
    verificar(t.document.getElementById('indicador-total').textContent === '501', 'Lee más de una página y no duplica un ID repetido');
    verificar(t.estado.consultas.filter(q => q.tabla === 'asignaciones').map(q => q.desde).join(',') === '0,500', 'Conserva la paginación de 500 registros'); t.dom.window.close();
}
{
    const t = await entorno(); let resolver; t.estado.esperaTabla = 'asignaciones'; t.estado.esperaConsulta = new Promise(r => { resolver = r; }); await t.iniciar();
    verificar(!t.document.querySelector('.movanza-loader').hidden, 'La lectura pendiente muestra carga real');
    t.estado.eventos.forEach(fn => fn('SIGNED_OUT', null)); resolver(); await esperar();
    verificar(t.document.getElementById('sitio-estadisticas').hidden && t.estado.creados.length === 0, 'Una respuesta pendiente no revela gráficos después de cerrar sesión'); t.dom.window.close();
}
console.log(`Estadísticas: ${comprobaciones} comprobaciones correctas.`);
