import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

if (!process.argv[2]) throw new Error('Indica el directorio temporal con jsdom.');
const { JSDOM } = await import(pathToFileURL(join(
    resolve(process.argv[2]), 'node_modules/jsdom/lib/api.js'
)));
let comprobaciones = 0;
const leer = ruta => readFile(new URL(ruta, import.meta.url), 'utf8');
const esperar = async () => { for (let i = 0; i < 5; i++) await new Promise(setImmediate); };
function verificar(condicion, mensaje) { assert.ok(condicion, mensaje); comprobaciones++; }

async function entorno(pagina, rol = null) {
    const dom = new JSDOM(await leer('../' + pagina.split('?')[0]), { url: 'https://movanza.example/' + pagina });
    dom.window.matchMedia = () => ({ matches: false, addEventListener() {} });
    const estado = {
        rol, usuario: rol ? { id: 'usuario-auth', email: 'prueba@example.test' } : null,
        consultas: 0, altas: [], accesos: [], importaciones: [], redirecciones: [], eventos: []
    };
    const supabase = {
        auth: {
            getUser: async () => ({ data: { user: estado.usuario }, error: null }),
            getSession: async () => ({ data: { session: estado.usuario ? { user: estado.usuario } : null }, error: null }),
            signUp: async datos => {
                estado.altas.push(datos);
                if (estado.requiereConfirmacion) return { data: { session: null }, error: null };
                estado.rol = datos.options.data.rol;
                estado.usuario = { id: 'usuario-auth', email: datos.email };
                return { data: { session: { user: estado.usuario } }, error: null };
            },
            signInWithPassword: async datos => {
                estado.accesos.push(datos);
                if (estado.esperaAcceso) await estado.esperaAcceso;
                if (estado.errorAcceso) return { error: estado.errorAcceso };
                estado.usuario = { id: 'usuario-auth', email: 'prueba@example.test' };
                return { error: null };
            },
            signOut: async () => {
                estado.usuario = null;
                estado.eventos.forEach(evento => evento('SIGNED_OUT', null));
                return { error: null };
            },
            onAuthStateChange: accion => { estado.eventos.push(accion); }
        },
        from: tabla => {
            assert.equal(tabla, 'perfiles');
            estado.consultas++;
            const consulta = {
                select: columnas => { verificar(columnas.includes('rol'), 'Consulta el rol en la base'); return consulta; },
                eq: (columna, id) => { assert.equal(columna, 'usuario_auth_id'); assert.equal(id, estado.usuario.id); return consulta; },
                single: async () => ({
                    data: { id: 1, nombre_usuario: 'prueba', nombre_completo: 'Prueba', rol: estado.rol },
                    error: estado.errorPerfil || null
                })
            };
            return consulta;
        }
    };
    const contexto = vm.createContext({
        document: dom.window.document,
        window: dom.window, MutationObserver: dom.window.MutationObserver, URLSearchParams,
        sessionStorage: dom.window.sessionStorage,
        location: { search: dom.window.location.search, replace: url => estado.redirecciones.push(url) },
        console: { error: () => {} }, setTimeout, clearTimeout
    });
    const cache = new Map();
    const moduloSupabase = new vm.SyntheticModule(['supabase'], function () {
        this.setExport('supabase', supabase);
    }, { context: contexto });
    async function cargar(nombre) {
        if (cache.has(nombre)) return cache.get(nombre);
        const modulo = new vm.SourceTextModule((nombre === 'alertas.js' ? await readFile(new URL('./alertas-simuladas.js', import.meta.url), 'utf8') : await leer('../scripts/' + nombre)), {
            context: contexto, identifier: nombre,
            importModuleDynamically: async ruta => {
                estado.importaciones.push(ruta);
                const vacio = new vm.SyntheticModule([], () => {}, { context: contexto });
                await vacio.link(() => {});
                await vacio.evaluate();
                return vacio;
            }
        });
        cache.set(nombre, modulo);
        await modulo.link(ruta => ruta.includes('supabase.js') ? moduloSupabase : cargar(ruta.replace('./', '')));
        return modulo;
    }
    async function cargarInterfaz() {
        new vm.Script(await leer('../scripts/componentes-publicos.js')).runInContext(contexto);
        let importacion;
        new vm.Script(await leer('../scripts/auth-interfaz.js'), {
            importModuleDynamically: () => importacion = (async () => {
                if (estado.errorImportacion) throw new Error('CDN no disponible');
                const modulo = await cargar('autenticacion.js');
                await modulo.evaluate();
                return modulo;
            })()
        }).runInContext(contexto);
        await importacion?.catch(() => {});
        await esperar();
    }
    return { dom, estado, cargar, cargarInterfaz, document: dom.window.document };
}

