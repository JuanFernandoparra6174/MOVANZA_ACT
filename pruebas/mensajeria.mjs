import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

if (!process.argv[2]) throw new Error('Indica el directorio temporal con jsdom.');
const { JSDOM } = await import(pathToFileURL(join(resolve(process.argv[2]), 'node_modules/jsdom/lib/api.js')));
const leer = ruta => readFile(new URL('../' + ruta, import.meta.url), 'utf8');
const esperar = async () => { for (let i = 0; i < 12; i++) await new Promise(setImmediate); };
let comprobaciones = 0;
function verificar(valor, mensaje) { assert.ok(valor, mensaje); comprobaciones++; }
const diferida = () => { let resolver; const promesa = new Promise(r => resolver = r); return { promesa, resolver }; };

async function entorno({ movil = false, trabajador = false, rol = trabajador ? 'trabajador' : 'empresa', legado = false } = {}) {
    const ruta = legado ? 'paginas/mensajes.html' : trabajador ? 'home_trabajador.html' : 'home_empresa_2.html';
    const dom = new JSDOM(await leer(ruta), { url: 'https://movanza.example/' + ruta });
    dom.window.HTMLElement.prototype.scrollIntoView = function () {};
    dom.window.matchMedia = () => ({ matches: movil });
    if (movil) {
        const viewport = new dom.window.EventTarget(); viewport.height = 800; viewport.offsetTop = 0;
        Object.defineProperty(dom.window, 'visualViewport', { configurable: true, value: viewport });
    }
    dom.window.sessionStorage.setItem('movanza_empresa_activa', '2');
    const estado = { consultas: [], rpc: [], eventos: [], redirecciones: [],
        perfil: { id: 7, rol, nombre_usuario: 'usuario_real' },
        empresas: [{ id: 2, nombre: 'Empresa permitida', propietario_id: 7 }, { id: 3, nombre: 'Otra empresa', propietario_id: 99 }],
        trabajos: [{ id: 10, empresa_id: 2, nombre: 'Trabajo <b>real</b>' }, { id: 11, empresa_id: 2, nombre: 'Visita real' }, { id: 90, empresa_id: 3, nombre: 'Trabajo ajeno' }],
        asignaciones: [{ id: 100, trabajo_id: 10, trabajador_id: 8, titulo: 'Primera asignación', estado: 'aceptada' }, { id: 101, trabajo_id: 10, trabajador_id: 9, titulo: 'Segunda asignación', estado: 'en_curso' }, { id: 102, trabajo_id: 11, trabajador_id: 8, titulo: 'Visita asignada', estado: 'pendiente' }, { id: 999, trabajo_id: 90, trabajador_id: 1, titulo: 'No visible en el panel', estado: 'aceptada' }],
        mensajes: [{ id: 1, asignacion_id: 100, remitente_id: 7, contenido: 'Mensaje propio <img src=x onerror=alert(1)>', creado_en: '2026-10-17T14:00:00Z' }, { id: 2, asignacion_id: 100, remitente_id: 8, contenido: 'Respuesta del trabajador', creado_en: '2026-10-17T14:01:00Z' }, { id: 3, asignacion_id: 101, remitente_id: 9, contenido: 'Mensaje de la otra asignación', creado_en: '2026-10-17T14:02:00Z' }] };
    const supabase = {
        auth: {
            getUser: async () => ({ data: { user: { id: 'auth-7' } }, error: null }),
            onAuthStateChange: fn => { estado.eventos.push(fn); },
            signOut: async () => { estado.eventos.forEach(fn => fn('SIGNED_OUT', null)); return { error: null }; }
        },
        from(tabla) {
            const consulta = { tabla, filtros: [], orden: [] }; estado.consultas.push(consulta);
            const ejecutar = async () => {
                if (tabla === 'perfiles') return { data: estado.perfil, error: null };
                if (estado.errorTabla === tabla) return { data: null, error: new Error('Error de red de prueba') };
                let datos = estado[tabla].filter(fila => consulta.filtros.every(([tipo, campo, valor]) => estado.ignorarFiltroTrabajador && campo === 'trabajador_id' ? true : tipo === 'in' ? valor.includes(fila[campo]) : String(fila[campo]) === String(valor)));
                if (tabla === 'mensajes') {
                    if (Number(consulta.filtros[0][2]) === estado.sinLectura) return { data: null, error: new Error('Lectura no autorizada') };
                    const pausa = estado.pausaHistorial;
                    if (pausa && Number(consulta.filtros[0][2]) === pausa.id) { estado.pausaHistorial = null; await pausa.promesa; }
                }
                if (tabla === 'asignaciones' && estado.pausaConversaciones) await estado.pausaConversaciones;
                return { data: consulta.single ? datos[0] || null : datos.slice(0, consulta.limite ?? datos.length), error: null };
            };
            const query = { select(campos) { consulta.campos = campos; return this; }, eq(campo, valor) { consulta.filtros.push(['eq', campo, valor]); return this; }, in(campo, valor) { consulta.filtros.push(['in', campo, valor]); return this; }, order(campo, opciones) { consulta.orden.push([campo, opciones]); return this; }, limit(limite) { consulta.limite = limite; return this; }, single() { consulta.single = true; return ejecutar(); }, then(exito, error) { return ejecutar().then(exito, error); } };
            return query;
        },
        async rpc(nombre, datos) {
            estado.rpc.push({ nombre, datos });
            if (estado.pausaEnvio) await estado.pausaEnvio;
            if (estado.errorEnvio || datos.asignacion_id === estado.sinEnvio) return { error: new Error('Envío rechazado') };
            estado.mensajes.push({ id: 50 + estado.rpc.length, asignacion_id: datos.asignacion_id, remitente_id: 7, contenido: datos.contenido, creado_en: '2026-10-17T15:00:00Z' });
            return { error: null };
        }
    };
    const contexto = vm.createContext({ document: dom.window.document, window: dom.window, sessionStorage: dom.window.sessionStorage,
        location: { replace: ruta => estado.redirecciones.push(ruta) }, console: { error() {} } });
    const proveedor = new vm.SyntheticModule(['supabase'], function () { this.setExport('supabase', supabase); }, { context: contexto });
    const cache = new Map();
    async function cargar(nombre) {
        if (cache.has(nombre)) return cache.get(nombre);
        const modulo = new vm.SourceTextModule((nombre === 'alertas.js' ? await readFile(new URL('./alertas-simuladas.js', import.meta.url), 'utf8') : await leer('scripts/' + nombre)), { context: contexto, identifier: nombre }); cache.set(nombre, modulo);
        await modulo.link(ruta => ruta.includes('supabase.js') ? proveedor : cargar(ruta.replace('./', ''))); return modulo;
    }
    new vm.Script(await leer('scripts/componentes-publicos.js')).runInContext(contexto);
    const modulo = await cargar(legado ? 'mensajes.js' : trabajador ? 'home-trabajador.js' : 'home-empresa-2.js'); await modulo.evaluate();
    if (!legado) await (trabajador ? modulo.namespace.iniciarHomeTrabajador() : modulo.namespace.iniciarHomeEmpresa2());
    await esperar();
    const $ = id => dom.window.document.getElementById(id);
    const click = async selector => { const el = dom.window.document.querySelector(selector); assert.ok(el, 'Existe ' + selector); el.click(); await esperar(); };
    const enviar = async texto => { $('contenido-mensaje').value = texto; $('formulario-mensaje').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); await esperar(); };
    const abrirPrimera = async () => { await click('#abrir-mensajeria'); await click('[data-trabajo="10"]'); await click('[data-asignacion="100"]'); };
    return { dom, document: dom.window.document, estado, $, click, enviar, abrirPrimera };
}

