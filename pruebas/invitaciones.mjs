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

async function entorno(rol = 'trabajador') {
    const dom = new JSDOM(await leer('paginas/mis_invitaciones.html'), { url: 'https://movanza.test/paginas/mis_invitaciones.html', pretendToBeVisual: true });
    const w = dom.window, d = w.document;
    w.matchMedia = () => ({ matches: true });
    w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    w.HTMLDialogElement.prototype.close = function () { this.open = false; };
    let confirmar = true;
    w.confirm = () => confirmar;
    const estado = { rol, usuario: rol ? { id: 'auth-7', email: 'real@example.test' } : null, eventos: [], rpc: [], consultas: [], redirecciones: [],
        invitaciones: [
            { id: 1, empresa_id: 10, nombre_empresa: 'Empresa <b>real</b>', trabajador_id: 7, estado: 'pendiente', creada_en: '2026-10-18T14:00:00Z' },
            { id: 2, empresa_id: 20, nombre_empresa: 'Equipo Norte', trabajador_id: 7, estado: 'pendiente', creada_en: '2026-10-17T14:00:00Z' },
            { id: 3, empresa_id: 30, nombre_empresa: 'Equipo Anterior', trabajador_id: 7, estado: 'aceptada', creada_en: '2026-10-16T14:00:00Z' },
            { id: 4, empresa_id: 40, nombre_empresa: 'Otra oferta', trabajador_id: 7, estado: 'rechazada', creada_en: null },
            { id: 5, empresa_id: 50, nombre_empresa: null, trabajador_id: 7, estado: 'cancelada', creada_en: 'invalida' },
            { id: 99, empresa_id: 99, nombre_empresa: 'Datos ajenos', trabajador_id: 99, estado: 'pendiente', creada_en: '2026-10-19T14:00:00Z' }
        ], membresias: [{ empresa_id: 30, alias_interno: 'Técnico real', fecha_ingreso: '2026-10-16' }], empresas: [{ id: 30, nombre: 'Equipo Anterior' }, { id: 10, nombre: 'Empresa <b>real</b>' }] };
    const supabase = {
        auth: { getUser: async () => ({ data: { user: estado.usuario } }), onAuthStateChange: cb => estado.eventos.push(cb), signOut: async () => { if (estado.errorSalida) return { error: new Error('Fallo') }; estado.eventos.forEach(cb => cb('SIGNED_OUT', null)); return { error: null }; } },
        from(tabla) {
            const q = { tabla, filtros: [] }; estado.consultas.push(q);
            const consulta = { select(campos) { q.campos = campos; return this; }, eq(c, v) { q.filtros.push([c, v]); return this; }, in(c, v) { q.ids = v; return this; },
                single: async () => { if (estado.pausaPerfil) await estado.pausaPerfil; return { data: { id: 7, rol: estado.rol, nombre_usuario: 'usuario_tecnico' }, error: estado.errorPerfil ? new Error('Fallo perfil') : null }; },
                then(ok, error) {
                    if (tabla === 'membresias') assert.deepEqual(q.filtros, [['trabajador_id', 7], ['estado', 'activa']]);
                    const data = tabla === 'membresias' ? structuredClone(estado.membresias) : structuredClone(estado.empresas.filter(e => q.ids.includes(e.id)));
                    return Promise.resolve({ data, error: estado.errorTabla === tabla ? new Error('Fallo de conexión') : null }).then(ok, error);
                }
            }; return consulta;
        },
        rpc: async (nombre, datos) => {
            estado.rpc.push({ nombre, datos });
            if (nombre === 'listar_invitaciones_visibles') { if (estado.pausaLista) await estado.pausaLista; return { data: structuredClone(estado.invitaciones), error: estado.errorLista ? new Error('Red no disponible') : null }; }
            assert.equal(nombre, 'responder_invitacion'); assert.deepEqual(Object.keys(datos).sort(), ['aceptar', 'invitacion_id']);
            if (estado.pausaRespuesta) await estado.pausaRespuesta;
            if (estado.errorRespuesta) return { error: new Error('Invitación no disponible') };
            const i = estado.invitaciones.find(i => i.id === datos.invitacion_id); assert.equal(i.trabajador_id, 7); assert.equal(i.estado, 'pendiente');
            i.estado = datos.aceptar ? 'aceptada' : 'rechazada';
            if (datos.aceptar) estado.membresias.push({ empresa_id: i.empresa_id, fecha_ingreso: '2026-10-18', alias_interno: null });
            if (estado.falloDespuesDeGuardar) estado.errorLista = true;
            return { error: null };
        }
    };
    const contexto = vm.createContext({ document: d, window: w, sessionStorage: w.sessionStorage, URL, location: { replace: url => estado.redirecciones.push(url) }, console: { error() {} } });
    const proveedor = new vm.SyntheticModule(['supabase'], function () { this.setExport('supabase', supabase); }, { context: contexto });
    const cache = new Map();
    async function cargar(nombre) {
        if (cache.has(nombre)) return cache.get(nombre);
        const m = new vm.SourceTextModule((nombre === 'alertas.js' ? await readFile(new URL('./alertas-simuladas.js', import.meta.url), 'utf8') : await leer('scripts/' + nombre)), { context: contexto,
            initializeImportMeta(meta) { meta.url = 'https://movanza.test/scripts/' + nombre; },
            importModuleDynamically: async ruta => { const mod = await cargar(ruta.replace('./', '')); await mod.evaluate(); return mod; } });
        cache.set(nombre, m); await m.link(ruta => ruta.includes('supabase.js') ? proveedor : cargar(ruta.replace('./', ''))); return m;
    }
    async function iniciar() { new vm.Script(await leer('scripts/componentes-publicos.js')).runInContext(contexto); const m = await cargar('invitaciones-interfaz.js'); await m.evaluate(); await m.namespace.iniciarMisInvitaciones(); await esperar(); }
    const click = async selector => { const el = d.querySelector(selector); assert.ok(el, selector); el.click(); await esperar(); };
    return { dom, w, d, estado, iniciar, click, confirmar(valor) { confirmar = valor; } };
}
{
    const t = await entorno(); verificar(t.d.querySelector('main').hidden, 'Contenido oculto antes de verificar sesión'); await t.iniciar();
    verificar(!t.d.getElementById('sitio-invitaciones').hidden && t.estado.consultas.filter(q => q.tabla === 'perfiles').length === 1, 'Verifica sesión y rol una vez');
    verificar(t.estado.rpc.length === 1 && t.estado.rpc[0].nombre === 'listar_invitaciones_visibles', 'Reutiliza la consulta existente de invitaciones');
    verificar(t.d.querySelectorAll('.invitacion-card').length === 2 && !t.d.querySelector('main').textContent.includes('Datos ajenos'), 'Solo muestra pendientes propias inicialmente');
    verificar(t.d.querySelector('.invitacion-card').dataset.invitacion === '1' && !t.d.querySelector('.invitacion-card b'), 'Ordena por recepción y escapa nombres de empresa');
    verificar(t.d.getElementById('lista-membresias').textContent.includes('Técnico real') && t.d.getElementById('cantidad-equipos').textContent === '1', 'Conserva membresías activas, alias y fecha');
    const h = new JSDOM(encabezadoTrabajador({ raiz: '../', actual: 'mis_invitaciones' })); verificar(h.window.document.querySelector('header').outerHTML === t.d.querySelector('header').outerHTML, 'Reutiliza exactamente el encabezado con opción activa'); h.window.close();
    const index = new JSDOM(await leer('index.html')); const footer = index.window.document.querySelector('footer'); footer.querySelectorAll('a[href^="#"]').forEach(a => a.setAttribute('href', '../index.html' + a.getAttribute('href')));
    verificar(footer.outerHTML === t.d.querySelector('footer').outerHTML, 'Reutiliza íntegramente el footer'); index.window.close();
    for (const el of t.d.querySelectorAll('link[href^="../"], script[src^="../"], img[src^="../"], a[href^="../"]')) { await access(new URL(el.getAttribute('href') || el.getAttribute('src'), new URL('../paginas/', import.meta.url))); checks++; }
    const lecturas = t.estado.rpc.length + t.estado.consultas.length;
    for (const [estado, cantidad] of [['todas', 5], ['aceptada', 1], ['rechazada', 1], ['cancelada', 1], ['pendiente', 2]]) {
        await t.click(`[data-filtro-invitaciones="${estado}"]`);
        verificar(t.d.querySelectorAll('.invitacion-card').length === cantidad, `Filtro real ${estado}`);
        if (estado !== 'pendiente' && estado !== 'todas') verificar(!t.d.querySelector('[data-responder]'), 'Historial no ofrece acciones indebidas');
        if (estado === 'cancelada') verificar(t.d.getElementById('lista-invitaciones').textContent.includes('Fecha no disponible') && t.d.getElementById('lista-invitaciones').textContent.includes('Empresa no disponible'), 'Datos ausentes no se inventan');
    }
    verificar(lecturas === t.estado.rpc.length + t.estado.consultas.length, 'Filtrar no duplica consultas');
    let resolver; t.estado.pausaRespuesta = new Promise(r => resolver = r);
    await t.click('[data-invitacion="1"] [data-responder="true"]');
    verificar(t.d.querySelector('[data-invitacion="1"]').dataset.estado === 'pendiente' && t.d.querySelector('[data-invitacion="1"] [aria-busy="true"]').textContent.includes('Aceptando'), 'Carga real sin anticipar aceptación');
    verificar([...t.d.querySelectorAll('[data-responder], [data-filtro-invitaciones]')].every(b => b.disabled) && !t.d.getElementById('carga-invitaciones').hidden, 'Bloquea acciones y muestra loader mientras procesa');
    await t.click('[data-invitacion="1"] [data-responder="true"]');
    verificar(t.estado.rpc.filter(q => q.nombre === 'responder_invitacion').length === 1, 'Impide respuestas duplicadas');
    resolver(); await esperar(); t.estado.pausaRespuesta = null;
    verificar(!t.d.querySelector('[data-invitacion="1"]') && t.d.getElementById('mensaje').className === 'exito', 'Confirmación válida retira aceptada de pendientes');
    verificar(t.d.getElementById('lista-membresias').textContent.includes('Empresa <b>real</b>') && t.d.getElementById('cantidad-equipos').textContent === '2', 'Actualiza membresías usando las lecturas originales');
    verificar(t.d.activeElement === t.d.getElementById('titulo-invitaciones-recibidas'), 'Restaura foco visible tras retirar una card');
    t.confirmar(false); await t.click('[data-invitacion="2"] [data-responder="false"]');
    verificar(t.estado.rpc.filter(q => q.nombre === 'responder_invitacion').length === 1, 'Cancelar confirmación de rechazo no escribe');
    t.confirmar(true); t.estado.errorRespuesta = true; await t.click('[data-invitacion="2"] [data-responder="false"]');
    verificar(t.d.querySelector('[data-invitacion="2"]').dataset.estado === 'pendiente' && t.d.getElementById('mensaje').textContent.includes('Invitación no disponible'), 'Error conserva estado real y explica el motivo');
    verificar(!t.d.querySelector('[data-responder]').disabled && t.d.getElementById('carga-invitaciones').hidden, 'Error permite reintento y termina carga');
    t.estado.errorRespuesta = false; t.estado.falloDespuesDeGuardar = true; await t.click('[data-invitacion="2"] [data-responder="false"]');
    verificar(!t.d.querySelector('[data-responder]') && t.d.getElementById('mensaje').textContent.includes('respuesta quedó guardada'), 'Distingue respuesta confirmada de fallo posterior de lectura');
    await t.click('[data-filtro-invitaciones="rechazada"]'); verificar(t.d.querySelector('[data-invitacion="2"]').dataset.estado === 'rechazada', 'Conserva respuesta confirmada sin volver a enviarla');
    t.estado.falloDespuesDeGuardar = false; t.estado.errorLista = false; await t.click('#actualizar-invitaciones');
    verificar(t.d.getElementById('mensaje').textContent === '' && t.d.querySelectorAll('[data-invitacion]').length === 2, 'Reintento refresca historial sin recarga');
    await t.click('[data-filtro-invitaciones="pendiente"]'); verificar(t.d.getElementById('lista-invitaciones').textContent.includes('No tienes invitaciones pendientes'), 'Vacío específico de pendientes');
    const principal = t.d.querySelector('main'), ruta = t.w.location.href;
    await t.click('[data-filtro-invitaciones="aceptada"]');
    t.d.querySelector('.menu-cuenta').open = true; await t.click('[data-abrir-perfil]');
    verificar(t.d.getElementById('perfil-modal').open && t.w.location.href === ruta && t.d.querySelector('main') === principal, 'Perfil compartido sobre la misma página y ruta');
    await t.click('#perfil-modal [data-cerrar]'); verificar(t.d.querySelector('[data-filtro-invitaciones="aceptada"]').getAttribute('aria-pressed') === 'true', 'Perfil conserva el filtro y los datos del módulo');
    t.estado.eventos.forEach(cb => cb('SIGNED_IN', { user: { id: 'otra-cuenta' } }));
    verificar(t.d.querySelector('main').hidden && !t.d.getElementById('lista-invitaciones').children.length && t.estado.redirecciones[0] === '../login.html', 'Cambio de cuenta retira datos y regresa al acceso'); t.dom.window.close();
}
{
    const t = await entorno(); t.estado.errorLista = true; await t.iniciar();
    verificar(t.d.getElementById('mensaje').getAttribute('role') === 'alert' && !t.d.getElementById('actualizar-invitaciones').disabled && t.d.getElementById('lista-invitaciones').textContent.includes('No se pudieron'), 'Error inicial permite reintentar y no aparenta historial vacío');
    t.estado.errorLista = false; t.estado.invitaciones = []; t.estado.membresias = []; await t.click('#actualizar-invitaciones');
    verificar(t.d.getElementById('lista-invitaciones').textContent.includes('Aún no tienes invitaciones') && t.d.getElementById('lista-membresias').textContent.includes('Todavía no perteneces'), 'Estados vacíos reales para invitaciones y equipos'); t.dom.window.close();
}
{
    const t = await entorno(); t.estado.errorTabla = 'membresias'; await t.iniciar();
    verificar(t.d.getElementById('mensaje').getAttribute('role') === 'alert' && t.d.getElementById('cantidad-equipos').textContent === '—', 'Error de equipos no inventa métricas ni confirma carga completa');
    verificar(t.d.querySelectorAll('.invitacion-card').length === 2 && t.d.getElementById('lista-membresias').textContent.includes('No se pudieron'), 'Fallo del panel de equipos conserva las invitaciones consultadas correctamente'); t.dom.window.close();
}
{
    const t = await entorno(); await t.iniciar(); let resolver; t.estado.pausaRespuesta = new Promise(r => resolver = r);
    await t.click('[data-invitacion="1"] [data-responder="true"]'); const consultas = t.estado.consultas.length;
    t.estado.eventos.forEach(cb => cb('SIGNED_OUT', null)); resolver(); await esperar();
    verificar(t.d.querySelector('main').hidden && !t.d.getElementById('lista-invitaciones').children.length && consultas === t.estado.consultas.length, 'Respuesta tardía tras logout no consulta ni pinta datos de la sesión anterior'); t.dom.window.close();
}
for (const rol of ['empresa', 'administrador', null]) {
    const t = await entorno(rol); await t.iniciar();
    verificar(t.d.querySelector('main').hidden && t.estado.rpc.length === 0, 'Verifica rol antes de cargar datos: ' + rol); t.dom.window.close();
}
console.log(`Mis invitaciones: ${checks} comprobaciones correctas.`);
