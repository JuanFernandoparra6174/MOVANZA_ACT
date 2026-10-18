import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { encabezadoTrabajador } from '../scripts/encabezado-trabajador.js';

if (!process.argv[2]) throw new Error('Indica el directorio temporal con jsdom.');
const { JSDOM } = await import(pathToFileURL(join(resolve(process.argv[2]), 'node_modules/jsdom/lib/api.js')));
const leer = ruta => readFile(new URL('../' + ruta, import.meta.url), 'utf8');
const esperar = () => new Promise(r => setTimeout(r, 80));
let checks = 0;
function verificar(valor, mensaje) { assert.ok(valor, mensaje); checks++; }

async function entorno(rol = 'trabajador') {
    const dom = new JSDOM(await leer('home_trabajador.html'), { url: 'https://movanza.test/home_trabajador.html', pretendToBeVisual: true });
    const { window } = dom, { document } = window;
    window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    window.HTMLDialogElement.prototype.close = function () { this.open = false; };
    window.matchMedia = () => ({ matches: true });
    const estado = { rol, usuario: rol ? { id: 'auth-7', email: 'real@example.test' } : null, consultas: [], eventos: [], redirecciones: [], salidas: 0, importaciones: [] };
    const supabase = {
        auth: {
            getUser: async () => ({ data: { user: estado.usuario }, error: estado.errorAuth || null }),
            onAuthStateChange: callback => { estado.eventos.push(callback); },
            signOut: async () => {
                estado.salidas++;
                if (estado.esperaSalida) await estado.esperaSalida;
                if (estado.errorSalida) return { error: new Error('Fallo de red') };
                estado.usuario = null;
                estado.eventos.forEach(fn => fn('SIGNED_OUT', null));
                return { error: null };
            }
        },
        from: tabla => {
            assert.equal(tabla, 'perfiles');
            const consulta = { tabla }; estado.consultas.push(consulta);
            const q = {
                select(campos) { consulta.campos = campos; return q; },
                eq(campo, valor) { assert.equal(campo, 'usuario_auth_id'); assert.equal(valor, 'auth-7'); return q; },
                single: async () => {
                    if (estado.esperaPerfil) await estado.esperaPerfil;
                    return { data: { id: 7, rol: estado.rol, nombre_usuario: 'trabajador_real', nombre_completo: 'Nombre real' }, error: estado.errorPerfil ? new Error('Fallo de perfil') : null };
                }
            }; return q;
        },
        rpc() { throw new Error('Home Trabajador no debe escribir datos'); }
    };
    const contexto = vm.createContext({ document, window, sessionStorage: window.sessionStorage, URL,
        location: { replace: url => estado.redirecciones.push(url) }, console: { error() {} } });
    const proveedor = new vm.SyntheticModule(['supabase'], function () { this.setExport('supabase', supabase); }, { context: contexto });
    const cache = new Map();
    async function cargar(nombre) {
        if (cache.has(nombre)) return cache.get(nombre);
        const modulo = new vm.SourceTextModule((nombre === 'alertas.js' ? await readFile(new URL('./alertas-simuladas.js', import.meta.url), 'utf8') : await leer('scripts/' + nombre)), { context: contexto,
            initializeImportMeta(meta) { meta.url = 'https://movanza.test/scripts/' + nombre; },
            importModuleDynamically: async ruta => {
                estado.importaciones.push(ruta);
                const m = await cargar(ruta.replace('./', '')); await m.evaluate(); return m;
            }
        });
        cache.set(nombre, modulo);
        await modulo.link(ruta => ruta.includes('supabase.js') ? proveedor : cargar(ruta.replace('./', '')));
        return modulo;
    }
    async function iniciar() {
        new vm.Script(await leer('scripts/componentes-publicos.js')).runInContext(contexto);
        let importacion;
        new vm.Script(await leer('scripts/home-trabajador-carga.js'), { importModuleDynamically: () => importacion = (async () => {
            if (estado.errorCarga) throw new Error('CDN no disponible');
            const m = await cargar('home-trabajador.js'); await m.evaluate(); return m;
        })() }).runInContext(contexto);
        await importacion?.catch(() => {}); await esperar();
    }
    return { dom, document, window, estado, iniciar };
}

