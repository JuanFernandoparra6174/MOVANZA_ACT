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
    const dom = new JSDOM(await leer('../' + pagina), { url: 'https://movanza.example/' + pagina });
    const estado = {
        rol, usuario: rol ? { id: 'usuario-auth', email: 'prueba@example.test' } : null,
        consultas: 0, altas: [], importaciones: [], redirecciones: [], eventos: []
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
            signInWithPassword: async () => {
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
        sessionStorage: dom.window.sessionStorage,
        location: { replace: url => estado.redirecciones.push(url) },
        console: { error: () => {} }, setTimeout, clearTimeout
    });
    const cache = new Map();
    const moduloSupabase = new vm.SyntheticModule(['supabase'], function () {
        this.setExport('supabase', supabase);
    }, { context: contexto });
    async function cargar(nombre) {
        if (cache.has(nombre)) return cache.get(nombre);
        const modulo = new vm.SourceTextModule(await leer('../scripts/' + nombre), {
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
    return { dom, estado, cargar, document: dom.window.document };
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
    const enlaces = [...e.document.querySelectorAll('#modulos-cuenta a')].map(a => a.getAttribute('href'));
    assert.deepEqual(enlaces, permitidos.map(modulo => `./paginas/${modulo}.html`));
    comprobaciones++;
    for (const bloque of e.document.querySelectorAll('[data-roles]')) {
        verificar(bloque.classList.contains('oculto') !== bloque.dataset.roles.split(' ').includes(rol),
            'Los bloques corresponden al rol');
    }
    e.dom.window.close();
}

for (const rol of ['empresa', 'trabajador']) {
    const e = await entorno('index.html');
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
    verificar(!e.document.getElementById('seccion-perfil').classList.contains('oculto'), 'El alta con sesión abre el perfil');
    e.document.getElementById('boton-salir').click();
    await esperar();
    verificar(!e.document.getElementById('seccion-acceso').classList.contains('oculto'), 'Cerrar sesión vuelve al acceso');
    e.dom.window.close();
}

// Auth puede exigir confirmar el correo antes de entregar una sesión.
{
    const e = await entorno('index.html');
    e.estado.requiereConfirmacion = true;
    await (await e.cargar('autenticacion.js')).evaluate();
    await esperar();
    e.document.getElementById('rol-registro').value = 'trabajador';
    e.document.getElementById('correo-registro').value = 'confirmar@example.test';
    e.document.getElementById('clave-registro').value = 'clave-de-prueba';
    e.document.getElementById('confirmar-clave').value = 'clave-de-prueba';
    e.document.getElementById('formulario-registro').dispatchEvent(new e.dom.window.Event('submit', { cancelable: true }));
    await esperar();
    verificar(!e.document.getElementById('seccion-acceso').classList.contains('oculto'), 'El alta sin sesión vuelve al acceso');
    verificar(e.document.getElementById('mensaje').textContent.includes('Revisa tu correo'), 'Explica la confirmación del correo');
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
    const e = await entorno('index.html');
    await (await e.cargar('autenticacion.js')).evaluate();
    await esperar();
    e.estado.rol = rol;
    e.document.getElementById('correo-acceso').value = 'prueba@example.test';
    e.document.getElementById('clave-acceso').value = 'clave-de-prueba';
    e.document.getElementById('formulario-acceso').dispatchEvent(new e.dom.window.Event('submit', { cancelable: true }));
    await esperar();
    verificar(!e.document.getElementById('seccion-perfil').classList.contains('oculto'), 'Los tres roles pueden iniciar sesión');
    verificar(e.document.querySelectorAll('#modulos-cuenta a').length === esperados[rol].length, 'El inicio resuelve los módulos del rol de la base');
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
        await (await e.cargar('modulo.js')).evaluate();
        const permitido = permitidos.includes(modulo);
        verificar(e.estado.importaciones.length === (permitido && modulo !== 'administracion' ? 1 : 0),
            'Solo importa el código del módulo autorizado');
        verificar(Boolean(e.document.querySelector('[role="alert"]')) === !permitido,
            'El acceso directo ajeno muestra una denegación');
        verificar(e.document.querySelector('main').hidden === false, 'Resuelve la pantalla de carga');
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
