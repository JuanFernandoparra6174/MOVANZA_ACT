import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
const { JSDOM } = await import(pathToFileURL(join(resolve(process.argv[2]), 'node_modules/jsdom/lib/api.js')));
const leer = ruta => readFile(new URL('../' + ruta, import.meta.url), 'utf8');
const esperar = () => new Promise(r => setTimeout(r, 45));
let checks = 0;
function verificar(v, texto) { assert.ok(v, texto); checks++; }
async function entorno(html = '<main><button id="origen">Abrir</button><input id="filtro" value="pendientes"><p id="mensaje" role="status"></p></main><dialog id="padre"><button id="origen-modal">Editar</button><input value="Sin guardar"></dialog>') {
    const dom = new JSDOM(html, { url: 'https://movanza.test/paginas/prueba.html', pretendToBeVisual: true });
    const w = dom.window, d = w.document;
    w.matchMedia = () => ({ matches: true });
    w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    w.HTMLDialogElement.prototype.close = function () { this.open = false; };
    for (const nombre of ['alert', 'confirm', 'prompt']) w[nombre] = () => { throw new Error('Diálogo nativo prohibido: ' + nombre); };
    const contexto = vm.createContext({ window: w, document: d, console });
    const m = new vm.SourceTextModule(await leer('scripts/alertas.js'), { context: contexto, initializeImportMeta(meta) { meta.url = 'https://movanza.test/scripts/alertas.js'; } });
    await m.link(() => {}); await m.evaluate();
    const $ = s => d.querySelector(s);
    const confirmar = () => $('#movanza-alerta form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    return { dom, w, d, api: m.namespace, $, confirmar };
}
{
    const t = await entorno(); t.$('#origen').focus(); const main = t.$('main');
    t.w.sessionStorage.setItem('movanza_empresa_activa', '42'); const ruta = t.w.location.href;
    let operaciones = 0;
    const decision = t.api.confirmarAccion({ titulo: 'Cancelar trabajo', mensaje: 'Se conserva el historial.', textoConfirmar: 'Cancelar trabajo', destructiva: true });
    decision.then(ok => { if (ok) operaciones++; });
    verificar(t.$('#movanza-alerta').open && operaciones === 0, 'Confirmación no ejecuta la acción antes de decidir');
    verificar(t.d.activeElement === t.$('.alerta-cancelar') && t.$('#movanza-alerta').getAttribute('role') === 'alertdialog', 'Foco seguro y rol accesible para acciones destructivas');
    verificar(main.inert && t.$('.alerta-blob') && t.$('.alerta-bg'), 'Fondo inerte y estructura original del recurso');
    t.$('.alerta-cancelar').click(); verificar(await decision === false && operaciones === 0, 'Cancelar conserva la operación sin ejecutar');
    verificar(!main.inert && t.d.activeElement === t.$('#origen'), 'Restaura inercia y foco original');
    const p1 = t.api.confirmarAccion('¿Continuar?'); const p2 = t.api.confirmarAccion('¿Continuar?');
    verificar(await p2 === false, 'Una confirmación duplicada nunca reanuda un segundo llamador');
    t.confirmar(); verificar(await p1 === true, 'Confirmar resuelve afirmativamente solo el primer flujo');
    const p3 = t.api.confirmarAccion('Otra decisión'); t.$('#movanza-alerta').dispatchEvent(new t.w.Event('cancel', { cancelable: true }));
    verificar(await p3 === false, 'Escape equivale a cancelar');
    const teclado = t.api.confirmarAccion('Teclado'); t.$('.alerta-confirmar').focus();
    const tab = new t.w.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }); t.$('.alerta-confirmar').dispatchEvent(tab);
    verificar(tab.defaultPrevented && t.d.activeElement === t.$('.alerta-cerrar'), 'Tab queda dentro de la card activa'); t.$('.alerta-cancelar').click(); await teclado;
    const p4 = t.api.confirmarAccion('Cerrar'); t.$('.alerta-cerrar').click(); verificar(await p4 === false, 'Cerrar equivale a cancelar');
    verificar(t.w.location.href === ruta && t.w.sessionStorage.getItem('movanza_empresa_activa') === '42' && t.$('main') === main && t.$('#filtro').value === 'pendientes', 'Conserva ruta, empresa, nodos y filtros');
    verificar(t.d.querySelectorAll('#movanza-alerta').length === 1 && t.d.querySelectorAll('link[href$="alertas.css"]').length === 1, 'Solo una instancia y una hoja compartida');
    const uno = t.api.mostrarAlerta({ mensaje: 'Primero' }); const dos = t.api.mostrarAlerta({ tipo: 'exito', mensaje: 'Segundo' });
    verificar(t.$('#movanza-alerta-mensaje').textContent === 'Primero' && t.d.querySelectorAll('#movanza-alerta[open]').length === 1, 'Cola sin alertas superpuestas');
    t.confirmar(); await uno; verificar(t.$('#movanza-alerta-mensaje').textContent === 'Segundo' && t.$('#movanza-alerta').dataset.tipo === 'exito', 'Avanza al siguiente aviso'); t.confirmar(); await dos;
    const input = t.api.solicitarTexto({ titulo: 'Alias', etiqueta: 'Nombre visible', requerido: true, minLength: 3, maxLength: 20, validar: texto => texto === 'reservado' ? 'Elige otro nombre.' : '' });
    verificar(t.d.activeElement === t.$('#movanza-alerta-entrada'), 'Entrada de texto con foco en el campo');
    t.confirmar(); await esperar(); verificar(t.$('#movanza-alerta-validacion').textContent && t.$('#movanza-alerta').open, 'Validación impide continuar con campo vacío');
    t.$('#movanza-alerta-entrada').value = 'reservado'; t.confirmar(); await esperar(); verificar(t.$('#movanza-alerta-validacion').textContent === 'Elige otro nombre.', 'Respeta validación específica');
    t.$('#movanza-alerta-entrada').value = 'Nombre real'; t.confirmar(); verificar(await input === 'Nombre real', 'Devuelve el texto validado');
    const cancelado = t.api.solicitarTexto({ etiqueta: 'Alias' }); t.$('.alerta-cancelar').click(); verificar(await cancelado === null, 'Entrada cancelada devuelve null');
    let resolverValidacion; const validacion = new Promise(r => resolverValidacion = r);
    const asincrona = t.api.solicitarTexto({ valorInicial: 'Nombre real', validar: () => validacion }); t.confirmar();
    verificar(t.$('#movanza-alerta').getAttribute('aria-busy') === 'true' && t.$('.alerta-confirmar').disabled, 'Validación asíncrona muestra procesamiento e impide duplicados');
    resolverValidacion(''); verificar(await asincrona === 'Nombre real', 'Finaliza validación asíncrona sin adelantar el resultado');
    await assert.rejects(t.api.solicitarTexto({ tipoCampo: 'password' })); checks++;
    const seguro = t.api.mostrarAlerta({ titulo: '<script>no</script>', mensaje: '<img src=x onerror=alert(1)>' });
    verificar(!t.$('#movanza-alerta').querySelector('script, img'), 'Mensajes tratados como texto, sin ejecutar HTML'); t.confirmar(); await seguro;
    t.dom.window.close();
}
{
    const t = await entorno(); const padre = t.$('#padre'); padre.showModal(); t.$('#origen-modal').focus(); padre.querySelector('input').value = 'Datos sin guardar';
    const p = t.api.confirmarAccion({ mensaje: '¿Descartar?', destructiva: true });
    verificar(padre.open && padre.inert && t.$('#movanza-alerta').open, 'Confirmación sobre un formulario conserva el diálogo anterior');
    t.$('.alerta-cancelar').click(); await p;
    verificar(padre.open && !padre.inert && padre.querySelector('input').value === 'Datos sin guardar' && t.d.activeElement === t.$('#origen-modal'), 'Cancelar restaura formulario y foco sin perder cambios');
    const viejo = t.api.confirmarAccion('Sesión pendiente'); padre.close(); await esperar();
    verificar(await viejo === false && !t.$('#movanza-alerta').open, 'Cerrar el formulario de origen cancela una decisión pendiente');
    t.dom.window.close();
}
{
    const t = await entorno(); const fuente = t.$('#mensaje');
    fuente.className = 'error'; fuente.setAttribute('role', 'alert'); fuente.textContent = 'Precisión GPS insuficiente: máximo 50 metros.';
    await esperar(); verificar(t.$('#movanza-alerta').dataset.tipo === 'advertencia' && t.$('#movanza-alerta-mensaje').textContent === fuente.textContent, 'Aviso GPS conserva el resultado real de la validación');
    t.confirmar(); await esperar();
    fuente.textContent = 'Precisión GPS insuficiente: máximo 50 metros.'; await esperar(); verificar(!t.$('#movanza-alerta').open, 'No repite un mismo resultado por mutaciones equivalentes');
    fuente.className = ''; fuente.setAttribute('role', 'status'); fuente.textContent = 'Procesando…'; await esperar(); verificar(!t.$('#movanza-alerta').open, 'No convierte cargas o estados informativos en interrupciones');
    fuente.className = 'exito'; fuente.textContent = 'Cambios guardados correctamente.'; await esperar(); verificar(t.$('#movanza-alerta').dataset.tipo === 'exito', 'Éxito solo cuando la aplicación publica un resultado confirmado'); t.confirmar(); await esperar();
    t.$('main').hidden = true; fuente.className = 'error'; fuente.textContent = 'Error de carga real'; await esperar(); verificar(!t.$('#movanza-alerta').open, 'No muestra resultados de módulos ocultos');
    t.$('main').hidden = false; await esperar(); verificar(t.$('#movanza-alerta').open, 'Muestra el error inicial cuando la interfaz termina de abrirse'); t.confirmar(); await esperar();
    t.dom.window.close();
}
{
    const t = await entorno('<button id="origen">Origen superior</button><iframe src="https://movanza.test/login.html"></iframe>');
    const marco = t.$('iframe'), doc = marco.contentDocument;
    doc.open(); doc.write('<input id="correo" value="real@example.test">'); doc.close(); doc.getElementById('correo').focus();
    const contexto = vm.createContext({ window: marco.contentWindow, document: doc });
    const m = new vm.SourceTextModule(await leer('scripts/alertas.js'), { context: contexto, initializeImportMeta(meta) { meta.url = 'https://movanza.test/scripts/alertas.js'; } }); await m.link(() => {}); await m.evaluate();
    const desdeLogin = m.namespace.confirmarAccion({ mensaje: 'Aviso sobre el acceso' });
    verificar(t.$('#movanza-alerta').open && !doc.getElementById('movanza-alerta') && t.d.querySelectorAll('iframe').length === 1, 'Acceso embebido usa una card en la ventana superior sin crear iframes');
    t.$('.alerta-cancelar').click(); await desdeLogin;
    verificar(doc.activeElement === doc.getElementById('correo') && doc.getElementById('correo').value === 'real@example.test', 'Restaura foco y valores del formulario de acceso');
    t.$('#origen').focus(); const superior = t.api.confirmarAccion('Decisión superior'); t.$('.alerta-cancelar').click(); await superior;
    verificar(t.d.activeElement === t.$('#origen') && t.d.querySelectorAll('#movanza-alerta').length === 1, 'Ventanas de igual origen comparten instancia y conservan el origen de cada petición');
    t.dom.window.close();
}
// Integración real del llamador de rechazo, sin sustituir el servicio de alertas.
{
    const dom = new JSDOM(await leer('paginas/trabajos.html'), { url: 'https://movanza.test/paginas/trabajos.html', pretendToBeVisual: true });
    const w = dom.window, d = w.document;
    w.matchMedia = () => ({ matches: false, addEventListener() {} });
    d.getElementById('sitio-trabajos').hidden = false; d.querySelector('main').hidden = false;
    const c = vm.createContext({ window: w, document: d }); const cache = new Map();
    async function cargar(n) { if (cache.has(n)) return cache.get(n); const m = new vm.SourceTextModule(await leer('scripts/' + n), { context: c, initializeImportMeta(meta) { meta.url = 'https://movanza.test/scripts/' + n; } }); cache.set(n, m); await m.link(r => cargar(r.replace('./', ''))); return m; }
    const m = await cargar('trabajos-panel.js'); await m.evaluate(); const vista = m.namespace.vistaTrabajos;
    vista.iniciar(); vista.activar(); await vista.nuevoPunto(); d.getElementById('nombre-trabajo').value = 'Cambios sin guardar';
    const enlace = d.querySelector('a[href="../home_empresa_2.html"]'); enlace.focus();
    const click = new w.MouseEvent('click', { bubbles: true, cancelable: true }); enlace.dispatchEvent(click);
    verificar(click.defaultPrevented && d.getElementById('movanza-alerta').open, 'Enlace con cambios se bloquea sincrónicamente antes de esperar la confirmación');
    d.querySelector('.alerta-cancelar').click(); await esperar();
    verificar(w.location.pathname === '/paginas/trabajos.html' && d.getElementById('nombre-trabajo').value === 'Cambios sin guardar', 'Cancelar navegación conserva página y formulario'); dom.window.close();
}
{
    const dom = new JSDOM(await leer('paginas/mis_invitaciones.html'), { url: 'https://movanza.test/paginas/mis_invitaciones.html', pretendToBeVisual: true });
    const w = dom.window, d = w.document;
    w.matchMedia = () => ({ matches: true }); w.HTMLDialogElement.prototype.showModal = function () { this.open = true; }; w.HTMLDialogElement.prototype.close = function () { this.open = false; };
    d.querySelector('main').hidden = false; d.getElementById('sitio-invitaciones').hidden = false;
    for (const n of ['alert', 'confirm', 'prompt']) w[n] = () => { throw new Error('No usar diálogos nativos'); };
    let respuestas = 0; const invitacion = { id: 1, trabajador_id: 7, nombre_empresa: 'Empresa real', estado: 'pendiente' };
    const sb = { rpc: async nombre => { if (nombre === 'listar_invitaciones_visibles') return { data: [{ ...invitacion }] }; assert.equal(nombre, 'responder_invitacion'); respuestas++; invitacion.estado = 'rechazada'; return {}; }, from: () => { const q = { select() { return q; }, eq() { return q; }, then(ok) { return Promise.resolve({ data: [] }).then(ok); } }; return q; } };
    const c = vm.createContext({ window: w, document: d, console });
    const proveedor = new vm.SyntheticModule(['supabase'], function () { this.setExport('supabase', sb); }, { context: c }); const cache = new Map();
    async function cargar(n) { if (cache.has(n)) return cache.get(n); const m = new vm.SourceTextModule(await leer('scripts/' + n), { context: c, initializeImportMeta(meta) { meta.url = 'https://movanza.test/scripts/' + n; } }); cache.set(n, m); await m.link(r => r.includes('supabase') ? proveedor : cargar(r.replace('./', ''))); return m; }
    const m = await cargar('mis_invitaciones.js'); await m.evaluate(); await m.namespace.iniciarInvitaciones({ id: 7 });
    const rechazo = () => d.querySelector('[data-responder="false"]'); rechazo().focus(); rechazo().click(); await esperar();
    verificar(respuestas === 0 && d.getElementById('movanza-alerta').open, 'Rechazo real espera la decisión antes de llamar Supabase');
    d.querySelector('.alerta-cancelar').click(); await esperar(); verificar(respuestas === 0 && d.querySelector('[data-invitacion]').dataset.estado === 'pendiente', 'Cancelar rechazo real conserva la invitación');
    rechazo().click(); await esperar(); d.querySelector('#movanza-alerta form').dispatchEvent(new w.Event('submit', { cancelable: true })); await esperar();
    verificar(respuestas === 1 && invitacion.estado === 'rechazada', 'Confirmar rechazo real ejecuta exactamente una operación');
    verificar(d.getElementById('movanza-alerta').dataset.tipo === 'exito', 'Resultado del servidor se presenta con card de éxito'); dom.window.close();
}
const css = await leer('estilos/alertas.css');
verificar(css.includes('alerta-blob-bounce 5s') && css.includes('blur(24px)') && css.includes('50% { left: 100%; top: 100%; }'), 'Conserva personalidad y superficie del recurso con recorrido hasta los bordes');
verificar(css.includes('prefers-reduced-motion') && css.includes('100dvh') && css.includes(':focus-visible'), 'Movimiento reducido, adaptación móvil y foco visible');
async function auditar(directorio = new URL('../', import.meta.url)) {
    for (const e of await readdir(directorio, { withFileTypes: true })) {
        if (['.git', 'node_modules', 'pruebas', 'recursos', 'plantilla_base', '.codex', '.agents', 'Carpeta_Imagenes'].includes(e.name)) continue;
        const ruta = new URL(e.name + (e.isDirectory() ? '/' : ''), directorio);
        if (e.isDirectory()) { await auditar(ruta); continue; }
        if (!/\.(m?js|html)$/.test(e.name)) continue;
        const texto = await readFile(ruta, 'utf8');
        assert.ok(!/(?:\b(?:window|globalThis|self)\s*(?:\.\s*|\[\s*['"])(?:alert|confirm|prompt)['"]?\s*\]?\s*\(|(?<![\w.])(?:alert|confirm|prompt)\s*\()/.test(texto), 'Sin llamadas nativas en ' + ruta.pathname);
        if (e.name.endsWith('.html') && texto.includes('estilos/general.css')) assert.ok(texto.includes('scripts/alertas.js') && texto.includes('estilos/alertas.css'), 'Sistema disponible en ' + ruta.pathname);
    }
}
await auditar(); verificar(true, 'Auditoría global de llamadas nativas y cobertura de páginas');
console.log(`Alertas reales: ${checks} comprobaciones correctas.`);