{
    const t = await entorno(); const d = t.document;
    verificar(d.getElementById('contenido-trabajador').hidden, 'Contenido protegido antes de verificar la sesión');
    await t.iniciar();
    verificar(!d.getElementById('contenido-trabajador').hidden && d.getElementById('estado-acceso').hidden, 'El trabajador autorizado accede a Home');
    verificar(t.estado.consultas.length === 1 && t.estado.importaciones.length === 0, 'Solo consulta el perfil propio; no carga asignaciones ni invitaciones');
    verificar(d.getElementById('titulo-bienvenida').textContent === 'Bienvenido a tu espacio de trabajo', 'Banner solicitado');
    verificar(d.querySelectorAll('.card-principal.efecto-card').length === 2 && d.querySelectorAll('.efecto-card-borde').length === 2, 'Exactamente dos cards con el recurso animado compartido');
    verificar([...d.querySelectorAll('.card-accion')].map(a => a.getAttribute('href')).join(',') === './paginas/mis_asignaciones.html,./paginas/mis_invitaciones.html', 'Enlaza las dos interfaces existentes');
    verificar([...d.querySelectorAll('.card-imagen img')].every(img => img.getAttribute('src').startsWith('./Carpeta_Imagenes/home_trabajador/')), 'Usa las imágenes proporcionadas');
    verificar(d.querySelectorAll('[data-abrir-perfil]').length === 1 && d.querySelectorAll('#cerrar-sesion').length === 1, 'No duplica los controles de Perfil y sesión');
    const esperado = new JSDOM(encabezadoTrabajador());
    verificar(d.querySelector('header').outerHTML === esperado.window.document.querySelector('header').outerHTML, 'Usa el encabezado reutilizable del trabajador'); esperado.window.close();
    const index = new JSDOM(await leer('index.html'));
    const pie = index.window.document.querySelector('.pie-publico').cloneNode(true);
    pie.querySelectorAll('a[href^="#"]').forEach(a => { a.setAttribute('href', './index.html' + a.getAttribute('href')); });
    verificar(d.querySelector('.pie-publico').outerHTML === pie.outerHTML, 'Reutiliza íntegramente el footer del Index'); index.window.close();
    for (const el of d.querySelectorAll('script[src], img[src], link[href], a[href^="./"]')) {
        const ruta = decodeURIComponent(el.getAttribute('src') || el.getAttribute('href')).split(/[?#]/)[0];
        await access(new URL('../' + ruta, import.meta.url)); checks++;
    }
    const menu = d.querySelector('.menu-boton'); menu.click();
    verificar(menu.getAttribute('aria-expanded') === 'true', 'Abre la navegación móvil');
    menu.dispatchEvent(new t.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    verificar(menu.getAttribute('aria-expanded') === 'false' && d.activeElement === menu, 'Escape cierra la navegación y devuelve foco');
    const cuenta = d.querySelector('.menu-cuenta'); cuenta.open = true;
    const origen = cuenta.querySelector('[data-abrir-perfil]'); const contenido = d.getElementById('contenido-trabajador');
    t.window.sessionStorage.setItem('contexto-prueba', 'conservar');
    origen.click(); await esperar();
    const modal = d.getElementById('perfil-modal');
    verificar(modal?.open && modal.querySelector('[data-rol]').textContent === 'Trabajador', 'Perfil compartido muestra al trabajador autenticado');
    verificar(t.window.location.pathname === '/home_trabajador.html' && contenido === d.getElementById('contenido-trabajador') && !contenido.hidden, 'Perfil conserva página, URL y contenido');
    modal.querySelector('[data-cerrar]').click(); await esperar();
    verificar(!modal.open && d.activeElement === origen && t.window.sessionStorage.getItem('contexto-prueba') === 'conservar', 'Cerrar Perfil conserva estado y devuelve foco');
    t.estado.errorSalida = true; d.getElementById('cerrar-sesion').click(); await esperar();
    verificar(d.getElementById('mensaje-home').textContent.includes('No se pudo cerrar') && !contenido.hidden && !contenido.inert, 'El fallo de salida informa y permite reintentar');
    t.estado.errorSalida = false;
    let resolver; t.estado.esperaSalida = new Promise(r => { resolver = r; });
    d.getElementById('cerrar-sesion').click(); d.getElementById('cerrar-sesion').click(); await esperar();
    verificar(t.estado.salidas === 2 && contenido.inert, 'Bloquea el doble envío de cierre de sesión');
    resolver(); await esperar();
    verificar(contenido.hidden && t.estado.redirecciones[0] === './login.html', 'Cerrar sesión oculta el contenido y regresa al acceso');
    t.dom.window.close();
}
for (const rol of ['empresa', 'administrador', null, 'desconocido']) {
    const t = await entorno(rol); await t.iniciar();
    verificar(t.document.getElementById('contenido-trabajador').hidden, `Deniega acceso directo: ${rol}`);
    if (rol === null) verificar(t.estado.redirecciones[0] === './login.html', 'Sin sesión vuelve al login');
    else verificar(t.document.getElementById('mensaje-home').getAttribute('role') === 'alert', 'Informa acceso no disponible');
    t.dom.window.close();
}
for (const fallo of ['errorCarga', 'errorPerfil', 'errorAuth']) {
    const t = await entorno(); t.estado[fallo] = new Error('Fallo'); await t.iniciar();
    verificar(t.document.getElementById('contenido-trabajador').hidden && !t.document.getElementById('estado-acceso').hidden, `No expone contenido ante ${fallo}`);
    verificar(t.document.getElementById('mensaje-home').textContent.includes('No se pudo verificar') && t.document.querySelector('.movanza-loader').hidden, 'Error comprensible y carga finalizada');
    t.dom.window.close();
}
for (const evento of ['SIGNED_OUT', 'SIGNED_IN']) {
    const t = await entorno(); let resolver;
    t.estado.esperaPerfil = new Promise(r => { resolver = r; }); await t.iniciar();
    t.estado.eventos.forEach(fn => fn(evento, evento === 'SIGNED_IN' ? { user: { id: 'otra-cuenta' } } : null));
    resolver(); await esperar();
    verificar(t.document.getElementById('contenido-trabajador').hidden && t.estado.redirecciones[0] === './login.html', 'Descarta respuestas de una sesión que terminó o cambió');
    t.dom.window.close();
}
{
    const t = await entorno(); await t.iniciar();
    t.estado.eventos.forEach(fn => fn('SIGNED_IN', { user: { id: 'otra-cuenta' } }));
    verificar(t.document.getElementById('contenido-trabajador').hidden && t.estado.redirecciones[0] === './login.html', 'Cambio posterior de cuenta retira inmediatamente la vista');
    t.dom.window.close();
}
console.log(`Home Trabajador: ${checks} comprobaciones correctas.`);
