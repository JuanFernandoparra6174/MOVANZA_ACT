import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
if (!process.argv[2]) throw new Error('Indica el directorio temporal con jsdom.');
const { JSDOM } = await import(pathToFileURL(join(resolve(process.argv[2]), 'node_modules/jsdom/lib/api.js')));
const leer = ruta => readFile(new URL('../' + ruta, import.meta.url), 'utf8');
const esperar = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setTimeout(r, 5)); };
let comprobaciones = 0;
function verificar(valor, mensaje) { assert.ok(valor, mensaje); comprobaciones++; }
async function entorno(pagina = 'home_empresa_1.html', rol = 'empresa') {
    const dom = new JSDOM(await leer(pagina), { url: 'https://movanza.example/' + pagina });
    dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
    const estado = { rol, usuario: rol ? { id: 'usuario-1' } : null, eventos: [], redirecciones: [], empresas: [], consultasEmpresas: [], rpc: [], importaciones: [] };
    const supabase = {
        auth: {
            getUser: async () => ({ data: { user: estado.usuario }, error: null }),
            onAuthStateChange: callback => { estado.eventos.push(callback); },
            signOut: async () => {
                if (estado.errorSalida) return { error: new Error('Fallo de red') };
                estado.usuario = null;
                estado.eventos.forEach(callback => callback('SIGNED_OUT', null));
                return { error: null };
            }
        },
        from: tabla => {
            let filtro;
            return {
                select() { return this; },
                eq(columna, valor) { filtro = { columna, valor }; return this; },
                single: async () => {
                    assert.equal(tabla, 'perfiles');
                    assert.equal(filtro.columna, 'usuario_auth_id');
                    assert.equal(filtro.valor, estado.usuario.id);
                    if (estado.esperaPerfil) await estado.esperaPerfil;
                    if (estado.errorPerfil) return { data: null, error: new Error('Fallo de lectura') };
                    return { data: { id: 7, rol: estado.rol, nombre_usuario: 'empresa_prueba' }, error: null };
                },
                order: async () => {
                    assert.equal(tabla, 'empresas');
                    estado.consultasEmpresas.push(filtro);
                    assert.deepEqual(filtro, { columna: 'propietario_id', valor: 7 });
                    if (estado.errorEmpresas) return { data: null, error: new Error('Fallo de empresas') };
                    return { data: estado.empresas.filter(e => e.propietario_id === filtro.valor), error: null };
                }
            };
        },
        rpc: async (nombre, datos) => {
            estado.rpc.push({ nombre, datos });
            if (estado.esperaCreacion) await estado.esperaCreacion;
            if (estado.errorCreacion) return { data: null, error: new Error('No se pudo crear') };
            const empresa = { id: 100, nombre: datos.nombre, propietario_id: 7, creado_en: '2026-10-17T12:00:00Z' };
            estado.empresas.push(empresa);
            return { data: empresa.id, error: null };
        }
    };
    const contexto = vm.createContext({ document: dom.window.document, window: dom.window,
        sessionStorage: dom.window.sessionStorage, location: { replace: url => estado.redirecciones.push(url), assign: url => estado.redirecciones.push(url) },
        MutationObserver: dom.window.MutationObserver, console: { error() {} }
    });
    const proveedor = new vm.SyntheticModule(['supabase'], function () { this.setExport('supabase', supabase); }, { context: contexto });
    const cache = new Map();
    async function cargar(nombre) {
        if (cache.has(nombre)) return cache.get(nombre);
        const modulo = new vm.SourceTextModule((nombre === 'alertas.js' ? await readFile(new URL('./alertas-simuladas.js', import.meta.url), 'utf8') : await leer('scripts/' + nombre)), { context: contexto,
            importModuleDynamically: async ruta => {
                estado.importaciones.push(ruta);
                const codigo = await cargar(ruta.replace('./', ''));
                await codigo.evaluate();
                return codigo;
            }
        });
        cache.set(nombre, modulo);
        await modulo.link(ruta => ruta.includes('supabase.js') ? proveedor : cargar(ruta.replace('./', '')));
        return modulo;
    }
    async function iniciar() {
        new vm.Script(await leer('scripts/componentes-publicos.js')).runInContext(contexto);
        let importacion;
        new vm.Script(await leer('scripts/home-empresa-carga.js'), { importModuleDynamically: () => importacion = (async () => {
            if (estado.errorCarga) throw new Error('CDN no disponible');
            const modulo = await cargar('home-empresa.js');
            await modulo.evaluate();
            return modulo;
        })() }).runInContext(contexto);
        await importacion?.catch(() => {});
        await esperar();
    }
    return { dom, document: dom.window.document, estado, cargar, iniciar };
}