const esperados = {
    empresa: ['trabajos', 'mensajes', 'estadisticas', 'equipo', 'empresas'],
    trabajador: ['mis_asignaciones', 'mis_invitaciones', 'mensajes'],
    administrador: ['administracion']
};
for (const [rol, permitidos] of Object.entries(esperados)) {
    const e = await entorno('index.html', rol);
    const acceso = await e.cargar('acceso.js');
    await acceso.evaluate();
    for (const modulo of Object.keys(acceso.namespace.MODULOS)) {
        verificar(acceso.namespace.puedeAbrirModulo(rol, modulo) === permitidos.includes(modulo),
            `Matriz de acceso: ${rol}/${modulo}`);
    }
    verificar(!acceso.namespace.puedeAbrirModulo(rol, 'inexistente'), 'Deniega módulos desconocidos');
    verificar(!acceso.namespace.puedeAbrirModulo(rol, '__proto__'), 'Deniega propiedades del prototipo');
    const inicio = await e.cargar('autenticacion.js');
    await inicio.evaluate();
    await esperar();
    verificar(!e.document.getElementById('seccion-perfil').classList.contains('oculto'), 'Muestra el perfil autenticado');
    const cuentaCabecera = e.document.querySelector('.cabecera-publica .menu-cuenta');
    verificar(cuentaCabecera && !cuentaCabecera.hidden && cuentaCabecera.querySelector('summary').textContent.includes('Cuenta'), 'Tras verificar la sesión los tres roles tienen el menú Cuenta');
    verificar(e.document.querySelector('.cabecera-publica .boton-acceso').hidden, 'El encabezado deja de ofrecer Login después de autenticar');
    verificar(cuentaCabecera.querySelector('[data-abrir-perfil]')?.tagName === 'BUTTON', 'Mi perfil abre un modal sin destino de navegacion');
    verificar(!e.document.querySelector('#modulos-cuenta, #formulario-perfil'), 'El Index no duplica el perfil ni sus enlaces antiguos');
    cuentaCabecera.querySelector('#cerrar-sesion').click();
    await esperar();
    verificar(!e.document.getElementById('seccion-acceso').classList.contains('oculto'), 'El cierre de sesión conserva el acceso al Login');
    verificar(cuentaCabecera.hidden && !e.document.querySelector('.cabecera-publica .boton-acceso').hidden, 'Cerrar sesión restaura el encabezado público');
    e.dom.window.close();
}

