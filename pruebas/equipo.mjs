import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { encabezadoEmpresarial } from '../scripts/encabezado-empresarial.js';

if (!process.argv[2]) throw new Error('Indica el directorio temporal con jsdom.');
const { JSDOM } = await import(pathToFileURL(join(resolve(process.argv[2]), 'node_modules/jsdom/lib/api.js')));
const leer = ruta => readFile(new URL('../' + ruta, import.meta.url), 'utf8');
const esperar = () => new Promise(r => setTimeout(r, 50));
let comprobaciones = 0;
function verificar(valor, mensaje) { assert.ok(valor, mensaje); comprobaciones++; }

async function entorno({ rol = 'empresa', id = '2' } = {}) {
    const dom = new JSDOM(await leer('paginas/equipo.html'), { url: 'https://movanza.example/paginas/equipo.html' });
    if (id !== null) dom.window.sessionStorage.setItem('movanza_empresa_activa', id);
    const estado = { rol, usuario: rol ? { id: 'auth-7' } : null, eventos: [], consultas: [], rpc: [], redirecciones: [],
        miembros: [{ id: 30, empresa_id: 2, trabajador_id: 10, alias_interno: 'Vendedor', estado: 'activa', fecha_ingreso: '2026-10-17' }, { id: 31, empresa_id: 99, trabajador_id: 90, alias_interno: 'Ajeno', estado: 'activa' }],
        perfiles: [{ id: 10, nombre_usuario: 'trabajador_real', nombre_completo: 'Nombre real' }, { id: 90, nombre_usuario: 'otra_empresa', nombre_completo: 'Integrante ajeno' }],
        invitaciones: [{ empresa_id: 2, nombre_usuario: 'invitado_real', estado: 'pendiente', creada_en: '2026-10-17' }, { empresa_id: 99, nombre_usuario: 'invitado_ajeno', estado: 'pendiente' }, { empresa_id: 2, nombre_usuario: 'aceptada', estado: 'aceptada' }],
        resultado: [{ id: 11, nombre_usuario: 'nuevo_usuario' }]
    };
    const supabase = {
        auth: {
            getUser: async () => ({ data: { user: estado.usuario }, error: null }),
            onAuthStateChange: fn => estado.eventos.push(fn),
            signOut: async () => {
                if (estado.errorSalida) return { error: new Error('Fallo de red') };
                estado.eventos.forEach(fn => fn('SIGNED_OUT', null));
                return { error: null };
            }
        },
        from: tabla => {
            const consulta = { tabla, filtros: [] }; estado.consultas.push(consulta);
            return {
                select(campos) { consulta.campos = campos; return this; },
                eq(campo, valor) { consulta.filtros.push([campo, valor]); return this; },
                single: async () => {
                    if (tabla === 'perfiles') return { data: { id: 7, rol: estado.rol, nombre_usuario: 'empresa_real' }, error: estado.errorPerfil ? new Error('Error de perfil') : null };
                    assert.equal(tabla, 'empresas');
                    assert.equal(consulta.campos, 'id, nombre, propietario_id');
                    assert.deepEqual(consulta.filtros, [['id', id], ['propietario_id', 7]]);
                    if (estado.esperaEmpresa) await estado.esperaEmpresa;
                    return estado.empresaAjena ? { data: null, error: { code: 'PGRST116' } } : { data: { id: 2, nombre: 'Empresa real', propietario_id: 7 }, error: null };
                },
                order: async (columna, opciones) => {
                    assert.equal(tabla, 'membresias');
                    assert.equal(consulta.campos, 'id, trabajador_id, alias_interno, estado, fecha_ingreso');
                    assert.deepEqual(consulta.filtros, [['empresa_id', 2], ['estado', 'activa']]);
                    assert.equal(columna, 'fecha_ingreso'); assert.equal(opciones.ascending, false);
                    if (estado.errorMiembros) return { data: null, error: new Error('No se pudieron consultar los integrantes') };
                    return { data: estado.miembros.filter(m => m.empresa_id === 2 && m.estado === 'activa'), error: null };
                },
                in: async (campo, ids) => {
                    assert.equal(tabla, 'perfiles'); assert.equal(campo, 'id');
                    assert.equal(consulta.campos, 'id, nombre_usuario, nombre_completo');
                    consulta.ids = [...ids];
                    return { data: estado.perfiles.filter(p => ids.includes(p.id)), error: null };
                }
            };
        },
        rpc: async (nombre, datos) => {
            estado.rpc.push({ nombre, datos });
            if (estado.esperaRPC === nombre) await estado.esperaOperacion;
            if (estado.errorRPC === nombre) return { data: null, error: { code: estado.codigoError || 'RED', message: 'Error de la operación' } };
            if (nombre === 'listar_invitaciones_visibles') return { data: estado.invitaciones, error: null };
            if (nombre === 'buscar_trabajador') return { data: estado.resultado, error: null };
            if (nombre === 'enviar_invitacion') estado.invitaciones.push({ empresa_id: datos.empresa_id, nombre_usuario: 'nuevo_usuario', estado: 'pendiente', creada_en: '2026-10-17' });
            if (nombre === 'cambiar_alias') estado.miembros.find(m => m.trabajador_id === datos.trabajador_id).alias_interno = datos.alias_interno;
            if (nombre === 'retirar_trabajador') estado.miembros.find(m => m.trabajador_id === datos.trabajador_id).estado = 'retirada';
            return { data: null, error: null };
        }
    };
    const contexto = vm.createContext({ document: dom.window.document, window: dom.window, sessionStorage: dom.window.sessionStorage,
        MutationObserver: dom.window.MutationObserver, location: { replace: url => estado.redirecciones.push(url) }, console: { error() {} } });
    const proveedor = new vm.SyntheticModule(['supabase'], function () { this.setExport('supabase', supabase); }, { context: contexto });
    const cache = new Map();
    async function cargar(nombre) {
        if (cache.has(nombre)) return cache.get(nombre);
        const modulo = new vm.SourceTextModule((nombre === 'alertas.js' ? await readFile(new URL('./alertas-simuladas.js', import.meta.url), 'utf8') : await leer('scripts/' + nombre)), { context: contexto,
            importModuleDynamically: async ruta => { const m = await cargar(ruta.replace('./', '')); await m.evaluate(); return m; } });
        cache.set(nombre, modulo);
        await modulo.link(ruta => ruta.includes('supabase.js') ? proveedor : cargar(ruta.replace('./', '')));
        return modulo;
    }
    async function iniciar() {
        new vm.Script(await leer('scripts/componentes-publicos.js')).runInContext(contexto);
        let importacion;
        new vm.Script(await leer('scripts/equipo-carga.js'), { importModuleDynamically: () => importacion = (async () => {
            if (estado.errorCarga) throw new Error('CDN no disponible');
            const m = await cargar('equipo-interfaz.js'); await m.evaluate(); return m;
        })() }).runInContext(contexto);
        await importacion?.catch(() => {}); await esperar();
    }
    return { dom, document: dom.window.document, estado, iniciar };
}