const e = await entorno();
verificar(e.document.getElementById('contenido-empresa').hidden, 'Todo el contenido empresarial empieza oculto');
await e.iniciar();
verificar(!e.document.getElementById('contenido-empresa').hidden, 'La cuenta Empresa autorizada ve la página: ' + e.document.getElementById('mensaje-home').textContent);
verificar(e.document.getElementById('estado-acceso').hidden, 'Finaliza la comprobación de acceso');
verificar(e.document.querySelector('.movanza-loader').hidden, 'No queda un loader después de verificar permisos');
verificar(e.document.querySelectorAll('.card-principal').length === 2, 'Existen exactamente dos cards');
verificar(e.document.querySelectorAll('.efecto-card > .efecto-card-borde').length === 2, 'Las dos cards conservan el efecto reutilizable');
verificar(!e.document.querySelector('.portada'), 'No se copia el banner público');
verificar(e.document.getElementById('titulo-bienvenida').textContent === 'Bienvenido a tu espacio empresarial', 'El banner tiene el título solicitado');
verificar(e.estado.consultasEmpresas.length === 0 && e.estado.rpc.length === 0, 'Home Empresa 1 no ejecuta operaciones empresariales');
for (const recurso of e.document.querySelectorAll('img[src], link[rel="stylesheet"], script[src]')) {
    await access(new URL('../' + decodeURIComponent(recurso.getAttribute('src') || recurso.getAttribute('href')), import.meta.url));
    comprobaciones++;
}
for (const enlace of e.document.querySelectorAll('a[href^="./"]')) {
    await access(new URL('../' + enlace.getAttribute('href').split('#')[0], import.meta.url));
    comprobaciones++;
}
const indice = new JSDOM(await leer('index.html'));
verificar(e.document.querySelector('.marca img').getAttribute('src') === indice.window.document.querySelector('.marca img').getAttribute('src'), 'El header reutiliza el logotipo del Index');
const pieIndex = indice.window.document.querySelector('.pie-publico').cloneNode(true);
pieIndex.querySelectorAll('a[href^="#"]').forEach(a => a.setAttribute('href', './index.html' + a.getAttribute('href')));
verificar(e.document.querySelector('.pie-publico').outerHTML === pieIndex.outerHTML, 'El footer es el del Index con las rutas adaptadas');
indice.window.close();
const menu = e.document.querySelector('.menu-boton');
menu.click();
verificar(menu.getAttribute('aria-expanded') === 'true', 'El menú móvil conserva su interacción');
e.estado.errorSalida = true;
e.document.getElementById('cerrar-sesion').click();
await esperar();
verificar(!e.document.getElementById('contenido-empresa').hidden && e.document.getElementById('mensaje-home').textContent.includes('No se pudo cerrar'), 'Un fallo al cerrar sesión informa y permite reintentar');
e.estado.errorSalida = false;
e.dom.window.sessionStorage.setItem('movanza_empresa_activa', '999');
e.document.getElementById('cerrar-sesion').click();
await esperar();
verificar(e.document.getElementById('contenido-empresa').hidden && e.estado.redirecciones[0] === './login.html', 'El cierre de sesión retira el contenido y vuelve a Login');
verificar(!e.dom.window.sessionStorage.getItem('movanza_empresa_activa'), 'El cierre limpia la empresa de la sesión anterior');
e.dom.window.close();

