import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { encabezadoEmpresarial } from '../scripts/encabezado-empresarial.js';

if (!process.argv[2]) throw new Error('Indica el directorio temporal con jsdom.');
const { JSDOM } = await import(pathToFileURL(join(resolve(process.argv[2]), 'node_modules/jsdom/lib/api.js')));
const leer = ruta => readFile(new URL('../' + ruta, import.meta.url), 'utf8');
const esperar = () => new Promise(r => setTimeout(r, 60));
let comprobaciones = 0;
function verificar(valor, mensaje) { assert.ok(valor, mensaje); comprobaciones++; }
async function entorno({ rol = 'empresa', id = '2', propietario = 7 } = {}) {
    const dom = new JSDOM(await leer('home_empresa_2.html'), { url: 'https://movanza.example/home_empresa_2.html' });
    if (id !== null) dom.window.sessionStorage.setItem('movanza_empresa_activa', id);
    const estado = { rol, usuario: rol ? { id: 'auth-7' } : null, consultas: [], eventos: [], redirecciones: [], propietario };
    const supabase = {
        auth: {
            getUser: async () => ({ data: { user: estado.usuario }, error: null }),
            onAuthStateChange: callback => { estado.eventos.push(callback); },
            signOut: async () => {
                if (estado.errorSalida) return { error: new Error('Red no disponible') };
                estado.eventos.forEach(fn => fn('SIGNED_OUT', null));
                return { error: null };
            }
        },
        from: tabla => {
            const filtros = [];
            return {
                select(campos) { estado.consultas.push({ tabla, campos, filtros }); return this; },
                eq(campo, valor) { filtros.push([campo, valor]); return this; },
                single: async () => {
                    if (tabla === 'perfiles') {
                        if (estado.errorPerfil) return { data: null, error: new Error('Error de perfil') };
                        return { data: { id: 7, rol: estado.rol, nombre_usuario: 'usuario_real' }, error: null };
                    }
                    assert.equal(tabla, 'empresas');
                    assert.equal(filtros[0][0], 'id');
                    assert.equal(filtros[0][1], String(id));
                    assert.equal(filtros[1][0], 'propietario_id');
                    assert.equal(filtros[1][1], 7);
                    if (estado.esperaEmpresa) await estado.esperaEmpresa;
                    if (estado.errorEmpresa) return { data: null, error: new Error('Error de consulta') };
                    if (estado.propietario !== 7) return { data: null, error: { code: 'PGRST116' } };
                    return { data: { id: Number(id), nombre: estado.nombre || 'Empresa permitida', propietario_id: 7 }, error: null };
                }
            };
        },
        rpc() { throw new Error('Home Empresa 2 no debe escribir datos'); }
    };
    const contexto = vm.createContext({ document: dom.window.document, window: dom.window, sessionStorage: dom.window.sessionStorage,
        location: { replace: url => estado.redirecciones.push(url) }, console: { error() {} } });
    const proveedor = new vm.SyntheticModule(['supabase'], function () { this.setExport('supabase', supabase); }, { context: contexto });
    const cache = new Map();
    async function cargar(nombre) {
        if (cache.has(nombre)) return cache.get(nombre);
        const modulo = new vm.SourceTextModule((nombre === 'alertas.js' ? await readFile(new URL('./alertas-simuladas.js', import.meta.url), 'utf8') : await leer('scripts/' + nombre)), { context: contexto });
        cache.set(nombre, modulo);
        await modulo.link(ruta => ruta.includes('supabase.js') ? proveedor : cargar(ruta.replace('./', '')));
        return modulo;
    }
    async function iniciar() {
        new vm.Script(await leer('scripts/componentes-publicos.js')).runInContext(contexto);
        let importacion;
        new vm.Script(await leer('scripts/home-empresa-2-carga.js'), { importModuleDynamically: () => importacion = (async () => {
            if (estado.errorCarga) throw new Error('Error al cargar dependencias');
            const modulo = await cargar('home-empresa-2.js'); await modulo.evaluate(); return modulo;
        })() }).runInContext(contexto);
        await importacion?.catch(() => {}); await esperar();
    }
    return { dom, document: dom.window.document, estado, iniciar };
}

