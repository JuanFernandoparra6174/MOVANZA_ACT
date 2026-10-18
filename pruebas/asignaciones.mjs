import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { encabezadoTrabajador } from '../scripts/encabezado-trabajador.js';
const { JSDOM } = await import(pathToFileURL(join(resolve(process.argv[2]), 'node_modules/jsdom/lib/api.js')));
const leer = ruta => readFile(new URL('../' + ruta, import.meta.url), 'utf8');
const esperar = () => new Promise(r => setTimeout(r, 65));
let checks = 0;
function verificar(valor, mensaje) { assert.ok(valor, mensaje); checks++; }

async function entorno({ rol = 'trabajador', sinMapa = false } = {}) {
    const dom = new JSDOM(await leer('paginas/mis_asignaciones.html'), { url: 'https://movanza.test/paginas/mis_asignaciones.html', pretendToBeVisual: true });
    const { window: w } = dom, d = w.document;
    w.matchMedia = () => ({ matches: false }); w.confirm = () => true;
    w.HTMLElement.prototype.scrollIntoView = function () {};
    w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    w.HTMLDialogElement.prototype.close = function () { this.open = false; };
    Object.defineProperty(w, 'isSecureContext', { value: true });
    const estado = { rol, usuario: rol ? { id: 'auth-7' } : null, eventos: [], rpc: [], consultas: [], redirecciones: [], gps: [], mapas: 0, capas: [],
        posicion: { latitude: 5.07, longitude: -75.51, accuracy: 5 },
        asignaciones: [
            { id: 1, trabajador_id: 7, trabajo_id: 10, titulo: 'Revisar acceso', objetivo: 'Inspección real', estado: 'aceptada', programada_para: '2026-10-19T14:00:00Z', minutos_estimados: 40 },
            { id: 2, trabajador_id: 7, trabajo_id: 10, titulo: 'Pendiente real', estado: 'pendiente', minutos_estimados: 30 },
            { id: 3, trabajador_id: 7, trabajo_id: 20, titulo: 'Actividad sin coordenadas', estado: 'en_curso', inicio_en: '2026-10-19T14:00:00Z' },
            { id: 4, trabajador_id: 999, trabajo_id: 90, titulo: 'Actividad ajena', estado: 'aceptada' }],
        trabajos: [{ id: 10, empresa_id: 2, nombre: 'Sede <b>Centro</b>', latitud: 5.07, longitud: -75.51, radio_metros: 120 }, { id: 20, empresa_id: 2, nombre: 'Punto sin ubicación', latitud: null, longitud: null, radio_metros: 30 }],
        empresas: [{ id: 2, nombre: 'Empresa real' }] };
    const gps = { getCurrentPosition(ok, fallo, opciones) { estado.gps.push(opciones); if (estado.pausarGps) estado.resolverGps = () => ok({ coords: estado.posicion }); else if (estado.errorGps) fallo({ code: estado.errorGps }); else ok({ coords: estado.posicion }); }, watchPosition() { throw new Error('No se permite seguimiento continuo'); } };
    Object.defineProperty(w.navigator, 'geolocation', { value: gps });
    let mapa;
    const L = {
        map() { estado.mapas++; mapa = { setView(centro) { estado.centro = centro; return this; }, fitBounds() { estado.encuadres = (estado.encuadres || 0) + 1; return this; }, invalidateSize() {}, removeLayer() {}, remove() { estado.mapaRetirado = true; } }; return mapa; },
        tileLayer() { return { addTo() { return this; }, on() { return this; } }; },
        featureGroup() { const grupo = { capas: [], addTo() { return this; }, clearLayers() { this.capas = []; }, getBounds() { return {}; } }; estado.grupo = grupo; return grupo; },
        divIcon(opciones) { return opciones; },
        marker(centro, opciones) { const m = { tipo: 'marker', centro, opciones, eventos: {}, addTo(capa) { capa.capas?.push(this); return this; }, bindPopup(el) { this.popup = el; return this; }, on(e, fn) { this.eventos[e] = fn; return this; }, openPopup() {}, getElement() { return d.createElement('span'); }, setZIndexOffset() {} }; estado.capas.push(m); return m; },
        circle(centro, opciones) { const c = { tipo: 'circle', centro, opciones, addTo(capa) { capa.capas?.push(this); return this; } }; estado.capas.push(c); return c; }
    };
    const supabase = {
        auth: { getUser: async () => ({ data: { user: estado.usuario } }), onAuthStateChange: cb => estado.eventos.push(cb), signOut: async () => { estado.eventos.forEach(cb => cb('SIGNED_OUT', null)); return { error: null }; } },
        from(tabla) {
            const q = { tabla, filtros: [] }; estado.consultas.push(q);
            const consulta = { select(campos) { q.campos = campos; return this; }, eq(c, v) { q.filtros.push([c, v]); return this; }, in(c, v) { q.ids = v; return this; },
                single: async () => {
                    if (estado.pausaPerfil) await estado.pausaPerfil;
                    return { data: { id: 7, rol: estado.rol, nombre_usuario: 'nombre_tecnico' }, error: null };
                },
                order: async () => { assert.equal(tabla, 'asignaciones'); assert.deepEqual(q.filtros, [['trabajador_id', 7]]); return { data: structuredClone(estado.asignaciones), error: estado.errorLectura ? new Error('Fallo de conexión') : null }; },
                then(ok, error) { return Promise.resolve({ data: structuredClone(estado[tabla].filter(x => q.ids.includes(x.id))), error: null }).then(ok, error); }
            }; return consulta;
        },
        rpc: async (nombre, datos) => {
            estado.rpc.push({ nombre, datos });
            if (estado.pausaRpc) await estado.pausaRpc;
            const a = estado.asignaciones.find(a => a.id === datos.asignacion_id);
            if (nombre !== 'responder_asignacion') {
                const radio = estado.trabajos.find(t => t.id === a.trabajo_id).radio_metros;
                if (datos.precision_metros > Math.min(radio, 50)) return { error: new Error('Precisión GPS insuficiente. Máximo permitido: ' + Math.min(radio, 50) + ' metros') };
                if (estado.fueraRadio) return { error: new Error('Fuera del radio autorizado') };
            }
            if (estado.errorRpc) return { error: new Error('No autorizado') };
            if (nombre === 'responder_asignacion') { a.estado = datos.aceptar ? 'aceptada' : 'rechazada'; a.motivo_rechazo = datos.motivo_rechazo; }
            if (nombre === 'iniciar_asignacion') { a.estado = 'en_curso'; a.inicio_en = '2026-10-19T14:00:00Z'; }
            if (nombre === 'finalizar_asignacion') { a.estado = 'finalizada'; a.fin_en = '2026-10-19T14:30:00Z'; a.objetivo_cumplido = datos.objetivo_cumplido; a.nota_finalizacion = datos.nota_finalizacion; }
            return { error: null };
        }
    };
    const contexto = vm.createContext({ document: d, window: w, navigator: w.navigator, sessionStorage: w.sessionStorage, URL, ...(sinMapa ? {} : { L }), location: { replace: url => estado.redirecciones.push(url) }, console: { error() {} } });
    const proveedor = new vm.SyntheticModule(['supabase'], function () { this.setExport('supabase', supabase); }, { context: contexto });
    const cache = new Map();
    async function cargar(nombre) {
        if (cache.has(nombre)) return cache.get(nombre);
        const m = new vm.SourceTextModule((nombre === 'alertas.js' ? await readFile(new URL('./alertas-simuladas.js', import.meta.url), 'utf8') : await leer('scripts/' + nombre)), { context: contexto, initializeImportMeta(meta) { meta.url = 'https://movanza.test/scripts/' + nombre; },
            importModuleDynamically: async ruta => { const mod = await cargar(ruta.replace('./', '')); await mod.evaluate(); return mod; } });
        cache.set(nombre, m); await m.link(ruta => ruta.includes('supabase.js') ? proveedor : cargar(ruta.replace('./', ''))); return m;
    }
    new vm.Script(await leer('scripts/componentes-publicos.js')).runInContext(contexto);
    async function iniciar() { const m = await cargar('asignaciones-interfaz.js'); await m.evaluate(); await m.namespace.iniciarMisAsignaciones(); await esperar(); }
    const click = async selector => { const e = d.querySelector(selector); assert.ok(e, selector); e.click(); await esperar(); };
    const boton = texto => [...d.querySelectorAll('#contenido-detalle button')].find(b => b.textContent.includes(texto));
    const enviar = async id => { d.getElementById(id).dispatchEvent(new w.Event('submit', { cancelable: true })); await esperar(); };
    return { dom, w, d, estado, iniciar, click, boton, enviar };
}
{
    const t = await entorno(); verificar(t.d.querySelector('main').hidden, 'Oculto antes de verificar acceso'); await t.iniciar();
    verificar(!t.d.querySelector('main').hidden && t.estado.mapas === 1, 'Una única instancia de Leaflet después de verificar rol');
    verificar(t.estado.consultas.length === 4 && t.estado.gps.length === 0, 'Reutiliza lecturas por trabajador sin consultar GPS al cargar');
    verificar(t.d.querySelectorAll('.asignacion-card').length === 3 && !t.d.getElementById('lista-asignaciones').textContent.includes('ajena'), 'Solo muestra asignaciones reales del trabajador');
    verificar(t.d.querySelectorAll('.sin-coordenadas').length === 1, 'Asignación sin coordenadas permanece en la lista');
    verificar(t.estado.capas.filter(c => c.tipo === 'marker').length === 1 && t.estado.capas.find(c => c.tipo === 'circle').opciones.radius === 120, 'Agrupa por trabajo y dibuja radio real');
    t.estado.grupo.capas.find(c => c.tipo === 'marker').eventos.click();
    verificar(t.d.querySelector('[data-asignacion="1"]').getAttribute('aria-pressed') === 'true' && t.boton('iniciar'), 'Seleccionar marcador sincroniza lista y acciones del detalle');
    t.d.getElementById('filtro-estado').value = 'en_curso'; t.d.getElementById('filtro-estado').dispatchEvent(new t.w.Event('change'));
    verificar(t.estado.grupo.capas.length === 0 && t.d.querySelectorAll('.asignacion-card').length === 1, 'Filtro sincroniza marcadores y lista, conservando actividad sin coordenadas');
    t.d.getElementById('filtro-estado').value = 'todas'; t.d.getElementById('filtro-estado').dispatchEvent(new t.w.Event('change'));
    verificar(t.d.getElementById('total-pendientes').textContent === '1' && t.d.getElementById('total-en-curso').textContent === '1', 'Resumen cuenta los estados reales');
    const header = new JSDOM(encabezadoTrabajador({ raiz: '../', actual: 'mis_asignaciones' }));
    verificar(header.window.document.querySelector('header').outerHTML === t.d.querySelector('header').outerHTML, 'Encabezado exacto reutilizado y Mis asignaciones activo'); header.window.close();
    verificar(!t.d.querySelector('.banner-asignaciones').textContent.includes('nombre_tecnico'), 'Banner sin identificadores técnicos');
    const index = new JSDOM(await leer('index.html')); const footer = index.window.document.querySelector('footer'); footer.querySelectorAll('a[href^="#"]').forEach(a => a.setAttribute('href', '../index.html' + a.getAttribute('href')));
    verificar(footer.outerHTML === t.d.querySelector('footer').outerHTML, 'Footer compartido sin cambios de contenido'); index.window.close();
    for (const el of t.d.querySelectorAll('link[href^="../"], script[src^="../"], img[src^="../"], a[href^="../"]')) { await access(new URL(el.getAttribute('href') || el.getAttribute('src'), new URL('../paginas/', import.meta.url))); checks++; }
    await t.click('[data-asignacion="1"]');
    verificar(t.d.querySelector('.asignacion-card.seleccionada') && t.boton('iniciar') && !t.boton('Finalizar'), 'Seleccionar card muestra detalle y acciones del estado aceptado');
    verificar(t.d.getElementById('contenido-detalle').textContent.includes('Sede <b>Centro</b>') && !t.d.getElementById('contenido-detalle').querySelector('b'), 'Inserta datos como texto seguro');
    await t.click('#ubicarme');
    verificar(t.estado.gps.length === 1 && t.estado.rpc.length === 0, 'Ubicarme consulta GPS solo por acción explícita y no escribe');
    verificar(t.estado.capas.some(c => c.tipo === 'marker' && c.opciones.icon.className === 'pin-personal') && t.estado.capas.some(c => c.opciones?.dashArray === '5 5' && c.opciones.radius === 5), 'Posición personal y círculo de precisión se distinguen del radio autorizado');
    verificar(t.estado.gps[0].enableHighAccuracy && t.estado.gps[0].maximumAge === 0 && t.estado.gps[0].timeout === 20000, 'Conserva opciones de geolocalización');
    t.estado.posicion.accuracy = 80; t.boton('iniciar').click(); await esperar();
    verificar(t.estado.asignaciones[0].estado === 'aceptada' && t.d.getElementById('mensaje').textContent.includes('insuficiente'), 'Precisión insuficiente rechazada por servidor conserva estado');
    t.estado.posicion.accuracy = 5; t.estado.fueraRadio = true; t.boton('iniciar').click(); await esperar();
    verificar(t.estado.asignaciones[0].estado === 'aceptada' && t.d.getElementById('mensaje').textContent.includes('fuera del área'), 'Fuera de radio no inicia y muestra mensaje claro');
    t.estado.fueraRadio = false; let resolver; t.estado.pausaRpc = new Promise(r => resolver = r);
    t.boton('iniciar').click(); t.boton('iniciar').click(); await esperar();
    verificar(t.d.getElementById('carga-asignaciones').hidden === false && t.estado.rpc.length === 3, 'Procesamiento real y sin envíos duplicados');
    resolver(); await esperar(); t.estado.pausaRpc = null;
    verificar(t.estado.asignaciones[0].estado === 'en_curso' && t.boton('Finalizar') && !t.boton('iniciar'), 'Inicio confirmado actualiza acciones desde servidor');
    verificar(t.estado.rpc.at(-1).datos.precision_metros === 5 && !('inicio_en' in t.estado.rpc.at(-1).datos), 'RPC original GPS sin tiempos enviados por cliente');
    t.boton('Finalizar').click(); await esperar();
    verificar(t.d.getElementById('acciones-asignacion').open, 'Formulario de finalización en modal accesible');
    t.d.getElementById('objetivo-cumplido').value = 'no'; await t.enviar('formulario-finalizacion');
    verificar(t.d.getElementById('mensaje').textContent.includes('explicar') && t.estado.gps.length === 4, 'No finaliza sin explicar objetivo incumplido');
    t.d.getElementById('objetivo-cumplido').value = 'si'; t.estado.fueraRadio = true; await t.enviar('formulario-finalizacion');
    verificar(t.estado.asignaciones[0].estado === 'en_curso' && t.d.getElementById('acciones-asignacion').open && t.d.getElementById('mensaje').textContent.includes('fuera del área'), 'Finalizar vuelve a obtener GPS y no permite salir del radio');
    t.estado.fueraRadio = false; await t.enviar('formulario-finalizacion');
    verificar(t.estado.asignaciones[0].estado === 'finalizada' && !t.d.getElementById('acciones-asignacion').open, 'Solo cierra y confirma al finalizar correctamente');
    verificar(t.d.getElementById('contenido-detalle').textContent.includes('0 h 30 min 0 s') && !t.boton('Finalizar'), 'Duración desde marcas del servidor sin edición manual');
    t.d.getElementById('filtro-estado').value = 'pendiente'; t.d.getElementById('filtro-estado').dispatchEvent(new t.w.Event('change'));
    verificar(t.d.querySelectorAll('.asignacion-card').length === 1 && !t.d.getElementById('contenido-detalle').textContent.includes('Duración real'), 'Filtrar lista retira detalle que deja de ser visible');
    await t.click('[data-asignacion="2"]'); t.boton('Rechazar').click(); await esperar();
    t.d.getElementById('motivo-rechazo').value = 'Motivo real'; t.w.confirm = () => false; await t.click('#boton-cancelar-rechazo');
    verificar(t.d.getElementById('acciones-asignacion').open, 'Cancelar protege los cambios del formulario');
    t.w.confirm = () => true; await t.enviar('formulario-rechazo');
    verificar(t.estado.asignaciones[1].estado === 'rechazada' && t.estado.rpc.at(-1).nombre === 'responder_asignacion', 'Rechazo conserva RPC y motivo');
    t.d.getElementById('buscar-asignaciones').value = 'No existe'; t.d.getElementById('buscar-asignaciones').dispatchEvent(new t.w.Event('input'));
    verificar(t.d.querySelectorAll('.asignacion-card').length === 0 && t.d.getElementById('lista-asignaciones').textContent.includes('filtros'), 'Buscador real y estado sin coincidencias');
    t.estado.eventos.forEach(cb => cb('SIGNED_OUT', null));
    verificar(t.d.getElementById('sitio-asignaciones').hidden && t.estado.mapaRetirado && t.estado.redirecciones[0] === '../login.html', 'Salida limpia mapa y datos del usuario'); t.dom.window.close();
}
{
    const t = await entorno(); await t.iniciar(); t.estado.errorGps = 1; await t.click('#ubicarme');
    verificar(t.d.getElementById('mensaje').textContent.includes('permisos de este sitio') && t.estado.rpc.length === 0, 'Permiso denegado explica cómo habilitar ubicación');
    t.estado.errorGps = 2; await t.click('#ubicarme'); verificar(t.d.getElementById('mensaje').textContent.includes('GPS esté disponible'), 'Ubicación no disponible informa sin enviar operaciones');
    t.estado.errorGps = 3; await t.click('#ubicarme'); verificar(t.d.getElementById('mensaje').textContent.includes('tardó demasiado'), 'Timeout GPS permite reintentar');
    t.estado.errorGps = null; t.estado.pausarGps = true; await t.click('[data-asignacion="1"]'); t.boton('iniciar').click(); await esperar();
    t.estado.eventos.forEach(cb => cb('SIGNED_OUT', null)); t.estado.resolverGps(); await esperar();
    verificar(t.estado.rpc.length === 0, 'Respuesta GPS tardía tras logout no envía operaciones'); t.dom.window.close();
}
{
    const t = await entorno({ sinMapa: true }); await t.iniciar();
    verificar(!t.d.getElementById('error-mapa').hidden && t.d.querySelectorAll('.asignacion-card').length === 3, 'Fallo de Leaflet no impide consultar asignaciones');
    t.estado.errorLectura = true; await t.click('#boton-actualizar'); verificar(t.d.getElementById('mensaje').getAttribute('role') === 'alert', 'Error de conexión comprensible');
    t.estado.errorLectura = false; t.estado.asignaciones = []; await t.click('#boton-actualizar');
    verificar(t.d.getElementById('lista-asignaciones').textContent.includes('Aún no tienes'), 'Reintento y estado vacío sin datos ficticios'); t.dom.window.close();
}
{
    const t = await entorno(); await t.iniciar(); await t.click('[data-asignacion="2"]'); t.boton('Aceptar').click(); await esperar();
    verificar(t.estado.asignaciones[1].estado === 'aceptada' && t.estado.rpc[0].datos.aceptar === true && t.boton('iniciar'), 'Aceptar conserva la transición y habilita la acción de inicio'); t.dom.window.close();
}
{
    const t = await entorno(); let resolver; t.estado.pausaPerfil = new Promise(r => resolver = r);
    const iniciando = t.iniciar(); await esperar(); t.estado.eventos.forEach(cb => cb('SIGNED_OUT', null)); resolver(); await iniciando;
    verificar(t.estado.mapas === 0 && !t.estado.consultas.some(q => q.tabla === 'asignaciones') && t.d.querySelector('main').hidden, 'Sesión que termina durante verificación no inicia lecturas ni mapa'); t.dom.window.close();
}
for (const rol of ['empresa', 'administrador', null]) {
    const t = await entorno({ rol }); await t.iniciar();
    verificar(t.d.querySelector('main').hidden && t.estado.mapas === 0 && !t.estado.consultas.some(q => q.tabla === 'asignaciones'), 'Acceso restringido antes de cargar datos o mapa: ' + rol); t.dom.window.close();
}
console.log(`Mis asignaciones: ${checks} comprobaciones correctas.`);