for (const rol of [null, 'trabajador', 'administrador', 'inexistente']) {
    const t = await entorno('home_empresa_1.html', rol);
    await t.iniciar();
    verificar(t.document.getElementById('contenido-empresa').hidden, 'No muestra contenido a cuentas sin permiso empresarial');
    verificar(t.estado.consultasEmpresas.length === 0 && t.estado.rpc.length === 0, 'No consulta ni modifica empresas sin permiso');
    if (!rol) verificar(t.estado.redirecciones[0] === './login.html', 'Sin sesión redirige al Login');
    else verificar(t.document.querySelector('[role="alert"]'), 'Informa de la denegación o fallo de verificación');
    t.dom.window.close();
}
for (const fallo of ['errorPerfil', 'errorCarga']) {
    const t = await entorno(); t.estado[fallo] = true;
    await t.iniciar();
    verificar(t.document.getElementById('contenido-empresa').hidden, 'Falla de forma cerrada ante errores de acceso');
    verificar(t.document.querySelector('.movanza-loader').hidden, 'El error retira el loader');
    t.dom.window.close();
}
{
    const t = await entorno();
    let resolverPerfil;
    t.estado.esperaPerfil = new Promise(resolver => { resolverPerfil = resolver; });
    await t.iniciar();
    verificar(t.document.getElementById('contenido-empresa').hidden, 'La página espera la respuesta del perfil');
    t.estado.eventos.forEach(callback => callback('SIGNED_OUT', null));
    resolverPerfil(); await esperar();
    verificar(t.document.getElementById('contenido-empresa').hidden, 'Cerrar sesión durante la verificación no revela después una vista obsoleta');
    verificar(t.estado.redirecciones[0] === './login.html', 'El cierre durante la consulta vuelve al Login');
    t.dom.window.close();
}
{
    const t = await entorno(); await t.iniciar();
    t.estado.eventos.forEach(callback => callback('SIGNED_IN', { user: { id: 'otra-cuenta' } }));
    verificar(t.document.getElementById('contenido-empresa').hidden, 'Un cambio de usuario retira inmediatamente la vista anterior');
    t.dom.window.close();
}