{
    const t = await entorno();
    verificar(t.estado.consultas.length === 2, 'No consulta mensajería al cargar Home Empresa 2');
    verificar(t.$('panel-mensajeria').inert && t.$('abrir-mensajeria').getAttribute('aria-expanded') === 'false', 'Panel cerrado e inerte inicialmente');
    const contenido = t.document.querySelector('main').outerHTML, pie = t.document.querySelector('footer').outerHTML;
    await t.click('#abrir-mensajeria');
    verificar(t.estado.consultas.length === 5, 'Reutiliza las tres lecturas originales, sin otra autenticación');
    verificar(t.$('lista-conversaciones').querySelectorAll('.grupo-trabajo').length === 2, 'Agrupa tres asignaciones reales en dos trabajos');
    verificar(!t.$('lista-conversaciones').textContent.includes('ajeno'), 'No mezcla otra empresa aunque el mock devuelva registros ajenos');
    verificar(t.$('lista-conversaciones').textContent.includes('Trabajo <b>real</b>') && !t.$('lista-conversaciones').querySelector('b'), 'Nombres se insertan como texto seguro');
    verificar(t.$('panel-mensajeria').querySelector('.movanza-loader').hidden, 'Loader termina después de la lectura real');
    verificar(t.document.querySelector('[data-asignacion="100"]').closest('.asignaciones-chat').hidden, 'No mezcla historiales: grupo múltiple empieza plegado');
    verificar(!t.estado.consultas.some(c => c.tabla === 'mensajes'), 'No precarga historiales de todas las asignaciones');
    await t.click('[data-trabajo="10"]'); await t.click('[data-asignacion="100"]');
    verificar(t.$('trabajo-conversacion').textContent === 'Trabajo <b>real</b>', 'Encabezado muestra el trabajo real');
    verificar(t.$('titulo-conversacion').textContent === 'Primera asignación', 'Identifica la asignación exacta');
    verificar(t.$('historial-mensajes').querySelectorAll('.burbuja-mensaje').length === 2, 'Lee solamente el historial elegido');
    verificar(t.$('historial-mensajes').querySelector('.mensaje-propio') && t.$('historial-mensajes').querySelector('.mensaje-recibido'), 'Distingue remitentes reales');
    verificar(!t.$('historial-mensajes').querySelector('img'), 'Contenido de mensajes no ejecuta HTML');
    verificar(t.estado.consultas.at(-1).filtros[0][1] === 'asignacion_id' && t.estado.consultas.at(-1).filtros[0][2] === 100, 'Conserva la relación de consulta por asignación');
    verificar(t.document.activeElement === t.$('trabajo-conversacion'), 'Selección por teclado conserva el foco en un encabezado visible');
    t.$('contenido-mensaje').value = 'Borrador de la primera';
    await t.click('[data-asignacion="101"]');
    verificar(t.$('contenido-mensaje').value === '', 'No traslada borradores a otra asignación');
    verificar(t.$('historial-mensajes').textContent.includes('otra asignación') && !t.$('historial-mensajes').textContent.includes('Respuesta del trabajador'), 'No mezcla historiales del mismo trabajo');
    await t.click('[data-asignacion="100"]');
    verificar(t.$('contenido-mensaje').value === 'Borrador de la primera', 'Recupera el borrador por conversación');
    const consultas = t.estado.consultas.length;
    await t.click('#cerrar-mensajeria'); await t.click('#abrir-mensajeria');
    verificar(t.estado.consultas.length === consultas && t.$('contenido-mensaje').value === 'Borrador de la primera', 'Reabrir mantiene estado sin consultas duplicadas');
    const pausa = diferida(); t.estado.pausaEnvio = pausa.promesa;
    await t.enviar('  Mensaje nuevo  '); await t.enviar('Intento duplicado');
    verificar(t.estado.rpc.length === 1 && t.$('boton-enviar-mensaje').disabled, 'Evita envíos duplicados durante una operación real');
    verificar(t.$('contenido-mensaje').readOnly && !t.$('panel-mensajeria').querySelector('.movanza-loader').hidden, 'Bloquea edición mientras envía y muestra carga');
    verificar(t.estado.rpc[0].nombre === 'enviar_mensaje' && t.estado.rpc[0].datos.asignacion_id === 100 && t.estado.rpc[0].datos.contenido === 'Mensaje nuevo', 'Mantiene RPC y parámetros originales sin cambiar el envío');
    pausa.resolver(); await esperar(); t.estado.pausaEnvio = null;
    verificar(t.$('mensaje').textContent.includes('correctamente') && t.$('historial-mensajes').textContent.includes('Mensaje nuevo'), 'Recarga tras envío confirmado');
    verificar(!t.$('boton-enviar-mensaje').disabled && t.$('contenido-mensaje').value === '', 'Finaliza carga y limpia solamente al confirmar');
    t.estado.errorEnvio = true; await t.enviar('No perder este texto');
    verificar(t.$('mensaje').className === 'error' && t.$('contenido-mensaje').value === 'No perder este texto', 'Error conserva borrador y deja formulario abierto');
    verificar(!t.$('boton-enviar-mensaje').disabled && t.$('panel-mensajeria').querySelector('.movanza-loader').hidden, 'Error no deja controles ni loader bloqueados');
    t.estado.errorEnvio = false; t.estado.errorTabla = 'mensajes'; await t.enviar('Envío con lectura fallida');
    verificar(t.$('mensaje').textContent.startsWith('Mensaje enviado. No se pudo actualizar'), 'Distingue envío confirmado de fallo posterior de lectura');
    t.estado.errorTabla = null; await t.click('#boton-actualizar-mensajes');
    verificar(t.$('historial-mensajes').textContent.includes('Envío con lectura fallida'), 'Reintenta lectura sin reenviar el mensaje');
    const historial = t.$('historial-mensajes');
    Object.defineProperty(historial, 'scrollHeight', { configurable: true, value: 2000 }); Object.defineProperty(historial, 'clientHeight', { configurable: true, value: 400 }); historial.scrollTop = 300;
    await t.click('#boton-actualizar-mensajes');
    verificar(historial.scrollTop === 300, 'Actualizar no desplaza a quien lee mensajes anteriores');
    historial.scrollTop = 1590; await t.click('#boton-actualizar-mensajes'); verificar(historial.scrollTop === 2000, 'Sigue el final cuando el usuario ya está al final');
    await t.enviar('  '); verificar(t.$('mensaje').textContent.includes('vacío'), 'Mantiene validación de mensaje vacío');
    await t.enviar('a'.repeat(4001)); verificar(t.$('mensaje').textContent.includes('4000'), 'Mantiene límite real de 4000 caracteres');
    await t.click('[data-trabajo="11"]'); verificar(t.$('historial-mensajes').textContent.includes('Todavía no hay mensajes'), 'Historial vacío usa un estado real sin mensajes de muestra');
    t.$('filtro-conversaciones').value = 'Ninguna coincidencia'; t.$('filtro-conversaciones').dispatchEvent(new t.dom.window.Event('input'));
    verificar(t.$('lista-conversaciones').textContent.includes('búsqueda'), 'Distingue búsqueda sin coincidencias');
    t.$('cerrar-mensajeria').focus(); t.document.dispatchEvent(new t.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    verificar(t.$('panel-mensajeria').inert && t.document.activeElement === t.$('abrir-mensajeria'), 'Escape cierra y devuelve el foco al botón');
    verificar(t.dom.window.location.pathname === '/home_empresa_2.html' && !t.dom.window.location.hash && !t.estado.redirecciones.length, 'Abrir, navegar conversaciones y cerrar no cambian URL');
    verificar(contenido === t.document.querySelector('main').outerHTML && pie === t.document.querySelector('footer').outerHTML, 'Conserva banner, tres cards y footer sin sustituirlos');
    verificar(!t.document.querySelectorAll('.mensajeria-integrada .sin-leer, .mensajeria-integrada audio, .mensajeria-integrada input[type="file"]').length, 'No introduce contadores ni funciones inexistentes');
    t.estado.eventos.forEach(fn => fn('SIGNED_OUT', null));
    verificar(!t.document.querySelector('.mensajeria-integrada') && t.$('contenido-empresa').hidden, 'Cierre de sesión destruye panel y listeners');
    t.dom.window.close();
}
{
    const t = await entorno({ movil: true }); await t.abrirPrimera();
    const viewport = t.dom.window.visualViewport; viewport.height = 430; viewport.dispatchEvent(new t.dom.window.Event('resize'));
    verificar(t.$('panel-mensajeria').style.height === '430px', 'Ajusta altura al espacio visual disponible con el teclado móvil');
    viewport.offsetTop = 24; viewport.dispatchEvent(new t.dom.window.Event('scroll'));
    verificar(t.$('panel-mensajeria').style.top === '24px', 'Mantiene redactor dentro del viewport visual al desplazar el teclado');
    verificar(t.$('panel-mensajeria').getAttribute('aria-modal') === 'true' && t.document.querySelector('main').inert, 'Móvil protege el contenido situado detrás del panel');
    verificar(t.$('panel-mensajeria').dataset.vista === 'conversacion' && t.document.activeElement === t.$('volver-conversaciones'), 'Móvil muestra conversación y retorno accesible');
    t.$('contenido-mensaje').value = 'Borrador móvil'; await t.click('#volver-conversaciones');
    verificar(t.$('panel-mensajeria').dataset.vista === 'lista' && t.document.activeElement === t.$('filtro-conversaciones'), 'Regresa a trabajos sin cerrar ni recargar');
    await t.click('#boton-actualizar-conversaciones'); verificar(t.$('panel-mensajeria').dataset.vista === 'lista', 'Refrescar lista no fuerza abrir la conversación en móvil');
    await t.click('[data-asignacion="100"]'); verificar(t.$('contenido-mensaje').value === 'Borrador móvil', 'Retorno móvil conserva el borrador');
    t.$('boton-enviar-mensaje').focus(); const tab = new t.dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }); t.document.dispatchEvent(tab);
    verificar(tab.defaultPrevented && t.document.activeElement === t.$('cerrar-mensajeria'), 'Tab queda dentro del panel modal móvil');
    await t.click('#cerrar-mensajeria'); verificar(!t.document.querySelector('main').inert, 'Cerrar restaura interacción con Home Empresa 2');
    t.dom.window.close();
}
{
    const t = await entorno(); await t.click('#abrir-mensajeria'); await t.click('[data-trabajo="10"]');
    const pausa = diferida(); t.estado.pausaHistorial = { id: 100, ...pausa };
    await t.click('[data-asignacion="100"]'); await t.click('[data-asignacion="101"]'); pausa.resolver(); await esperar();
    verificar(t.$('id-conversacion').textContent === '101' && t.$('historial-mensajes').textContent.includes('otra asignación') && !t.$('historial-mensajes').textContent.includes('Respuesta del trabajador'), 'Respuesta tardía no sobreescribe otra conversación');
    verificar(t.$('panel-mensajeria').querySelector('.movanza-loader').hidden, 'Carga concurrente termina sin loader colgado');
    t.estado.asignaciones = t.estado.asignaciones.filter(a => a.id !== 101); await t.click('#boton-actualizar-conversaciones');
    verificar(t.$('seccion-conversacion').classList.contains('oculto') && t.$('historial-mensajes').textContent === '' && t.$('boton-enviar-mensaje').disabled, 'Asignación que deja de estar disponible retira su historial y redactor');
    t.dom.window.close();
}
{
    const t = await entorno(); t.estado.errorTabla = 'asignaciones'; await t.click('#abrir-mensajeria');
    verificar(t.$('mensaje').textContent.includes('No se pudieron cargar') && !t.$('boton-actualizar-conversaciones').disabled, 'Error inicial permite reintentar');
    t.estado.errorTabla = null; t.estado.asignaciones = []; await t.click('#boton-actualizar-conversaciones');
    verificar(t.$('lista-conversaciones').textContent.includes('No hay asignaciones disponibles'), 'Empresa sin asignaciones no muestra conversaciones ficticias');
    t.dom.window.close();
}
{
    const t = await entorno(); const pausa = diferida(); t.estado.pausaConversaciones = pausa.promesa;
    await t.click('#abrir-mensajeria'); t.estado.eventos.forEach(fn => fn('SIGNED_OUT', null)); pausa.resolver(); await esperar();
    verificar(!t.document.querySelector('.mensajeria-integrada') && !t.estado.consultas.some(c => c.tabla === 'trabajos'), 'Logout durante carga impide lecturas posteriores y renderizados tardíos');
    t.dom.window.close();
}
{
    const t = await entorno(); await t.abrirPrimera(); t.dom.window.sessionStorage.setItem('movanza_empresa_activa', '3');
    const consultas = t.estado.consultas.length; await t.enviar('No debe salir');
    verificar(t.estado.rpc.length === 0 && t.estado.consultas.length === consultas, 'Cambiar contexto impide enviar desde la empresa anterior');
    t.dom.window.dispatchEvent(new t.dom.window.Event('focus'));
    verificar(!t.document.querySelector('.mensajeria-integrada'), 'Al recuperar foco retira el panel de un contexto cambiado');
    t.dom.window.close();
}
{
    const t = await entorno({ rol: 'trabajador' }); verificar(!t.document.querySelector('.mensajeria-integrada') && t.estado.consultas.length === 1, 'No monta el panel empresarial para un rol no permitido'); t.dom.window.close();
}
{
    const t = await entorno({ legado: true });
    verificar(t.$('lista-conversaciones').querySelectorAll('.elemento-empresa').length === 4, 'La página existente conserva sus conversaciones visibles según RLS');
    await t.click('#lista-conversaciones button'); await t.enviar('Desde la interfaz existente');
    verificar(t.estado.rpc[0]?.nombre === 'enviar_mensaje' && t.$('historial-mensajes').textContent.includes('Desde la interfaz existente'), 'La interfaz anterior reutiliza el mismo envío sin regresión');
    t.dom.window.close();
}
// El trabajador utiliza la misma interfaz y operaciones con su propio ámbito.
{
    const t = await entorno({ trabajador: true });
    verificar(t.estado.consultas.length === 1 && t.$('panel-mensajeria').inert, 'Home Trabajador monta el botón sin consultar conversaciones hasta abrir');
    const main = t.document.querySelector('main').outerHTML, footer = t.document.querySelector('footer').outerHTML;
    t.estado.asignaciones.find(a => a.id === 100).trabajador_id = 7;
    t.estado.asignaciones.find(a => a.id === 102).trabajador_id = 7;
    t.estado.asignaciones.push({ id: 200, trabajo_id: 90, trabajador_id: 7, titulo: 'Mi asignación en otra empresa', estado: 'aceptada' });
    t.estado.ignorarFiltroTrabajador = true; // Defensa adicional si una respuesta contiene filas fuera del ámbito.
    await t.click('#abrir-mensajeria');
    verificar(t.estado.consultas.length === 4 && t.estado.consultas.find(c => c.tabla === 'asignaciones').filtros.some(([tipo, campo, valor]) => tipo === 'eq' && campo === 'trabajador_id' && valor === 7), 'Consulta las asignaciones del perfil verificado con RLS');
    verificar(t.$('lista-conversaciones').querySelectorAll('.grupo-trabajo').length === 3 && !t.$('lista-conversaciones').textContent.includes('Segunda asignación'), 'Solo agrupa sus asignaciones y permite trabajos autorizados de distintas empresas');
    verificar(t.estado.consultas.find(c => c.tabla === 'trabajos').filtros[0][2].length === 3, 'Solo solicita metadatos de los trabajos propios');
    verificar(!t.document.querySelector('[data-asignacion="101"], [data-asignacion="999"]'), 'No crea controles de conversaciones ajenas');
    await t.click('[data-trabajo="10"]');
    verificar(t.$('trabajo-conversacion').textContent === 'Trabajo <b>real</b>' && !t.$('trabajo-conversacion').querySelector('b'), 'Abre trabajo real como texto seguro');
    verificar(t.$('historial-mensajes').textContent.includes('Respuesta del trabajador') && t.estado.consultas.at(-1).filtros[0][2] === 100, 'Historial conserva el filtro por asignación autorizada');
    await t.enviar('  Mensaje del trabajador  ');
    verificar(t.estado.rpc[0].nombre === 'enviar_mensaje' && t.estado.rpc[0].datos.asignacion_id === 100 && t.estado.rpc[0].datos.contenido === 'Mensaje del trabajador', 'Trabajador reutiliza exactamente la RPC y parámetros de envío');
    const n = t.estado.consultas.length;
    await t.click('#cerrar-mensajeria'); await t.click('#abrir-mensajeria');
    verificar(t.estado.consultas.length === n && t.document.querySelectorAll('.mensajeria-integrada').length === 1, 'Cerrar y reabrir no duplica componentes ni lecturas');
    t.$('contenido-mensaje').value = 'Borrador propio';
    const pausa = diferida(); t.estado.pausaHistorial = { id: 102, ...pausa };
    await t.click('[data-trabajo="11"]');
    verificar(!t.$('historial-mensajes').textContent.includes('Respuesta del trabajador') && t.$('boton-enviar-mensaje').disabled, 'Nueva conversación no expone historial previo durante la carga');
    await t.click('[data-trabajo="90"]'); pausa.resolver(); await esperar();
    verificar(t.$('id-conversacion').textContent === '200' && t.$('historial-mensajes').textContent.includes('Todavía no hay mensajes'), 'Respuesta tardía no mezcla trabajos y presenta historial vacío real');
    t.estado.sinEnvio = 200; const mensajesAntes = t.estado.mensajes.length;
    await t.enviar('Texto sin permiso');
    verificar(t.estado.mensajes.length === mensajesAntes && t.$('mensaje').textContent.includes('No se pudo enviar') && t.$('contenido-mensaje').value === 'Texto sin permiso', 'RPC deniega escritura sin perder el borrador ni simular éxito');
    t.estado.sinLectura = 102; await t.click('[data-trabajo="11"]');
    verificar(t.$('mensaje').textContent.includes('Lectura no autorizada') && !t.$('historial-mensajes').querySelector('.burbuja-mensaje'), 'Participación no sustituye el permiso de lectura del historial');
    t.estado.sinLectura = null; await t.click('#boton-actualizar-mensajes');
    verificar(t.$('historial-mensajes').textContent.includes('Todavía no hay mensajes'), 'Permite reintentar una lectura fallida');
    t.estado.empresas = [];
    await t.click('#boton-actualizar-conversaciones');
    verificar(t.document.querySelector('[data-trabajo="11"]') && t.$('empresa-conversacion').textContent === 'No disponible', 'Conserva historiales autorizados aunque los metadatos de empresa no sean visibles');
    t.estado.trabajos = t.estado.trabajos.filter(trabajo => trabajo.id !== 11);
    await t.click('#boton-actualizar-conversaciones');
    verificar(!t.document.querySelector('[data-trabajo="11"]') && t.$('seccion-conversacion').classList.contains('oculto'), 'Retira relaciones que ya no son legibles sin conservar un chat obsoleto');
    verificar(t.dom.window.location.pathname === '/home_trabajador.html' && !t.dom.window.location.hash && !t.estado.redirecciones.length, 'Chat trabajador no cambia URL ni navega');
    verificar(main === t.document.querySelector('main').outerHTML && footer === t.document.querySelector('footer').outerHTML, 'Conserva banner, cards y footer del trabajador');
    t.estado.eventos.forEach(fn => fn('SIGNED_IN', { user: { id: 'otra-cuenta' } }));
    verificar(!t.document.querySelector('.mensajeria-integrada') && t.$('contenido-trabajador').hidden, 'Cambio de cuenta destruye el panel trabajador');
    t.dom.window.close();
}
{
    const t = await entorno({ trabajador: true, movil: true });
    t.estado.asignaciones[0].trabajador_id = 7;
    await t.click('#abrir-mensajeria'); await t.click('[data-trabajo="10"]');
    verificar(t.$('panel-mensajeria').getAttribute('aria-modal') === 'true' && t.document.querySelector('main').inert && t.document.activeElement === t.$('volver-conversaciones'), 'Trabajador móvil reutiliza panel modal, foco y fondo inerte');
    await t.click('#volver-conversaciones');
    verificar(t.$('panel-mensajeria').dataset.vista === 'lista' && t.document.activeElement === t.$('filtro-conversaciones'), 'Trabajador móvil regresa a la lista sin navegación');
    await t.click('#cerrar-mensajeria');
    verificar(!t.document.querySelector('main').inert && t.document.activeElement === t.$('abrir-mensajeria'), 'Cerrar devuelve interacción y foco a Home Trabajador');
    t.dom.window.close();
}
{
    const t = await entorno({ trabajador: true }); t.estado.errorTabla = 'asignaciones';
    await t.click('#abrir-mensajeria');
    verificar(t.$('mensaje').textContent.includes('No se pudieron cargar') && !t.$('boton-actualizar-conversaciones').disabled, 'Error inicial del trabajador permite reintentar');
    t.estado.errorTabla = null; await t.click('#boton-actualizar-conversaciones');
    verificar(t.$('lista-conversaciones').textContent.includes('No tienes trabajos'), 'Trabajador sin conversaciones no recibe datos ficticios');
    t.dom.window.close();
}
{
    const t = await entorno({ trabajador: true }); const pausa = diferida(); t.estado.pausaConversaciones = pausa.promesa;
    await t.click('#abrir-mensajeria'); t.estado.eventos.forEach(fn => fn('SIGNED_OUT', null)); pausa.resolver(); await esperar();
    verificar(!t.document.querySelector('.mensajeria-integrada') && !t.estado.consultas.some(c => c.tabla === 'trabajos'), 'Salida durante la lectura del trabajador elimina listeners e invalida respuestas');
    t.dom.window.close();
}
const css = await leer('estilos/mensajeria.css');
verificar(css.includes('background-size: 300%') && css.includes('background-position: right') && css.includes('.tooltip'), 'Conserva degradado desplazable y tooltip del botón original');
verificar(css.includes('.card-header') && css.includes('.img-avatar') && css.includes('.message-input') && css.includes('.message-send') && css.includes('.button-send'), 'Adapta la estructura del recurso de chat original');
verificar(css.includes('prefers-reduced-motion') && css.includes('100dvh') && css.includes('overscroll-behavior: contain'), 'Incluye adaptación móvil, desplazamiento interno y movimiento reducido');
console.log(`Mensajería: ${comprobaciones} comprobaciones correctas.`);