const destinos = { empresa: './home_empresa_1.html', trabajador: './home_trabajador.html', administrador: './paginas/administracion.html' };
{
    const e = await entorno('index.html');
    await (await e.cargar('autenticacion.js')).evaluate(); await esperar();
    verificar(!e.document.querySelector('.cabecera-publica .menu-cuenta') && !e.document.querySelector('.cabecera-publica .boton-acceso').hidden, 'Sin sesión no se muestra Cuenta ni se sustituye Iniciar sesión');
    e.dom.window.close();
}
for (const pagina of ['login.html', 'signup.html']) {
    const e = await entorno(pagina);
    const otra = pagina === 'login.html' ? 'signup.html' : 'login.html';
    verificar(e.document.querySelector(`a[href="./${otra}"]`), 'Las dos interfaces enlazan entre sí');
    verificar(e.document.querySelector('a[href="./index.html"]'), 'Cada interfaz permite regresar al Index');
    verificar(!e.document.querySelector('a[href^="#"]'), 'El acceso no utiliza fragmentos como rutas');
    verificar(e.document.querySelectorAll('form').length === 1, 'Cada ruta contiene únicamente su formulario');
    for (const recurso of e.document.querySelectorAll('link[href], script[src]')) {
        await leer('../' + (recurso.getAttribute('src') || recurso.getAttribute('href')));
        comprobaciones++;
    }
    e.dom.window.close();
}
for (const rol of ['empresa', 'trabajador']) {
    const e = await entorno('signup.html');
    await (await e.cargar('autenticacion.js')).evaluate();
    await esperar();
    const selector = e.document.getElementById('rol-registro');
    assert.deepEqual([...selector.options].map(o => o.value), ['', 'empresa', 'trabajador']);
    comprobaciones++;
    selector.value = rol;
    e.document.getElementById('correo-registro').value = 'alta@example.test';
    e.document.getElementById('clave-registro').value = 'clave-de-prueba';
    e.document.getElementById('confirmar-clave').value = 'clave-de-prueba';
    e.dom.window.sessionStorage.setItem('movanza_empresa_activa', '999');
    e.document.getElementById('formulario-registro').dispatchEvent(new e.dom.window.Event('submit', { cancelable: true }));
    await esperar();
    verificar(e.estado.altas.length === 1 && e.estado.altas[0].options.data.rol === rol, 'Envía el tipo de cuenta al registro');
    verificar(e.dom.window.sessionStorage.getItem('movanza_empresa_activa') === null, 'El alta limpia la empresa de otra sesión');
    verificar(e.estado.redirecciones.includes(destinos[rol]), 'El alta con sesión abre el módulo correspondiente al rol');
    e.dom.window.close();
}

// Auth puede exigir confirmar el correo antes de entregar una sesión.
{
    const e = await entorno('signup.html');
    e.estado.requiereConfirmacion = true;
    await (await e.cargar('autenticacion.js')).evaluate();
    await esperar();
    e.document.getElementById('rol-registro').value = 'trabajador';
    e.document.getElementById('correo-registro').value = 'confirmar@example.test';
    e.document.getElementById('clave-registro').value = 'clave-de-prueba';
    e.document.getElementById('confirmar-clave').value = 'clave-de-prueba';
    e.document.getElementById('formulario-registro').dispatchEvent(new e.dom.window.Event('submit', { cancelable: true }));
    await esperar();
    verificar(e.estado.redirecciones.includes('./login.html?registro=confirmar'), 'El alta sin sesión vuelve a la página de Login');
    const login = await entorno('login.html?registro=confirmar');
    await (await login.cargar('autenticacion.js')).evaluate();
    await esperar();
    verificar(login.document.getElementById('mensaje').textContent.includes('Revisa tu correo'), 'Explica la confirmación del correo');
    login.dom.window.close();
    const opcion = e.document.createElement('option');
    opcion.value = 'administrador';
    e.document.getElementById('rol-registro').appendChild(opcion);
    e.document.getElementById('rol-registro').value = 'administrador';
    e.document.getElementById('formulario-registro').dispatchEvent(new e.dom.window.Event('submit', { cancelable: true }));
    await esperar();
    verificar(e.estado.altas.length === 1, 'No envía un alta de administrador al modificar el formulario');
    e.dom.window.close();
}

for (const rol of Object.keys(esperados)) {
    const e = await entorno('login.html');
    await (await e.cargar('autenticacion.js')).evaluate();
    await esperar();
    e.estado.rol = rol;
    e.document.getElementById('correo-acceso').value = 'prueba@example.test';
    e.document.getElementById('clave-acceso').value = 'clave-de-prueba';
    e.document.getElementById('formulario-acceso').dispatchEvent(new e.dom.window.Event('submit', { cancelable: true }));
    await esperar();
    verificar(e.estado.redirecciones.includes(destinos[rol]), 'Los tres roles son dirigidos a su módulo');
    verificar(e.estado.consultas > 0, 'El inicio comprueba el rol en la base');
    e.dom.window.close();
}