{
    const t = await entorno();
    verificar(t.document.getElementById('sitio-equipo').hidden, 'El shell empresarial empieza oculto');
    await t.iniciar();
    verificar(!t.document.getElementById('sitio-equipo').hidden, 'La cuenta autorizada ve el módulo');
    verificar(t.document.getElementById('titulo-empresa').textContent === 'Empresa real', 'El banner identifica la empresa real');
    verificar(t.document.getElementById('titulo-equipo').textContent === 'Gestiona tu equipo de trabajo', 'El banner tiene el título propio solicitado');
    const cabecera = new JSDOM(encabezadoEmpresarial({ raiz: '../', actual: 'equipo' }));
    const esperado = cabecera.window.document.querySelector('header');
    esperado.querySelector('#usuario-empresarial').textContent = 'empresa_real';
    esperado.querySelector('[data-estadisticas-empresa]').setAttribute('href', './estadisticas.html?empresa=2');
    verificar(t.document.querySelector('header').outerHTML === esperado.outerHTML, 'Reutiliza exactamente el encabezado empresarial con Equipo activo');
    cabecera.window.close();
    const indice = new JSDOM(await leer('index.html'));
    const pie = indice.window.document.querySelector('footer').cloneNode(true);
    pie.querySelectorAll('a[href^="#"]').forEach(a => a.setAttribute('href', '../index.html' + a.getAttribute('href')));
    verificar(t.document.querySelector('footer').outerHTML === pie.outerHTML, 'Reutiliza el footer completo del Index');
    indice.window.close();
    for (const recurso of t.document.querySelectorAll('img[src], link[rel="stylesheet"], script[src], a[href^="../"], a[href^="./"]')) {
        const ruta = decodeURIComponent(recurso.getAttribute('src') || recurso.getAttribute('href')).split(/[?#]/)[0];
        await access(new URL('../paginas/' + ruta, import.meta.url)); comprobaciones++;
    }
    verificar(t.document.querySelectorAll('#lista-integrantes .grid-1-5').length === 1 && !t.document.querySelector('main').textContent.includes('Integrante ajeno'), 'Solo presenta integrantes de la empresa activa con el recurso de tabla');
    verificar(t.document.querySelectorAll('#lista-pendientes .grid-1-5').length === 1 && !t.document.getElementById('lista-pendientes').textContent.includes('invitado_ajeno'), 'Conserva el filtro de invitaciones por empresa y estado');
    verificar(t.document.getElementById('lista-integrantes').textContent.includes('Nombre real') && t.document.querySelector('#lista-integrantes input').value === 'Vendedor', 'Conserva nombres reales y alias');
    t.document.querySelector('#lista-integrantes input').value = '  Alias actualizado  ';
    t.document.querySelector('#lista-integrantes button').click(); await esperar();
    const alias = t.estado.rpc.find(r => r.nombre === 'cambiar_alias');
    verificar(alias.datos.empresa_id === 2 && alias.datos.trabajador_id === 10 && alias.datos.alias_interno === 'Alias actualizado', 'Guardar alias conserva RPC, empresa, trabajador y normalización');
    verificar(t.document.querySelector('#lista-integrantes input').value === 'Alias actualizado', 'La actualización conserva el refresco de datos');
    t.document.getElementById('nombre-buscado').value = ' NUEVO_USUARIO ';
    t.document.getElementById('formulario-busqueda').dispatchEvent(new t.dom.window.Event('submit', { cancelable: true })); await esperar();
    verificar(t.estado.rpc.find(r => r.nombre === 'buscar_trabajador').datos.p_nombre_usuario === 'nuevo_usuario', 'Buscar conserva su normalización y RPC');
    verificar(t.document.querySelector('#resultado-busqueda .grid-1-5 button').textContent === 'Enviar invitación', 'El resultado mantiene su acción y la presentación del recurso');
    t.document.querySelector('#resultado-busqueda button').click(); await esperar();
    const invitacion = t.estado.rpc.find(r => r.nombre === 'enviar_invitacion');
    verificar(invitacion.datos.empresa_id === 2 && invitacion.datos.trabajador_id === 11, 'Enviar invitación conserva la asociación existente');
    verificar(!t.document.getElementById('resultado-busqueda').children.length && t.document.getElementById('nombre-buscado').value === '' && t.document.getElementById('mensaje').textContent === 'Invitación enviada correctamente.', 'Conserva el restablecimiento y mensaje de éxito');
    t.dom.window.confirm = () => false;
    t.document.querySelector('#lista-integrantes .boton-peligro').click(); await esperar();
    verificar(!t.estado.rpc.some(r => r.nombre === 'retirar_trabajador'), 'Cancelar la confirmación no retira al integrante');
    t.dom.window.confirm = () => true;
    t.document.querySelector('#lista-integrantes .boton-peligro').click(); await esperar();
    verificar(t.estado.rpc.find(r => r.nombre === 'retirar_trabajador').datos.trabajador_id === 10 && t.document.getElementById('lista-integrantes').textContent.includes('todavía no tiene'), 'Retirar conserva RPC, confirmación y refresco de lista vacía');
    t.document.querySelector('.menu-empresarial').click();
    verificar(t.document.querySelector('.menu-empresarial').getAttribute('aria-expanded') === 'true', 'El menú móvil mantiene su comportamiento compartido');
    t.estado.errorSalida = true; t.document.getElementById('cerrar-sesion').click(); await esperar();
    verificar(t.document.getElementById('mensaje-acceso').textContent.includes('No se pudo cerrar') && !t.document.getElementById('cerrar-sesion').disabled, 'Un fallo de salida informa y permite reintentar');
    t.estado.errorSalida = false; t.document.getElementById('cerrar-sesion').click(); await esperar();
    verificar(t.document.getElementById('sitio-equipo').hidden && t.estado.redirecciones[0] === '../index.html' && !t.dom.window.sessionStorage.getItem('movanza_empresa_activa'), 'Salir retira el contenido y limpia el contexto existente');
    t.dom.window.close();
}
for (const rol of [null, 'trabajador', 'administrador']) {
    const t = await entorno({ rol }); await t.iniciar();
    verificar(t.document.getElementById('sitio-equipo').hidden && t.estado.rpc.length === 0 && !t.estado.consultas.some(c => c.tabla === 'empresas'), 'Sin permiso empresarial no carga información del equipo');
    t.dom.window.close();
}
for (const opciones of [{ id: null }, { id: 'inválido' }, { empresaAjena: true }]) {
    const t = await entorno(opciones); if (opciones.empresaAjena) t.estado.empresaAjena = true; await t.iniciar();
    verificar(!t.estado.consultas.some(c => c.tabla === 'membresias') && t.estado.rpc.length === 0, 'Un contexto ausente, inválido o ajeno no consulta integrantes ni invitaciones');
    verificar(t.document.getElementById('mensaje').classList.contains('error') && t.document.querySelector('#formulario-busqueda button').disabled, 'El error conserva su mensaje y bloquea el formulario');
    verificar(!t.document.querySelector('main').textContent.includes('Cargando'), 'Un error no deja estados de carga permanentes');
    t.dom.window.close();
}
for (const fallo of ['errorPerfil', 'errorCarga']) {
    const t = await entorno(); t.estado[fallo] = true; await t.iniciar();
    verificar(t.document.getElementById('sitio-equipo').hidden && t.document.querySelector('[role="alert"]') && t.document.querySelector('.movanza-loader').hidden, 'Los fallos de acceso dejan el contenido oculto y finalizan el loader');
    t.dom.window.close();
}
{
    const t = await entorno(); await t.iniciar();
    t.estado.esperaRPC = 'buscar_trabajador'; let resolver;
    t.estado.esperaOperacion = new Promise(r => { resolver = r; });
    t.document.getElementById('nombre-buscado').value = 'nuevo_usuario';
    t.document.getElementById('formulario-busqueda').dispatchEvent(new t.dom.window.Event('submit', { cancelable: true })); await esperar();
    verificar(!t.document.querySelector('.equipo-estado .movanza-loader').hidden, 'La búsqueda muestra carga durante una espera real');
    t.estado.errorRPC = 'buscar_trabajador'; resolver(); await esperar();
    verificar(t.document.querySelector('.equipo-estado .movanza-loader').hidden && t.document.getElementById('mensaje').classList.contains('error') && t.document.getElementById('nombre-buscado').value === 'nuevo_usuario', 'El error finaliza la carga y conserva la búsqueda');
    t.dom.window.close();
}
{
    const t = await entorno(); t.estado.errorMiembros = true; await t.iniciar();
    verificar(t.document.getElementById('mensaje').textContent.includes('No se pudieron consultar') && t.document.getElementById('lista-integrantes').textContent.includes('No se pudo cargar'), 'Un fallo de consulta muestra errores sin inventar registros');
    t.dom.window.close();
}
{
    const t = await entorno(); let resolver;
    t.estado.esperaEmpresa = new Promise(r => { resolver = r; }); await t.iniciar();
    t.estado.eventos.forEach(fn => fn('SIGNED_OUT', null)); resolver(); await esperar();
    verificar(t.document.getElementById('sitio-equipo').hidden, 'Una respuesta pendiente no revela Equipo tras cerrar sesión');
    t.dom.window.close();
}
console.log(`Equipo: ${comprobaciones} comprobaciones correctas.`);