for (const pagina of ['seleccionar_empresa']) {
    const t = await entorno(`paginas/${pagina}.html`, 'trabajador');
    await t.iniciar();
    verificar(t.estado.importaciones.length === 0 && t.estado.consultasEmpresas.length === 0 && t.document.getElementById('contenido-empresa').hidden, 'Los destinos también bloquean el acceso directo de trabajadores');
    t.dom.window.close();
}
{
    const t = await entorno('paginas/seleccionar_empresa.html');
    t.dom.window.sessionStorage.setItem('movanza_empresa_activa', '999');
    await t.iniciar();
    verificar(t.document.getElementById('lista-empresas').textContent.includes('Todavía no tienes'), 'La selección maneja una cuenta sin empresas');
    verificar(t.document.querySelector('a[href="../home_empresa_1.html"]'), 'Una cuenta sin empresas puede volver a Home para crearla');
    verificar(!t.dom.window.sessionStorage.getItem('movanza_empresa_activa'), 'Se descarta una empresa ajena guardada en la sesión');
    t.dom.window.close();
}
{
    const t = await entorno('paginas/seleccionar_empresa.html');
    t.estado.empresas = [
        { id: 1, nombre: 'Primera', propietario_id: 7, creado_en: '2026-10-17' },
        { id: 2, nombre: 'Segunda', propietario_id: 7, creado_en: '2026-10-17' },
        { id: 3, nombre: 'Ajena', propietario_id: 99, creado_en: '2026-10-17' }
    ];
    await t.iniciar();
    const botones = t.document.querySelectorAll('#lista-empresas button');
    verificar(botones.length === 2 && !t.document.getElementById('lista-empresas').textContent.includes('Ajena'), 'La selección respeta el filtro del propietario y varias empresas');
    verificar(t.document.querySelectorAll('.tabla-empresas .grid-1-5 .button').length === 2, 'Cada empresa usa las columnas interactivas del recurso');
    verificar(t.document.getElementById('lista-empresas').getAttribute('aria-busy') === 'false', 'La consulta finaliza el estado de carga');
    botones[1].click();
    verificar(t.dom.window.sessionStorage.getItem('movanza_empresa_activa') === '2', 'Selecciona la empresa utilizando el flujo existente');
    verificar(t.estado.redirecciones.shift() === '../home_empresa_2.html', 'Pulsar Seleccionar empresa continúa a Home Empresa 2 después de guardar el contexto');
    verificar(botones[1].getAttribute('aria-pressed') === 'true' && botones[0].getAttribute('aria-pressed') === 'false', 'La selección se indica dentro de la empresa correspondiente');
    verificar(t.document.querySelectorAll('.cabecera-publica').length === 1 && t.document.querySelector('.banner-seleccion') && t.document.querySelector('.pie-publico'), 'Seleccionar empresa comparte header y footer y tiene banner propio');
    verificar(!t.document.getElementById('usuario-actual') && !t.document.getElementById('seccion-empresa-activa') && !t.document.getElementById('formulario-empresa'), 'La selección no mezcla Mi cuenta, espacio de trabajo ni creación');
    verificar(t.document.getElementById('titulo-mis-empresas').textContent === 'Mis empresas' && botones[0].classList.contains('boton-relleno'), 'La lista tiene encabezado propio y botones del recurso');
    const pieSeleccion = t.document.querySelector('.pie-publico').cloneNode(true);
    pieSeleccion.querySelectorAll('a[href^="../"]').forEach(a => a.setAttribute('href', a.getAttribute('href').replace('../', './')));
    const homePie = new JSDOM(await leer('home_empresa_1.html'));
    verificar(pieSeleccion.outerHTML === homePie.window.document.querySelector('.pie-publico').outerHTML, 'Selección conserva el footer empresarial con rutas adaptadas');
    homePie.window.close();
    for (const recurso of t.document.querySelectorAll('img[src], link[rel="stylesheet"], script[src], a[href^="../"], a[href^="./"]')) {
        const ruta = decodeURIComponent(recurso.getAttribute('src') || recurso.getAttribute('href')).split('#')[0];
        await access(new URL('../paginas/' + ruta, import.meta.url)); comprobaciones++;
    }
    t.document.querySelector('.menu-boton').click();
    verificar(t.document.querySelector('.menu-boton').getAttribute('aria-expanded') === 'true', 'Selección conserva el menú móvil del perfil');
    t.document.getElementById('cerrar-sesion').click(); await esperar();
    verificar(t.estado.redirecciones[0] === '../login.html', 'Cerrar sesión desde selección resuelve la ruta correcta');
    t.dom.window.close();
}
{
    const t = await entorno();
    await t.iniciar();
    t.document.querySelector('.card-accion[data-crear-empresa]').click(); await esperar();
    const dialogo = t.document.getElementById('crear-empresa-modal');
    verificar(dialogo.open && t.dom.window.location.pathname === '/home_empresa_1.html', 'Crear empresa abre una ventana sin cambiar de ruta');
    t.document.getElementById('nombre-empresa').value = 'Empresa nueva';
    t.document.getElementById('formulario-empresa').dispatchEvent(new t.dom.window.Event('submit', { cancelable: true }));
    await esperar();
    verificar(t.estado.rpc.length === 1 && t.estado.rpc[0].nombre === 'crear_empresa' && t.estado.rpc[0].datos.nombre === 'Empresa nueva', 'La creación reutiliza la RPC y los datos existentes');
    verificar(t.dom.window.sessionStorage.getItem('movanza_empresa_activa') === '100', 'La nueva empresa queda seleccionada mediante el flujo actual');
    verificar(dialogo.open && !t.document.getElementById('seccion-empresa-activa'), 'El éxito mantiene su mensaje sin introducir un bloque de espacio de trabajo');
    verificar(t.document.getElementById('nombre-empresa').value === '', 'El éxito conserva el restablecimiento del formulario');
    t.document.querySelector('[data-cerrar-empresa]').click(); await esperar();
    verificar(!dialogo.open, 'La ventana puede cerrarse tras el éxito');
    t.dom.window.close();
}
{
    const t = await entorno(); await t.iniciar();
    const abrir = t.document.querySelector('.card-accion[data-crear-empresa]');
    abrir.click(); await esperar();
    const dialogo = t.document.getElementById('crear-empresa-modal');
    const campo = t.document.getElementById('nombre-empresa');
    const form = t.document.getElementById('formulario-empresa');
    campo.value = 'Empresa sin guardar';
    t.dom.window.confirm = () => false;
    dialogo.dispatchEvent(new t.dom.window.Event('cancel', { cancelable: true })); await esperar();
    verificar(dialogo.open && campo.value === 'Empresa sin guardar', 'Escape solicita confirmación y conserva datos al rechazar');
    t.estado.errorCreacion = true;
    form.dispatchEvent(new t.dom.window.Event('submit', { cancelable: true })); await esperar();
    verificar(dialogo.open && campo.value === 'Empresa sin guardar' && t.document.getElementById('mensaje').classList.contains('error'), 'Un error mantiene el formulario, los datos y el mensaje');
    verificar(!form.querySelector('button').disabled && dialogo.querySelector('.movanza-loader').hidden, 'El error finaliza la carga y permite reintentar');
    t.estado.errorCreacion = false;
    let resolver;
    t.estado.esperaCreacion = new Promise(r => { resolver = r; });
    form.dispatchEvent(new t.dom.window.Event('submit', { cancelable: true }));
    form.dispatchEvent(new t.dom.window.Event('submit', { cancelable: true }));
    verificar(t.estado.rpc.length === 2, 'Una operación pendiente impide envíos duplicados');
    verificar(!dialogo.querySelector('.movanza-loader').hidden, 'La espera real muestra el loader');
    t.dom.window.confirm = () => true;
    dialogo.dispatchEvent(new t.dom.window.Event('cancel', { cancelable: true })); await esperar();
    verificar(dialogo.open, 'Escape no cierra durante el registro');
    resolver(); await esperar();
    campo.value = 'Descartar';
    t.document.querySelector('.cancelar-empresa').click(); await esperar();
    verificar(!dialogo.open && campo.value === '', 'Cancelar descarta datos solo con confirmación');
    verificar(t.document.activeElement === abrir, 'El cierre devuelve el foco a la card de origen');
    abrir.click(); await esperar();
    t.estado.eventos.forEach(callback => callback('SIGNED_OUT', null));
    verificar(!dialogo.open && t.document.getElementById('contenido-empresa').hidden, 'El cierre de sesión también retira el formulario superpuesto');
    t.dom.window.close();
}
{
    const t = await entorno('paginas/seleccionar_empresa.html'); t.estado.errorEmpresas = true;
    await t.iniciar();
    verificar(t.document.getElementById('lista-empresas').textContent.includes('No se pudieron cargar'), 'La tabla informa un error sin mostrar empresas ficticias');
    verificar(t.document.getElementById('lista-empresas').getAttribute('aria-busy') === 'false', 'El error finaliza el estado de carga');
    t.dom.window.close();
}
{
    const t = await entorno(); t.estado.errorEmpresas = true; await t.iniciar();
    const abrir = t.document.querySelector('.card-accion[data-crear-empresa]');
    abrir.click(); await esperar();
    verificar(t.document.getElementById('boton-crear').disabled, 'Un error de preparación impide registrar sin contexto válido');
    verificar(t.document.getElementById('mensaje').classList.contains('error') && t.document.querySelector('.empresa-modal .movanza-loader').hidden, 'El fallo inicial termina la carga y muestra su mensaje');
    t.document.querySelector('.cancelar-empresa').click(); await esperar();
    t.estado.errorEmpresas = false;
    abrir.click(); await esperar();
    verificar(!t.document.getElementById('boton-crear').disabled, 'Reabrir permite recuperar el formulario después de un fallo inicial');
    t.document.getElementById('nombre-empresa').value = 'A';
    t.document.getElementById('formulario-empresa').dispatchEvent(new t.dom.window.Event('submit', { cancelable: true })); await esperar();
    verificar(t.estado.rpc.length === 0 && t.document.getElementById('mensaje').textContent.includes('entre 2 y 120'), 'La ventana conserva la validación de nombre sin consultar la RPC');
    t.dom.window.close();
}
console.log(`Home Empresa 1 y destinos: ${comprobaciones} comprobaciones correctas.`);
