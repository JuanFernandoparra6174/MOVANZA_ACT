import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { encabezadoEmpresarial } from '../scripts/encabezado-empresarial.js';
if (!process.argv[2]) throw new Error('Indica el directorio temporal con jsdom.');
const { JSDOM } = await import(pathToFileURL(join(resolve(process.argv[2]), 'node_modules/jsdom/lib/api.js')));
const leer = ruta => readFile(new URL('../' + ruta, import.meta.url), 'utf8');
const esperar = () => new Promise(r => setTimeout(r, 70));
let comprobaciones = 0;
function verificar(valor, mensaje) { assert.ok(valor, mensaje); comprobaciones++; }
async function entorno({ rol = 'empresa', id = '2', movil = false } = {}) {
    const dom = new JSDOM(await leer('paginas/trabajos.html'), { url: 'https://movanza.example/paginas/trabajos.html' });
    const w = dom.window;
    const estilos = w.document.createElement('style');
    estilos.textContent = await leer('estilos/general.css') + '\n' + await leer('estilos/trabajos.css');
    w.document.head.append(estilos);
    w.matchMedia = consulta => ({ matches: consulta.includes('max-width') && movil, addEventListener() {} });
    w.HTMLElement.prototype.scrollIntoView = function () {};
    w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    w.HTMLDialogElement.prototype.close = function () { this.open = false; };
    w.confirm = () => true;
    if (id !== null) w.sessionStorage.setItem('movanza_empresa_activa', id);
    const estado = { rol, usuario: rol ? { id: 'auth-7' } : null, consultas: [], rpc: [], eventos: [], redirecciones: [], marcadores: [],
        trabajos: [{ id: 20, empresa_id: 2, nombre: 'Punto real', latitud: 5.07, longitud: -75.51, radio_metros: 100, creado_en: '2026-10-17' }, { id: 21, empresa_id: 2, nombre: 'Punto en curso', latitud: 5.08, longitud: -75.52, radio_metros: 120, creado_en: '2026-10-17' }, { id: 99, empresa_id: 99, nombre: 'Ajeno', latitud: 0, longitud: 0 }],
        tareas: [{ id: 100, trabajo_id: 20, trabajador_id: 10, titulo: 'Tarea real', objetivo: 'Objetivo real', programada_para: '2026-11-01T10:00:00Z', minutos_estimados: 60, estado: 'pendiente', inicio_en: null, fin_en: null }, { id: 101, trabajo_id: 21, trabajador_id: 10, titulo: 'En ejecución', objetivo: 'Objetivo', programada_para: '2026-11-01T10:00:00Z', minutos_estimados: 60, estado: 'en_curso', inicio_en: '2026-11-01T10:00:00Z', fin_en: null }]
    };
    const mapa = { eventos: {}, centro: { lat: 5.07, lng: -75.51 }, setView(p) { this.centro = { lat: p[0], lng: p[1] }; return this; }, on(n, fn) { this.eventos[n] = fn; return this; }, fitBounds() { return this; }, removeLayer() {}, invalidateSize() { estado.redimensiones = (estado.redimensiones || 0) + 1; }, getCenter() { return this.centro; } };
    const capa = { layers: [], addTo() { return this; }, clearLayers() { this.layers = []; }, getBounds() { return []; } };
    const L = { map() { estado.mapaIniciado = true; return mapa; }, tileLayer() { return { addTo() {} }; }, featureGroup() { return capa; },
        marker(p) {
            const nodo = w.document.createElement('span');
            const marcador = { centro: p, eventos: {}, addTo(c) { c.layers?.push(this); return this; }, bindPopup(contenido) { this.popup = contenido; return this; }, on(n, fn) { this.eventos[n] = fn; return this; }, getElement() { return nodo; }, setZIndexOffset(z) { this.z = z; } };
            estado.marcadores.push(marcador); return marcador;
        }, circle(p, opciones) { return { centro: p, opciones, addTo(c) { c.layers?.push(this); return this; }, setRadius(r) { this.opciones.radius = r; } }; }
    };
    const supabase = {
        auth: {
            getUser: async () => ({ data: { user: estado.usuario }, error: null }),
            onAuthStateChange: fn => estado.eventos.push(fn),
            signOut: async () => { if (estado.errorSalida) return { error: new Error('Fallo de red') }; estado.eventos.forEach(fn => fn('SIGNED_OUT', null)); return { error: null }; }
        },
        from: tabla => {
            const q = { tabla, filtros: [] }; estado.consultas.push(q);
            const responder = async () => {
                if (estado.esperaConsulta === tabla) await estado.esperaLectura;
                if (estado.errorTabla === tabla) return { data: null, error: new Error('Error consultando ' + tabla) };
                if (tabla === 'perfiles' && !q.ids) return { data: { id: 7, rol: estado.rol, nombre_usuario: 'empresa_real' }, error: null };
                if (tabla === 'empresas') {
                    assert.deepEqual(q.filtros, [['id', id], ['propietario_id', 7]]);
                    return estado.empresaAjena ? { data: null, error: { code: 'PGRST116' } } : { data: { id: 2, nombre: 'Empresa real', propietario_id: 7 }, error: null };
                }
                if (tabla === 'membresias') {
                    assert.equal(q.campos, 'trabajador_id, alias_interno'); assert.deepEqual(q.filtros, [['empresa_id', 2], ['estado', 'activa']]);
                    return { data: estado.sinTrabajadores ? [] : [{ trabajador_id: 10, alias_interno: 'Alias real' }], error: null };
                }
                if (tabla === 'perfiles') { assert.deepEqual(q.ids, [10]); return { data: [{ id: 10, nombre_usuario: 'trabajador_real', nombre_completo: 'Nombre real' }], error: null }; }
                if (tabla === 'trabajos') {
                    assert.equal(q.campos, 'id, empresa_id, nombre, latitud, longitud, radio_metros, creado_en'); assert.deepEqual(q.filtros, [['empresa_id', 2]]);
                    return { data: estado.trabajos.filter(t => t.empresa_id === 2), error: null };
                }
                if (tabla === 'asignaciones') {
                    assert.equal(q.columnaIn, 'trabajo_id'); assert.ok(!q.ids.includes(99));
                    return { data: estado.tareas.filter(t => q.ids.includes(t.trabajo_id)), error: null };
                }
                throw new Error('Consulta inesperada: ' + tabla);
            };
            return { select(campos) { q.campos = campos; return this; }, eq(c, v) { q.filtros.push([c, v]); return this; },
                in(c, ids) { q.columnaIn = c; q.ids = [...ids]; return this; }, order(c, opciones) { q.orden = [c, opciones]; return responder(); }, single: responder,
                then(resolve, reject) { return responder().then(resolve, reject); } };
        },
        rpc: async (nombre, datos) => {
            estado.rpc.push({ nombre, datos });
            if (estado.esperaRPC === nombre) await estado.esperaOperacion;
            if (estado.errorRPC === nombre) return { data: null, error: new Error('Fallo de ' + nombre) };
            if (nombre === 'crear_trabajo') { estado.trabajos.push({ id: 30, ...datos, creado_en: '2026-10-17' }); return { data: 30, error: null }; }
            if (nombre === 'crear_asignacion') estado.tareas.push({ id: 300 + estado.tareas.length, ...datos, estado: 'pendiente', inicio_en: null, fin_en: null });
            if (nombre === 'editar_trabajo') Object.assign(estado.trabajos.find(t => t.id === datos.trabajo_id), datos);
            if (nombre === 'editar_asignacion') Object.assign(estado.tareas.find(t => t.id === datos.asignacion_id), datos);
            if (nombre === 'cancelar_asignacion') estado.tareas.find(t => t.id === datos.asignacion_id).estado = 'cancelada';
            if (nombre === 'cancelar_trabajo') estado.tareas.filter(t => t.trabajo_id === datos.trabajo_id && ['pendiente', 'aceptada'].includes(t.estado)).forEach(t => { t.estado = 'cancelada'; });
            return { data: null, error: null };
        }
    };
    const contexto = vm.createContext({ document: w.document, window: w, sessionStorage: w.sessionStorage, L,
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
        new vm.Script(await leer('scripts/trabajos-carga.js'), { importModuleDynamically: () => importacion = (async () => {
            if (estado.errorCarga) throw new Error('CDN no disponible'); const m = await cargar('trabajos-interfaz.js'); await m.evaluate(); return m;
        })() }).runInContext(contexto);
        await importacion?.catch(() => {}); await esperar();
    }
    function seleccionar(id = 20) { estado.marcadores.find(m => m.popup && m.centro[0] === estado.trabajos.find(t => t.id === id).latitud).eventos.click(); }
    function boton(texto) { return [...w.document.querySelectorAll('#panel-trabajo button')].find(b => b.textContent.trim() === texto); }
    function enviar(idForm) { w.document.getElementById(idForm).dispatchEvent(new w.Event('submit', { cancelable: true })); }
    function completar() {
        const valores = { 'nombre-trabajo': 'Nuevo punto', 'radio-trabajo': '150', 'titulo-asignacion': 'Nueva tarea', 'objetivo-asignacion': 'Objetivo nuevo', 'fecha-asignacion': '2026-11-01T10:00', 'minutos-asignacion': '90' };
        for (const [id, valor] of Object.entries(valores)) w.document.getElementById(id).value = valor;
        const trabajador = w.document.querySelector('[name="trabajador"]'); if (trabajador) trabajador.checked = true;
    }
    return { dom, document: w.document, estado, iniciar, mapa, capa, seleccionar, boton, enviar, completar };
}

{
    const t = await entorno(); verificar(t.document.getElementById('sitio-trabajos').hidden, 'El módulo empieza oculto'); await t.iniciar();
    verificar(!t.document.getElementById('sitio-trabajos').hidden && t.estado.mapaIniciado, 'Carga el módulo autorizado y el mapa Leaflet');
    verificar(t.document.getElementById('nombre-empresa').textContent === 'Empresa real', 'El banner identifica la empresa real');
    verificar(t.document.getElementById('titulo-trabajos').textContent === 'Organiza y gestiona tus trabajos', 'El banner usa el título solicitado');
    verificar(t.document.getElementById('cantidad-trabajos').textContent === '2' && t.document.querySelectorAll('.catalogo-puntos .grid-1-5').length === 2 && !t.document.querySelector('main').textContent.includes('Ajeno'), 'El catálogo solo utiliza puntos reales de la empresa activa');
    verificar(t.document.getElementById('seccion-crear').classList.contains('oculto') && t.document.getElementById('seccion-editar-trabajo').classList.contains('oculto'), 'Los formularios no aparecen permanentemente');
    const cabecera = new JSDOM(encabezadoEmpresarial({ raiz: '../', actual: 'trabajos' })); const esperado = cabecera.window.document.querySelector('header');
    esperado.querySelector('#usuario-empresarial').textContent = 'empresa_real'; esperado.querySelector('[data-estadisticas-empresa]').setAttribute('href', './estadisticas.html?empresa=2');
    verificar(t.document.querySelector('header').outerHTML === esperado.outerHTML, 'Reutiliza el encabezado con Trabajos activo'); cabecera.window.close();
    const indice = new JSDOM(await leer('index.html')); const pie = indice.window.document.querySelector('footer').cloneNode(true);
    pie.querySelectorAll('a[href^="#"]').forEach(a => a.setAttribute('href', '../index.html' + a.getAttribute('href')));
    verificar(t.document.querySelector('footer').outerHTML === pie.outerHTML, 'Conserva el footer completo del Index'); indice.window.close();
    for (const recurso of t.document.querySelectorAll('img[src], link[href^="../"], script[src^="../"], a[href^="../"], a[href^="./"]')) {
        const ruta = decodeURIComponent(recurso.getAttribute('src') || recurso.getAttribute('href')).split(/[?#]/)[0]; await access(new URL('../paginas/' + ruta, import.meta.url)); comprobaciones++;
    }
    const original = new JSDOM(await leer('componentes/trabajos-formularios.html'));
    for (const campo of original.window.document.querySelectorAll('input[id], textarea[id]')) {
        const actual = t.document.getElementById(campo.id);
        for (const atributo of ['type', 'min', 'max', 'minlength', 'maxlength', 'required']) verificar(actual.getAttribute(atributo) === campo.getAttribute(atributo), 'Conserva el campo y sus restricciones: ' + campo.id + '/' + atributo);
    }
    original.window.close();
    t.document.getElementById('tab-lista').click();
    verificar(t.document.getElementById('vista-mapa').hidden && !t.document.getElementById('vista-lista').hidden, 'Mapa y lista alternan sin competir');
    t.document.querySelector('.catalogo-puntos button').click(); await esperar();
    verificar(t.document.getElementById('detalle-contenido').textContent.includes('Punto real') && t.document.querySelector('.catalogo-puntos .empresa-seleccionada'), 'Seleccionar desde la lista abre la card y marca el origen');
    verificar(t.dom.window.getComputedStyle(t.document.getElementById('panel-inicial')).display === 'none' && t.dom.window.getComputedStyle(t.document.getElementById('seccion-crear')).display === 'none', 'El CSS oculta los estados inactivos de la card');
    verificar(t.document.querySelector('.asignacion-desplegable summary').textContent.includes('Tarea real'), 'Las asignaciones conservan detalle y acciones desplegables');
    t.boton('Editar trabajo').click();
    verificar(!t.document.getElementById('seccion-editar-trabajo').classList.contains('oculto') && t.document.getElementById('editar-nombre-trabajo').value === 'Punto real', 'Editar usa el mismo panel y los datos existentes');
    t.document.getElementById('editar-nombre-trabajo').value = 'Punto editado'; t.enviar('formulario-editar-trabajo'); await esperar();
    const edicion = t.estado.rpc.find(r => r.nombre === 'editar_trabajo');
    verificar(edicion.datos.trabajo_id === 20 && edicion.datos.nombre === 'Punto editado' && edicion.datos.latitud === 5.07, 'Conserva la RPC y los parámetros de edición');
    verificar(t.document.getElementById('detalle-contenido').textContent.includes('Punto editado'), 'El panel refleja los datos actualizados');
    t.boton('Editar').click(); t.document.getElementById('editar-titulo').value = 'Tarea editada'; t.enviar('formulario-editar-asignacion'); await esperar();
    verificar(t.estado.rpc.some(r => r.nombre === 'editar_asignacion' && r.datos.asignacion_id === 100 && r.datos.titulo === 'Tarea editada'), 'Conserva la edición de asignaciones');
    t.dom.window.confirm = () => false; t.boton('Cancelar pendientes').click(); await esperar();
    verificar(!t.estado.rpc.some(r => r.nombre === 'cancelar_trabajo'), 'No cancela sin confirmación');
    let confirmacion; t.dom.window.confirm = texto => { confirmacion = texto; return true; }; t.boton('Cancelar pendientes').click(); await esperar();
    verificar(confirmacion.includes('#20') && t.estado.rpc.some(r => r.nombre === 'cancelar_trabajo' && r.datos.trabajo_id === 20), 'Identifica el registro y mantiene la cancelación sin borrar historial');
    t.seleccionar(21); await esperar();
    verificar(!t.boton('Editar trabajo') && !t.boton('Agregar asignaciones') && !t.boton('Cancelar pendientes'), 'Respeta las restricciones de trabajos en ejecución');
    t.document.getElementById('nuevo-punto').click(); await esperar(); t.completar();
    t.mapa.eventos.click({ latlng: { lat: 5.1, lng: -75.6 } });
    t.enviar('formulario-trabajo'); await esperar();
    const creacion = t.estado.rpc.find(r => r.nombre === 'crear_trabajo');
    verificar(creacion.datos.empresa_id === 2 && creacion.datos.latitud === 5.1 && creacion.datos.longitud === -75.6 && creacion.datos.radio_metros === 150, 'Crear conserva empresa, ubicación y radio');
    verificar(t.estado.rpc.some(r => r.nombre === 'crear_asignacion' && r.datos.trabajo_id === 30 && r.datos.trabajador_id === 10 && r.datos.minutos_estimados === 90), 'Crea una asignación por trabajador mediante la RPC original');
    verificar(t.document.getElementById('detalle-contenido').textContent.includes('Nuevo punto') && t.document.getElementById('cantidad-trabajos').textContent === '3', 'El éxito actualiza el catálogo y abre el punto real creado');
    t.boton('Agregar asignaciones').click();
    verificar(t.document.getElementById('nombre-trabajo').readOnly && t.document.getElementById('radio-trabajo').disabled, 'Agregar asignaciones mantiene los campos de punto bloqueados');
    t.completar(); t.enviar('formulario-trabajo'); await esperar();
    verificar(t.estado.rpc.filter(r => r.nombre === 'crear_trabajo').length === 1 && t.estado.rpc.filter(r => r.nombre === 'crear_asignacion').length === 2, 'Agregar no crea un punto nuevo');
    t.document.getElementById('cerrar-sesion').click(); await esperar();
    verificar(t.document.getElementById('sitio-trabajos').hidden && t.estado.redirecciones[0] === '../index.html', 'Cuenta cierra sesión y retira la interfaz');
    t.dom.window.close();
}
{
    const t = await entorno({ movil: true }); await t.iniciar(); t.seleccionar(); await esperar();
    verificar(t.document.getElementById('panel-movil').open && t.document.getElementById('panel-movil').contains(t.document.getElementById('panel-trabajo')), 'En móvil la card real pasa a un diálogo nativo');
    t.boton('Editar trabajo').click(); t.document.getElementById('editar-nombre-trabajo').value = 'Sin guardar';
    t.dom.window.confirm = () => false; t.document.getElementById('panel-movil').dispatchEvent(new t.dom.window.Event('cancel', { cancelable: true })); await esperar();
    verificar(t.document.getElementById('panel-movil').open && t.document.getElementById('editar-nombre-trabajo').value === 'Sin guardar', 'Escape solicita confirmación y conserva los cambios al rechazar');
    t.document.getElementById('elegir-ubicacion').click();
    verificar(!t.document.getElementById('panel-movil').open && !t.document.getElementById('volver-card').hidden, 'Elegir ubicación deja visible el mapa y permite volver sin perder el formulario');
    t.mapa.eventos.click({ latlng: { lat: 5.2, lng: -75.4 } });
    verificar(t.document.getElementById('panel-movil').open && t.document.getElementById('editar-nombre-trabajo').value === 'Sin guardar' && t.document.getElementById('latitud-seleccionada').textContent === '5.200000', 'Seleccionar ubicación reabre la misma edición y conserva sus valores');
    t.estado.errorRPC = 'editar_trabajo'; t.enviar('formulario-editar-trabajo'); await esperar();
    verificar(t.document.getElementById('panel-movil').open && t.document.getElementById('mensaje').classList.contains('error') && t.document.getElementById('editar-nombre-trabajo').value === 'Sin guardar', 'Un error mantiene la card y los cambios visibles');
    verificar(t.document.getElementById('mensajes-panel').contains(t.document.getElementById('mensaje')), 'El error queda dentro de la card móvil accesible');
    t.dom.window.confirm = () => true; t.document.getElementById('cancelar-panel').click(); await esperar();
    verificar(!t.document.getElementById('panel-movil').open, 'Cancelar confirmado cierra la card');
    t.dom.window.close();
}
{
    const t = await entorno(); await t.iniciar(); t.document.getElementById('nuevo-punto').click(); await esperar(); t.completar();
    t.enviar('formulario-trabajo'); await esperar();
    verificar(t.estado.rpc.length === 0 && t.document.getElementById('mensaje').textContent.includes('ubicación'), 'Conserva la validación de ubicación');
    t.mapa.eventos.click({ latlng: { lat: 5, lng: -75 } });
    let resolver; t.estado.esperaRPC = 'crear_asignacion'; t.estado.esperaOperacion = new Promise(r => { resolver = r; });
    t.enviar('formulario-trabajo'); t.enviar('formulario-trabajo'); await esperar();
    verificar(t.estado.rpc.filter(r => r.nombre === 'crear_trabajo').length === 1 && !t.document.querySelector('#estado-operacion .movanza-loader').hidden, 'La espera real muestra carga e impide envíos duplicados');
    t.document.getElementById('cancelar-panel').click(); await esperar();
    verificar(!t.document.getElementById('seccion-crear').classList.contains('oculto'), 'No se cierra el formulario durante una operación crítica');
    t.estado.errorRPC = 'crear_asignacion'; resolver(); await esperar();
    verificar(t.document.getElementById('nombre-trabajo').value === 'Nuevo punto' && t.document.getElementById('mensaje').textContent.includes('Asignaciones guardadas: 0/1') && t.document.querySelector('#estado-operacion .movanza-loader').hidden, 'Un éxito parcial conserva campos y el mensaje original, sin simular atomicidad');
    verificar(!t.document.getElementById('boton-guardar-trabajo').disabled && !t.document.getElementById('cerrar-panel').disabled, 'El error finaliza carga y permite decidir cómo continuar');
    t.dom.window.close();
}
{
    const t = await entorno(); await t.iniciar();
    t.document.getElementById('usar-centro').click();
    verificar(!t.document.getElementById('seccion-crear').classList.contains('oculto') && t.document.getElementById('latitud-seleccionada').textContent === t.mapa.centro.lat.toFixed(6), 'El centro del mapa permite seleccionar una ubicación mediante teclado');
    t.dom.window.confirm = () => false; t.document.getElementById('cancelar-panel').click(); await esperar();
    verificar(!t.document.getElementById('seccion-crear').classList.contains('oculto'), 'Una ubicación sin guardar también exige confirmación');
    t.dom.window.confirm = () => true; t.document.getElementById('cancelar-panel').click(); await esperar();
    t.seleccionar(); await esperar(); t.boton('Cancelar').click(); await esperar();
    verificar(t.estado.rpc.some(r => r.nombre === 'cancelar_asignacion' && r.datos.asignacion_id === 100) && t.estado.tareas[0].estado === 'cancelada', 'La cancelación individual mantiene su RPC e historial');
    verificar(!t.estado.rpc.some(r => /eliminar|borrar|delete/.test(r.nombre)), 'No introduce operaciones de borrado inexistentes');
    t.dom.window.close();
}
for (const rol of [null, 'trabajador', 'administrador']) {
    const t = await entorno({ rol }); await t.iniciar();
    verificar(t.document.getElementById('sitio-trabajos').hidden && !t.estado.mapaIniciado && !t.estado.consultas.some(c => c.tabla === 'trabajos'), 'Sin permiso no carga mapa ni trabajos'); t.dom.window.close();
}
for (const id of [null, 'inválido']) {
    const t = await entorno({ id }); await t.iniciar();
    verificar(!t.estado.mapaIniciado && t.document.getElementById('nuevo-punto').disabled && t.document.getElementById('mensaje').classList.contains('error'), 'El contexto inválido conserva el error y bloquea la creación'); t.dom.window.close();
}
{
    const t = await entorno(); t.estado.empresaAjena = true; await t.iniciar();
    verificar(!t.estado.mapaIniciado && !t.estado.consultas.some(c => c.tabla === 'trabajos'), 'No consulta trabajos de empresas ajenas'); t.dom.window.close();
}
for (const errorTabla of ['perfiles', 'trabajos']) {
    const t = await entorno(); t.estado.errorTabla = errorTabla; await t.iniciar();
    verificar(t.document.querySelector('.movanza-loader').hidden && (t.document.querySelector('[role="alert"]') || t.document.getElementById('mensaje').classList.contains('error')), 'Los errores de consulta finalizan el estado de carga'); t.dom.window.close();
}
{
    const t = await entorno(); let resolver; t.estado.esperaConsulta = 'empresas'; t.estado.esperaLectura = new Promise(r => { resolver = r; }); await t.iniciar();
    t.estado.eventos.forEach(fn => fn('SIGNED_OUT', null)); resolver(); await esperar();
    verificar(t.document.getElementById('sitio-trabajos').hidden, 'Una respuesta pendiente no revela contenido tras cerrar sesión'); t.dom.window.close();
}
console.log(`Trabajos: ${comprobaciones} comprobaciones correctas.`);
