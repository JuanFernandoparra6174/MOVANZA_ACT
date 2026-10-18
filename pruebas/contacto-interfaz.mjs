import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const { JSDOM } = await import(pathToFileURL(join(resolve(process.argv[2]), 'node_modules/jsdom/lib/api.js')));
const leer = archivo => readFile(new URL('../' + archivo, import.meta.url), 'utf8');
const dom = new JSDOM(await leer('index.html'), { url: 'https://movanza.site/#contacto', pretendToBeVisual: true });
const w = dom.window, d = w.document;
w.matchMedia = () => ({ matches: true });
w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
w.HTMLDialogElement.prototype.close = function () { this.open = false; };
for (const nombre of ['alert', 'confirm', 'prompt']) w[nombre] = () => { throw new Error('Diálogo nativo prohibido'); };
const c = vm.createContext({ window: w, document: d, console });
new vm.Script(await leer('scripts/componentes-publicos.js')).runInContext(c);
const cache = new Map();
async function cargar(nombre) {
    if (cache.has(nombre)) return cache.get(nombre);
    const m = new vm.SourceTextModule(await leer('scripts/' + nombre), { context: c, initializeImportMeta(meta) { meta.url = 'https://movanza.site/scripts/' + nombre; } });
    cache.set(nombre, m); await m.link(ruta => cargar(ruta.replace('./', ''))); return m;
}
const modulo = await cargar('contacto.js'); await modulo.evaluate();
modulo.namespace.iniciarContacto(); // No debe duplicar listeners ni loaders.
const formulario = d.getElementById('formulario-contacto'), modal = d.getElementById('contacto'); modal.showModal();
const boton = formulario.querySelector('[type="submit"]'), estado = d.getElementById('contacto-estado');
const campo = nombre => formulario.elements.namedItem(nombre);
const rellenar = () => { campo('nombre').value = 'Ana'; campo('correo').value = 'ana@example.com'; campo('mensaje').value = 'Consulta de prueba'; };
const enviar = () => formulario.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
const esperar = () => new Promise(r => setTimeout(r, 20));
const cerrarAviso = async () => { d.querySelector('#movanza-alerta .alerta-confirmar')?.click(); await esperar(); };
let comprobaciones = 0;
const verificar = (condicion, mensaje) => { assert.ok(condicion, mensaje); comprobaciones++; };
let llamadas = 0, resolver, ultimaClave;
w.fetch = async (url, opciones) => {
    llamadas++; assert.equal(url, '/api/contacto');
    assert.equal(opciones.method, 'POST'); assert.equal(JSON.parse(opciones.body).correo, 'ana@example.com');
    ultimaClave = opciones.headers['Idempotency-Key'];
    return new Promise(r => { resolver = r; });
};
rellenar(); enviar(); enviar();
verificar(llamadas === 1 && boton.disabled && formulario.getAttribute('aria-busy') === 'true', 'Impide envíos simultáneos y muestra procesamiento real');
verificar(estado.textContent.includes('enviando') && !d.getElementById('movanza-alerta'), 'No muestra éxito antes de recibir confirmación');
verificar(campo('mensaje').disabled && !formulario.querySelector('.movanza-loader').hidden, 'Conserva los datos mientras envía y utiliza el loader compartido');
resolver(Response.json({ ok: true }, { status: 202 })); await esperar();
verificar(!campo('mensaje').value && !boton.disabled && !formulario.hasAttribute('aria-busy'), 'Solo el envío confirmado limpia y desbloquea el formulario');
verificar(d.querySelector('#movanza-alerta').dataset.tipo === 'exito' && modal.open, 'Usa la card real de éxito sobre Contacto sin cerrar el modal');
verificar(w.location.href === 'https://movanza.site/#contacto', 'No navega ni cambia la URL'); await cerrarAviso();

for (const [nombre, valor] of [['nombre', ' '], ['correo', 'incorrecto'], ['mensaje', 'x'.repeat(4001)]]) {
    rellenar(); campo(nombre).value = valor; const antes = llamadas; enviar();
    verificar(llamadas === antes && !campo(nombre).checkValidity(), 'Validación cliente: ' + nombre);
    campo(nombre).dispatchEvent(new w.Event('input', { bubbles: true }));
}
rellenar(); enviar(); const clavePrimerIntento = ultimaClave;
resolver(Response.json({ ok: false, mensaje: 'detalle-interno-prohibido' }, { status: 502 })); await esperar();
verificar(campo('mensaje').value === 'Consulta de prueba' && !boton.disabled, 'El fallo conserva los datos y permite reintentar');
verificar(!estado.textContent.includes('detalle-interno') && d.querySelector('#movanza-alerta').dataset.tipo === 'error', 'Error comprensible mediante card compartida'); await cerrarAviso();
enviar(); verificar(ultimaClave === clavePrimerIntento, 'El reintento del mismo mensaje conserva la clave de idempotencia');
resolver(Response.json({ ok: true }, { status: 202 })); await esperar(); await cerrarAviso();

for (const respuesta of [Response.json({ ok: false }, { status: 503 }), Response.json({ ok: false }, { status: 429 }), Response.json({}), new Response('<html>Error</html>')]) {
    w.fetch = async () => respuesta; rellenar(); enviar(); await esperar();
    verificar(campo('mensaje').value && !boton.disabled && d.querySelector('#movanza-alerta').dataset.tipo === 'error', 'No limpia ni confirma ante respuestas fallidas o incompletas'); await cerrarAviso();
}
w.fetch = async () => { throw new w.TypeError('Failed to fetch'); }; rellenar(); enviar(); await esperar();
verificar(campo('mensaje').value && estado.textContent.includes('conexión'), 'Maneja fallo de conexión sin perder contenido'); await cerrarAviso();
verificar(formulario.querySelectorAll('.movanza-loader').length === 1, 'Una instancia sin loaders duplicados');
dom.window.close(); console.log(`Contacto: ${comprobaciones} comprobaciones de interfaz correctas.`);