// Interfaces reales con el mismo módulo Auth y transporte simulado.
for (const rol of Object.keys(destinos)) {
    for (const pagina of ['login.html', 'signup.html']) {
        const e = await entorno(pagina, rol);
        await e.cargarInterfaz();
        verificar(e.estado.redirecciones.includes(destinos[rol]), 'Abrir o recargar con sesión resuelve el destino del rol');
        e.dom.window.close();
    }
}
{
    const e = await entorno('login.html');
    await e.cargarInterfaz();
    const d = e.document;
    const activo = () => d.querySelector('.input-section[aria-hidden="false"]');
    verificar(activo().dataset.paso === '0', 'Login inicia en el paso de correo');
    d.querySelector('.siguiente-paso').click();
    verificar(activo().dataset.paso === '0', 'No avanza con correo vacío');
    d.getElementById('correo-acceso').value = 'invalido';
    d.querySelector('.siguiente-paso').click();
    verificar(activo().dataset.paso === '0', 'Valida el formato de correo');
    d.getElementById('correo-acceso').value = 'prueba@example.test';
    d.getElementById('correo-acceso').dispatchEvent(new e.dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    verificar(activo().dataset.paso === '1', 'Pliega correo y muestra contraseña');
    const clave = d.getElementById('clave-acceso');
    clave.value = 'clave-de-prueba';
    const ojo = d.querySelector('[data-clave]');
    ojo.click();
    verificar(clave.type === 'text' && ojo.getAttribute('aria-pressed') === 'true', 'Permite mostrar la contraseña');
    ojo.click();
    verificar(clave.type === 'password', 'Permite ocultar la contraseña');
    d.getElementById('paso-anterior').click();
    verificar(activo().dataset.paso === '0' && clave.value === 'clave-de-prueba', 'Anterior conserva los valores');
    d.querySelector('.siguiente-paso').click();
    let resolver;
    e.estado.esperaAcceso = new Promise(r => { resolver = r; });
    e.estado.errorAcceso = { code: 'invalid_credentials', message: 'Invalid login credentials' };
    const formulario = d.getElementById('formulario-acceso');
    formulario.dispatchEvent(new e.dom.window.Event('submit', { cancelable: true }));
    formulario.dispatchEvent(new e.dom.window.Event('submit', { cancelable: true }));
    await esperar();
    verificar(e.estado.accesos.length === 1, 'Evita envíos duplicados durante la solicitud');
    verificar(!d.querySelector('.movanza-loader').hidden, 'Muestra el loader durante la respuesta real');
    resolver();
    await esperar();
    verificar(d.getElementById('mensaje').textContent.includes('no son correctos'), 'Traduce las credenciales incorrectas a un mensaje claro');
    verificar(d.querySelector('.movanza-loader').hidden && !d.querySelector('[type="submit"]').disabled, 'El error retira el loader y permite reintentar');
    e.estado.errorAcceso = null;
    e.estado.rol = 'empresa';
    formulario.dispatchEvent(new e.dom.window.Event('submit', { cancelable: true }));
    await esperar();
    verificar(e.estado.redirecciones.includes(destinos.empresa), 'El reintento utiliza el mismo servicio y resuelve el rol');
    e.dom.window.close();
}
{
    const e = await entorno('signup.html');
    await e.cargarInterfaz();
    const d = e.document;
    const pasos = [...d.querySelectorAll('.input-section')];
    const avanzar = (indice, valor) => {
        pasos[indice].querySelector('input, select').value = valor;
        pasos[indice].querySelector('.siguiente-paso').click();
    };
    avanzar(0, 'trabajador');
    avanzar(1, 'alta@example.test');
    avanzar(2, 'clave-de-prueba');
    verificar(pasos[3].getAttribute('aria-hidden') === 'false' && e.estado.altas.length === 0, 'Los pasos no crean cuentas antes del envío final');
    d.getElementById('confirmar-clave').value = 'otra-clave';
    const formulario = d.getElementById('formulario-registro');
    formulario.dispatchEvent(new e.dom.window.Event('submit', { cancelable: true }));
    await esperar();
    verificar(e.estado.altas.length === 0 && d.getElementById('mensaje').textContent.includes('no coinciden'), 'Conserva la confirmación de contraseña');
    d.getElementById('confirmar-clave').value = 'clave-de-prueba';
    formulario.dispatchEvent(new e.dom.window.Event('submit', { cancelable: true }));
    await esperar();
    verificar(e.estado.altas[0].options.data.rol === 'trabajador', 'El formulario por pasos conserva el metadato de rol');
    verificar(e.estado.redirecciones.includes(destinos.trabajador), 'Registro con sesión abre el módulo del trabajador');
    e.dom.window.close();
}
{
    const e = await entorno('login.html');
    e.estado.errorImportacion = true;
    await e.cargarInterfaz();
    verificar(e.document.getElementById('mensaje').textContent.includes('No se pudo cargar'), 'Informa cuando no se puede cargar Auth');
    verificar(e.document.querySelector('.movanza-loader').hidden, 'La carga fallida no deja un spinner permanente');
    verificar(e.document.querySelector('[type="submit"]').disabled, 'No permite enviar sin cargar Auth');
    e.dom.window.close();
}
{
    const e = await entorno('login.html');
    await e.cargarInterfaz();
    e.estado.rol = 'inventado';
    e.document.getElementById('correo-acceso').value = 'prueba@example.test';
    e.document.querySelector('.siguiente-paso').click();
    e.document.getElementById('clave-acceso').value = 'clave-de-prueba';
    e.document.querySelector('form').dispatchEvent(new e.dom.window.Event('submit', { cancelable: true }));
    await esperar();
    verificar(e.estado.redirecciones.length === 0, 'No redirige a un panel con un rol inválido');
    verificar(e.document.getElementById('mensaje').textContent.includes('rol válido'), 'Informa que no pudo verificar un rol permitido');
    verificar(e.document.querySelector('.movanza-loader').hidden, 'La denegación de rol retira el loader');
    e.dom.window.close();
}
{
    const e = await entorno('login.html?presentacion=modal');
    const mensajes = [];
    Object.defineProperty(e.dom.window, 'parent', { configurable: true, value: { postMessage: (datos, origen) => mensajes.push({ datos, origen }) } });
    await e.cargarInterfaz();
    verificar(e.document.body.classList.contains('auth-en-modal'), 'La ruta independiente admite presentación superpuesta');
    verificar(!e.document.querySelector('.auth-fondo'), 'No carga otra copia del Index dentro de la ventana superpuesta');
    verificar(new URL(e.document.querySelector('.auth-alternativa a').href).searchParams.get('presentacion') === 'modal', 'Cambiar entre Login y Sign Up conserva la superposición');
    e.document.dispatchEvent(new e.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    verificar(mensajes.some(m => m.datos.tipo === 'movanza:auth-cerrar'), 'Escape solicita cerrar la superposición');
    e.estado.rol = 'trabajador';
    e.document.getElementById('correo-acceso').value = 'prueba@example.test';
    e.document.querySelector('.siguiente-paso').click();
    e.document.getElementById('clave-acceso').value = 'clave-de-prueba';
    e.document.querySelector('form').dispatchEvent(new e.dom.window.Event('submit', { cancelable: true }));
    await esperar();
    verificar(mensajes.some(m => m.datos.tipo === 'movanza:auth-completa' && m.datos.destino === destinos.trabajador && m.origen === 'https://movanza.example'), 'La sesión comunica el destino validado al Index');
    verificar(e.estado.redirecciones.length === 0, 'El panel privado no se abre dentro del iframe');
    e.dom.window.close();
}
{
    const e = await entorno('signup.html?presentacion=modal');
    Object.defineProperty(e.dom.window, 'parent', { configurable: true, value: { postMessage: () => {} } });
    e.estado.requiereConfirmacion = true;
    await e.cargarInterfaz();
    const pasos = [...e.document.querySelectorAll('.input-section')];
    for (const [i, valor] of ['trabajador', 'alta@example.test', 'clave-de-prueba', 'clave-de-prueba'].entries()) {
        pasos[i].querySelector('input, select').value = valor;
        pasos[i].querySelector('.siguiente-paso')?.click();
    }
    e.document.querySelector('form').dispatchEvent(new e.dom.window.Event('submit', { cancelable: true }));
    await esperar();
    verificar(e.estado.redirecciones.includes('./login.html?registro=confirmar&presentacion=modal'), 'La confirmación de correo conserva el Login superpuesto');
    e.dom.window.close();
}
{
    const e = await entorno('paginas/trabajos.html', 'empresa');
    e.estado.errorPerfil = new Error('No se pudo leer el perfil');
    await (await e.cargar('modulo.js')).evaluate();
    verificar(e.estado.importaciones.length === 0, 'No carga módulos ante errores de la base');
    verificar(Boolean(e.document.querySelector('[role="alert"]')), 'Muestra el fallo de verificación sin conceder acceso');
    e.dom.window.close();
}

for (const [rol, permitidos] of Object.entries(esperados)) {
    for (const modulo of ['trabajos', 'mis_asignaciones', 'mis_invitaciones', 'mensajes', 'estadisticas', 'equipo', 'empresas', 'administracion']) {
        const e = await entorno(`paginas/${modulo}.html`, rol);
        verificar(e.document.querySelector('main').hidden, 'El módulo permanece oculto antes de verificar el acceso');
        if (['equipo', 'trabajos', 'estadisticas', 'mis_asignaciones', 'mis_invitaciones'].includes(modulo)) {
            const interfaz = await e.cargar(({ mis_asignaciones: 'asignaciones', mis_invitaciones: 'invitaciones' }[modulo] || modulo) + '-interfaz.js');
            await interfaz.evaluate();
            await interfaz.namespace[{ equipo: 'iniciarEquipo', trabajos: 'iniciarTrabajos', estadisticas: 'iniciarEstadisticas', mis_asignaciones: 'iniciarMisAsignaciones', mis_invitaciones: 'iniciarMisInvitaciones' }[modulo]]();
        } else {
            await (await e.cargar('modulo.js')).evaluate();
        }
        const permitido = permitidos.includes(modulo);
        verificar(e.estado.importaciones.length === (permitido && modulo !== 'administracion' ? 1 : 0),
            'Solo importa el código del módulo autorizado');
        verificar(Boolean(e.document.querySelector('[role="alert"]')) === !permitido,
            'El acceso directo ajeno muestra una denegación');
        verificar(e.document.querySelector('main').hidden === (['equipo', 'trabajos', 'estadisticas', 'mis_asignaciones', 'mis_invitaciones'].includes(modulo) && !permitido), 'Resuelve la pantalla de carga sin revelar módulos empresariales a otros roles');
        verificar((['equipo', 'trabajos', 'estadisticas', 'mis_asignaciones', 'mis_invitaciones'].includes(modulo) ? !e.document.getElementById('sitio-' + ({ mis_asignaciones: 'asignaciones', mis_invitaciones: 'invitaciones' }[modulo] || modulo)).hidden : Boolean(e.document.querySelector('header .menu-cuenta'))) === permitido, 'Cuenta solo se muestra en módulos autorizados de los tres perfiles');
        if (permitido) {
            verificar(e.document.querySelector('.menu-cuenta [data-abrir-perfil]')?.tagName === 'BUTTON', 'Los modulos abren el perfil sin navegar');
            e.document.querySelector('.menu-cuenta #cerrar-sesion').click(); await esperar();
            verificar(e.document.querySelector('main').hidden && e.estado.redirecciones[0] === (['mis_asignaciones', 'mis_invitaciones'].includes(modulo) ? '../login.html' : '../index.html'), 'Cuenta permite cerrar sesión sin alterar las operaciones del módulo');
        }
        e.dom.window.close();
    }
}
for (const rol of [null, 'inventado']) {
    const e = await entorno('paginas/administracion.html', rol);
    await (await e.cargar('modulo.js')).evaluate();
    verificar(e.estado.importaciones.length === 0, 'No importa código sin rol válido');
    if (!rol) verificar(e.estado.redirecciones[0] === '../index.html', 'Sin sesión vuelve al inicio');
    else verificar(Boolean(e.document.querySelector('[role="alert"]')), 'Deniega roles inválidos');
    e.dom.window.close();
}
console.log(`Navegación, registro y acceso directo: ${comprobaciones} comprobaciones correctas.`);
