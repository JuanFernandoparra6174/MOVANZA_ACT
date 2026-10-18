import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const { JSDOM } = await import(pathToFileURL(join(resolve(process.argv[2]), 'node_modules/jsdom/lib/api.js')));
const leer = ruta => readFile(new URL('../' + ruta, import.meta.url), 'utf8');
const esperar = () => new Promise(r => setTimeout(r, 70));
let checks = 0;
function verificar(valor, mensaje) { assert.ok(valor, mensaje); checks++; }

for (const pagina of ['home_empresa_2.html', 'paginas/equipo.html', 'paginas/trabajos.html', 'paginas/estadisticas.html', 'home_empresa_1.html', 'paginas/seleccionar_empresa.html', 'paginas/mis_asignaciones.html']) {
    const dom = new JSDOM(await leer(pagina), { url: 'https://movanza.test/' + pagina, pretendToBeVisual: true });
    const { window } = dom, { document } = window;
    window.matchMedia = () => ({ matches: true });
    window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    window.HTMLDialogElement.prototype.close = function () { this.open = false; };
    let confirmar = false, guardados = 0, error = null, resolver, espera = false, salidas = 0;
    window.confirm = () => confirmar;
    window.alert = texto => { throw new Error(texto); };
    const perfil = { id: 7, nombre_usuario: 'ana_real', nombre_completo: 'Ana Real', rol: 'empresa' };
    const eventos = [];
    const supabase = {
        auth: { getUser: async () => ({ data: { user: { id: 'auth-7', email: 'ana@example.test' } } }), onAuthStateChange: cb => eventos.push(cb) },
        from: tabla => {
            assert.equal(tabla, 'perfiles');
            const q = { select() { return q; }, eq(campo, id) { assert.equal(campo, 'usuario_auth_id'); assert.equal(id, 'auth-7'); return q; }, single: async () => ({ data: { ...perfil }, error: null }) };
            return q;
        },
        rpc: async (nombre, datos) => {
            assert.equal(nombre, 'actualizar_mi_perfil'); guardados++;
            assert.deepEqual(Object.keys(datos).sort(), ['nombre_completo', 'nombre_usuario']);
            if (espera) await new Promise(r => { resolver = r; });
            if (error) return { error };
            Object.assign(perfil, datos); return { error: null };
        }
    };
    const contexto = vm.createContext({ window, document, URL, console });
    const proveedor = new vm.SyntheticModule(['supabase'], function () { this.setExport('supabase', supabase); }, { context: contexto });
    const cache = new Map();
    async function cargar(nombre) {
        if (cache.has(nombre)) return cache.get(nombre);
        const m = new vm.SourceTextModule((nombre === 'alertas.js' ? await readFile(new URL('./alertas-simuladas.js', import.meta.url), 'utf8') : await leer('scripts/' + nombre)), {
            context: contexto,
            initializeImportMeta(meta) { meta.url = 'https://movanza.test/scripts/' + nombre; },
            importModuleDynamically: async ruta => { const mod = await cargar(ruta.replace('./', '')); if (mod.status === 'linked') await mod.evaluate(); return mod; }
        });
        cache.set(nombre, m);
        await m.link(ruta => ruta.includes('supabase.js') ? proveedor : cargar(ruta.replace('./', '')));
        return m;
    }
    const cuenta = await cargar('cuenta-interfaz.js'); await cuenta.evaluate();
    if (!document.querySelector('.menu-cuenta')) document.body.append(cuenta.namespace.crearCuentaElemento({}, () => { salidas++; }));
    else cuenta.namespace.prepararCuenta(document.querySelector('.menu-cuenta'), () => { salidas++; });
    const origen = document.querySelector('.menu-cuenta [data-abrir-perfil]');
    document.querySelector('.menu-cuenta').open = true;
    // Simula un filtro y datos ya cargados: deben conservar el mismo nodo y valor.
    const filtro = document.createElement('input'); filtro.value = 'pendientes'; document.querySelector('main').append(filtro);
    window.sessionStorage.setItem('movanza_empresa_activa', '42');
    const url = window.location.href, principal = document.querySelector('main');
    origen.click(); await esperar();
    const modal = document.getElementById('perfil-modal'), q = selector => modal.querySelector(selector);
    verificar(modal?.open, pagina + ': abre el modal desde el control real');
    verificar(q('[data-completo]').textContent === 'Ana Real' && q('[data-email]').textContent === 'ana@example.test', 'Muestra datos autenticados');
    verificar(!modal.querySelector('a, iframe, [name="rol"], [name="email"]'), 'No contiene módulos ni controles de permisos o credenciales');
    q('[data-editar]').click(); q('[name="nombre_completo"]').value = 'Ana Actualizada';
    q('[data-cancelar]').click(); await esperar(); verificar(!q('form').hidden, 'Rechazar descarte conserva la edición');
    modal.dispatchEvent(new window.Event('cancel', { cancelable: true })); await esperar();
    verificar(modal.open, 'Escape protege cambios pendientes');
    confirmar = true; q('[data-cancelar]').click(); await esperar(); verificar(q('form').hidden && q('[name="nombre_completo"]').value === 'Ana Real', 'Cancelar restaura valores sin cerrar');
    q('[data-editar]').click(); q('[name="nombre_usuario"]').value = '!';
    q('form').dispatchEvent(new window.Event('submit', { cancelable: true })); await esperar();
    verificar(guardados === 0, 'No envía datos inválidos');
    q('[name="nombre_usuario"]').value = 'ana_real'; q('[name="nombre_completo"]').value = 'Ana Actualizada';
    espera = true;
    q('form').dispatchEvent(new window.Event('submit', { cancelable: true })); await esperar();
    q('form').dispatchEvent(new window.Event('submit', { cancelable: true })); await esperar();
    verificar(guardados === 1 && modal.getAttribute('aria-busy') === 'true', 'Bloquea duplicados y muestra carga real');
    verificar(!q('.perfil-estado').textContent.includes('correctamente'), 'No anticipa éxito');
    resolver(); await esperar(); espera = false;
    verificar(q('[data-completo]').textContent === 'Ana Actualizada' && q('form').hidden, 'Guardar actualiza la consulta y sale de edición');
    q('[data-editar]').click(); q('[name="nombre_usuario"]').value = 'ocupado'; error = { code: '23505' };
    q('form').dispatchEvent(new window.Event('submit', { cancelable: true })); await esperar();
    verificar(q('.perfil-estado').textContent.includes('ocupado') && !q('form').hidden, 'Explica error de usuario duplicado y conserva edición');
    q('[data-cancelar]').click(); await esperar(); q('[data-cerrar]').click(); await esperar();
    verificar(!modal.open && document.activeElement === origen, 'Cierra y devuelve el foco al control de origen');
    verificar(window.location.href === url && document.querySelector('main') === principal && filtro.value === 'pendientes' && window.sessionStorage.getItem('movanza_empresa_activa') === '42', 'Conserva URL, empresa, nodos y filtros');
    origen.click(); await esperar(); verificar(document.querySelectorAll('#perfil-modal').length === 1, 'Reutiliza la misma instancia');
    q('[data-salir]').click(); await esperar(); verificar(salidas === 1, 'Delega cierre de sesión en la operación existente');
    origen.click(); await esperar(); eventos.forEach(cb => cb('SIGNED_OUT', null)); await esperar();
    verificar(!modal.open && !q('[name="nombre_completo"]').value, 'Limpia datos al finalizar sesión');
    dom.window.close();
}
console.log(`${checks} comprobaciones de Perfil correctas.`);