{
    const t = await entorno();
    verificar(t.document.getElementById('contenido-empresa').hidden, 'El contenido empieza oculto');
    await t.iniciar();
    verificar(!t.document.getElementById('contenido-empresa').hidden, 'Una empresa autorizada accede a Home Empresa 2');
    verificar(t.document.getElementById('nombre-empresa-activa').textContent === 'Empresa permitida', 'Muestra el nombre obtenido de Supabase');
    verificar(t.document.getElementById('usuario-empresarial').textContent === 'usuario_real', 'Cuenta identifica al usuario real');
    verificar(t.dom.window.sessionStorage.getItem('movanza_empresa_activa') === '2', 'Mantiene el contexto original');
    verificar(t.document.querySelectorAll('.card-principal.efecto-card').length === 3, 'Exactamente tres cards con el efecto existente');
    verificar(!t.document.querySelector('.etiqueta-empresarial') && !t.document.querySelector('.cabecera-empresarial').textContent.includes('ESPACIO EMPRESARIAL'), 'El encabezado no muestra la etiqueta eliminada');
    verificar(t.document.querySelector('.menu-cuenta summary').classList.contains('boton-relleno'), 'Cuenta utiliza el recurso de botones compartido');
    verificar([...t.document.querySelectorAll('.card-principal h2')].map(n => n.textContent).join(',') === 'Equipo,Trabajos,Estadísticas', 'Los módulos corresponden a los solicitados');
    verificar(t.document.querySelectorAll('[data-estadisticas-empresa][href="./paginas/estadisticas.html?empresa=2"]').length === 2, 'Header y card conservan la empresa para Estadísticas');
    verificar(t.estado.consultas.length === 2, 'Solo consulta perfil y la empresa activa; no consulta operaciones ni indicadores');
    verificar(t.document.getElementById('estado-acceso').hidden && t.document.querySelector('.movanza-loader').hidden, 'La verificación termina sin loaders activos');
    const indice = new JSDOM(await leer('index.html'));
    const pie = indice.window.document.querySelector('.pie-publico').cloneNode(true);
    pie.querySelectorAll('a[href^="#"]').forEach(a => a.setAttribute('href', './index.html' + a.getAttribute('href')));
    verificar(pie.outerHTML === t.document.querySelector('.pie-publico').outerHTML, 'Reutiliza íntegramente el footer del Index');
    indice.window.close();
    verificar(t.document.querySelector('.cabecera-empresarial').outerHTML === new JSDOM(encabezadoEmpresarial()).window.document.querySelector('header').outerHTML.replaceAll('href="./paginas/estadisticas.html"', 'href="./paginas/estadisticas.html?empresa=2"').replace('<p id="usuario-empresarial"></p>', '<p id="usuario-empresarial">usuario_real</p>'), 'El encabezado procede del componente reutilizable');
    for (const recurso of t.document.querySelectorAll('img[src], link[rel="stylesheet"], script[src], a[href^="./"]')) {
        const ruta = decodeURIComponent(recurso.getAttribute('src') || recurso.getAttribute('href')).split(/[?#]/)[0];
        await access(new URL('../' + ruta, import.meta.url)); comprobaciones++;
    }
    const menu = t.document.querySelector('.menu-empresarial'); menu.click();
    verificar(menu.getAttribute('aria-expanded') === 'true', 'El menú móvil abre la navegación');
    menu.dispatchEvent(new t.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    verificar(menu.getAttribute('aria-expanded') === 'false', 'Escape cierra el menú y devuelve el foco');
    const cuenta = t.document.querySelector('details'); cuenta.open = true;
    t.document.querySelector('main').click();
    verificar(!cuenta.open, 'Cuenta se cierra al pulsar fuera');
    t.estado.errorSalida = true; t.document.getElementById('cerrar-sesion').click(); await esperar();
    verificar(t.document.getElementById('mensaje-home').textContent.includes('No se pudo cerrar') && !t.document.getElementById('cerrar-sesion').disabled, 'Un error al cerrar sesión permite reintentar');
    t.estado.errorSalida = false; t.document.getElementById('cerrar-sesion').click(); await esperar();
    verificar(t.document.getElementById('contenido-empresa').hidden && t.estado.redirecciones[0] === './login.html', 'Cerrar sesión retira la interfaz y vuelve a Login');
    verificar(!t.dom.window.sessionStorage.getItem('movanza_empresa_activa'), 'Cerrar sesión limpia el contexto');
    t.dom.window.close();
}
for (const rol of [null, 'trabajador', 'administrador', 'desconocido']) {
    const t = await entorno({ rol }); await t.iniciar();
    verificar(t.document.getElementById('contenido-empresa').hidden, 'No muestra administración a cuentas sin permiso empresarial');
    verificar(!t.estado.consultas.some(c => c.tabla === 'empresas'), 'Sin permiso no consulta empresas');
    t.dom.window.close();
}
for (const opciones of [{ id: null }, { id: 'otro' }, { propietario: 99 }]) {
    const t = await entorno(opciones); await t.iniciar();
    verificar(t.document.getElementById('contenido-empresa').hidden, 'Empresa ausente, inválida o ajena no revela contenido');
    verificar(t.estado.redirecciones[0] === './paginas/seleccionar_empresa.html', 'Devuelve a selección sin asumir una empresa');
    verificar(!t.dom.window.sessionStorage.getItem('movanza_empresa_activa'), 'Descarta el contexto inválido');
    t.dom.window.close();
}
for (const fallo of ['errorCarga', 'errorPerfil', 'errorEmpresa']) {
    const t = await entorno(); t.estado[fallo] = true; await t.iniciar();
    verificar(t.document.getElementById('contenido-empresa').hidden && t.document.getElementById('mensaje-home').getAttribute('role') === 'alert', 'Los errores de servicio no revelan el contenido');
    verificar(t.document.querySelector('.movanza-loader').hidden, 'El error también finaliza el loader');
    t.dom.window.close();
}
{
    const t = await entorno(); let resolver;
    t.estado.esperaEmpresa = new Promise(r => { resolver = r; }); await t.iniciar();
    verificar(t.document.getElementById('contenido-empresa').hidden && !t.document.querySelector('.movanza-loader').hidden, 'La empresa permanece oculta durante la consulta real');
    t.estado.eventos.forEach(fn => fn('SIGNED_OUT', null)); resolver(); await esperar();
    verificar(t.document.getElementById('contenido-empresa').hidden, 'Una respuesta pendiente no revela contenido después de cerrar sesión');
    t.dom.window.close();
}
{
    const t = await entorno(); let resolver;
    t.estado.esperaEmpresa = new Promise(r => { resolver = r; }); await t.iniciar();
    t.dom.window.sessionStorage.setItem('movanza_empresa_activa', '8'); resolver(); await esperar();
    verificar(t.document.getElementById('contenido-empresa').hidden && t.estado.redirecciones[0] === './paginas/seleccionar_empresa.html', 'Cambiar el contexto durante la consulta no muestra otra empresa');
    verificar(t.dom.window.sessionStorage.getItem('movanza_empresa_activa') === '8', 'Conserva la selección nueva al invalidar una respuesta anterior');
    t.dom.window.close();
}
{
    const t = await entorno(); await t.iniciar();
    t.estado.eventos.forEach(fn => fn('SIGNED_IN', { user: { id: 'otra-cuenta' } }));
    verificar(t.document.getElementById('contenido-empresa').hidden && t.estado.redirecciones[0] === './login.html', 'Un cambio de cuenta retira la empresa de la sesión anterior');
    t.dom.window.close();
}
// Ejecuta la preparación real de selectores de Estadísticas sin consultar datos.
{
    const codigo = await leer('scripts/estadisticas.js');
    const funcion = codigo.slice(codigo.indexOf('function prepararSelectores()'), codigo.indexOf('function actualizarSelectorTrabajadores()'));
    for (const id of ['2', '99']) {
        const dom = new JSDOM('<select id="filtro-empresa"><option value="todas">Todas</option></select>');
        const contexto = vm.createContext({ empresaInicial: id, empresasPropias: [{ id: 2, nombre: 'Permitida' }],
            $: nombre => dom.window.document.getElementById(nombre), actualizarSelectorTrabajadores() {}, actualizarSelectorPuntos() {},
            crearOpcion: (valor, nombre) => { const op = dom.window.document.createElement('option'); op.value = String(valor); op.textContent = nombre; return op; }
        });
        new vm.Script(funcion + '\nprepararSelectores();').runInContext(contexto);
        verificar(dom.window.document.querySelector('select').value === (id === '2' ? '2' : ''), 'Estadísticas solo preselecciona empresas autorizadas y no agrega otras si el contexto es inválido');
        dom.window.close();
    }
}
console.log(`Home Empresa 2: ${comprobaciones} comprobaciones correctas.`);
