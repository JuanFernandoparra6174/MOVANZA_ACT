import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

if (!process.argv[2]) throw new Error('Indica el directorio temporal con jsdom.');
const { JSDOM } = await import(pathToFileURL(join(resolve(process.argv[2]), 'node_modules/jsdom/lib/api.js')));
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const script = await readFile(new URL('../scripts/index-publico.js', import.meta.url), 'utf8');
const componentes = await readFile(new URL('../scripts/componentes-publicos.js', import.meta.url), 'utf8');
const modal = await readFile(new URL('../scripts/auth-modal.js', import.meta.url), 'utf8');
let comprobaciones = 0;
const verificar = (condicion, mensaje) => { assert.ok(condicion, mensaje); comprobaciones++; };
const esperar = () => new Promise(r => setTimeout(r, 25));

async function entorno({ fallo = false, hash = '', demorarAuth = false } = {}) {
    const dom = new JSDOM(html, { url: 'https://movanza.example/index.html' + hash, pretendToBeVisual: true });
    const w = dom.window;
    const redirecciones = [];
    const ubicacion = {
        get hash() { return w.location.hash; }, set hash(valor) { w.location.hash = valor; },
        get href() { return w.location.href; }, get origin() { return w.location.origin; },
        get pathname() { return w.location.pathname; }, get search() { return w.location.search; },
        assign: url => redirecciones.push(url)
    };
    w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
    w.HTMLDialogElement.prototype.close = function () {
        this.removeAttribute('open');
        this.dispatchEvent(new w.Event('close'));
    };
    const contexto = vm.createContext({
        document: w.document, window: w, location: ubicacion, history: w.history,
        MutationObserver: w.MutationObserver, console, URL
    });
    const auth = new vm.SyntheticModule([], () => {
        w.document.getElementById('mensaje').textContent = '';
    }, { context: contexto });
    new vm.Script(componentes).runInContext(contexto);
    new vm.Script(modal).runInContext(contexto);
    let liberarAuth;
    const cargaAuth = demorarAuth ? new Promise(resolver => { liberarAuth = resolver; }) : Promise.resolve();
    new vm.Script(script, {
        importModuleDynamically: async nombre => {
            assert.equal(nombre, './autenticacion.js');
            await cargaAuth;
            if (fallo) throw new Error('CDN no disponible');
            await auth.link(() => {});
            await auth.evaluate();
            return auth;
        }
    }).runInContext(contexto);
    await esperar();
    return { dom, document: w.document, window: w, liberarAuth, redirecciones };
}

const e = await entorno();
const d = e.document;
const cards = [...d.querySelectorAll('.mosaico > .card-principal')];
verificar(cards.length === 6, 'El mosaico contiene exactamente seis cards');
verificar(!d.querySelector('.mosaico #experiencias, .mosaico footer'), 'Experiencias y footer están fuera del mosaico');
verificar(new Set([...d.querySelectorAll('[id]')].map(n => n.id)).size === d.querySelectorAll('[id]').length, 'No existen identificadores duplicados');
for (const enlace of d.querySelectorAll('a[href^="#"]')) {
    verificar(d.getElementById(enlace.hash.slice(1)), 'Cada enlace interno tiene un destino: ' + enlace.hash);
}
for (const recurso of d.querySelectorAll('img[src], link[rel="stylesheet"], script[src]')) {
    const ruta = recurso.getAttribute('src') || recurso.getAttribute('href');
    await access(new URL('../' + decodeURIComponent(ruta), import.meta.url));
    comprobaciones++;
}
verificar(new Set(cards.map(c => c.querySelector('img').src)).size === 6, 'Las seis imágenes son distintas');
for (const card of cards) {
    if (card.classList.contains('card-cuenta')) {
        verificar(card.querySelector('.card-accion').getAttribute('href') === './login.html', 'La card de acceso dirige a Login');
        verificar(card.querySelector('.registro-card').getAttribute('href') === './signup.html', 'La card de registro dirige a Sign Up');
        continue;
    }
    card.querySelector('.card-accion').click();
    await esperar();
    const destino = d.getElementById(card.querySelector('.card-accion').hash.slice(1));
    verificar(destino.open, 'Cada card abre su contenido');
    verificar(d.querySelectorAll('dialog[open]').length === 1, 'Solo se abre un diálogo a la vez');
    destino.querySelector('.cerrar-dialogo').click();
    verificar(!destino.open && !e.window.location.hash, 'Cerrar limpia la ruta del diálogo');
}
verificar(d.querySelectorAll('#politicas .resumen-politica').length === 6, 'Los seis documentos tienen descripción y enlace individual');
verificar(d.querySelectorAll('#preguntas details').length === 6, 'Existen las seis preguntas y sus respuestas');
verificar(d.querySelectorAll('.testimonios figure').length === 3, 'Se muestran los tres testimonios proporcionados');
assert.deepEqual([...d.querySelectorAll('.testimonios figcaption')].map(n => n.textContent), ['Lizzia Clothing', 'Lovicon Brand', 'Rolos Fast Food']);
comprobaciones++;
verificar(!d.querySelector('.nota-testimonios'), 'Los testimonios autorizados no incluyen anotaciones editoriales');
verificar(!d.querySelector('.redes-pendientes a'), 'No hay enlaces ficticios en las redes sociales');
const mapa = [...d.querySelectorAll('a')].find(a => a.hostname === 'www.google.com');
verificar(new URL(mapa.href).searchParams.get('query') === 'Manizales, Caldas, Colombia', 'Maps muestra la ciudad solicitada');

const menu = d.querySelector('.menu-boton');
menu.click();
verificar(menu.getAttribute('aria-expanded') === 'true', 'El menú móvil se expande');
d.querySelector('#navegacion-principal a').click();
await esperar();
verificar(menu.getAttribute('aria-expanded') === 'false', 'Navegar cierra el menú móvil');
verificar(d.querySelector('.boton-acceso').getAttribute('href') === './login.html', 'El encabezado dirige a la página de Login');
verificar(!d.querySelector('#formulario-acceso, #formulario-registro'), 'Login y registro no están integrados en el Index');
verificar(!d.querySelector('a[href="#cuenta"], [data-registro]'), 'Los enlaces públicos de acceso no dependen de fragmentos');
const authModal = d.getElementById('auth-modal');
const marcoAuth = authModal.querySelector('iframe');
e.window.history.replaceState(null, '', '/index.html');
d.querySelector('.boton-acceso').click();
verificar(authModal.open && new URL(marcoAuth.src).pathname === '/login.html', 'Login se abre sobre el Index');
verificar(new URL(marcoAuth.src).searchParams.get('presentacion') === 'modal', 'La página independiente recibe el contexto de superposición');
d.getElementById('seccion-perfil').classList.remove('oculto');
await esperar();
verificar(!d.getElementById('cuenta').open, 'La actualización de sesión del Index no interrumpe la ventana de acceso');
d.getElementById('seccion-perfil').classList.add('oculto');
const enviarMensaje = (datos, origen = e.window.location.origin, fuente = marcoAuth.contentWindow) => e.window.dispatchEvent(new e.window.MessageEvent('message', { data: datos, origin: origen, source: fuente }));
enviarMensaje({ tipo: 'movanza:auth-cerrar' }, 'https://otro.example');
verificar(authModal.open, 'Ignora mensajes de otros sitios');
enviarMensaje({ tipo: 'movanza:auth-cerrar' }, e.window.location.origin, null);
verificar(authModal.open, 'Ignora mensajes que no provienen del formulario');
enviarMensaje({ tipo: 'movanza:auth-altura', altura: 480 });
verificar(marcoAuth.style.height === '480px', 'El contenedor se adapta a la altura del formulario');
enviarMensaje({ tipo: 'movanza:auth-vista', vista: 'signup' });
verificar(authModal.getAttribute('aria-label') === 'Crear cuenta', 'El título accesible sigue el cambio de interfaz');
enviarMensaje({ tipo: 'movanza:auth-completa', destino: 'https://otro.example' });
verificar(e.redirecciones.length === 0, 'La comunicación del formulario no permite destinos externos');
enviarMensaje({ tipo: 'movanza:auth-completa', destino: './home_empresa_1.html' });
verificar(e.redirecciones[0] === 'https://movanza.example/home_empresa_1.html', 'El acceso empresarial navega a Home Empresa 1 en la ventana principal');
enviarMensaje({ tipo: 'movanza:auth-completa', destino: './home_trabajador.html' });
verificar(e.redirecciones[1] === 'https://movanza.example/home_trabajador.html', 'El login superpuesto abre Home Trabajador en la ventana principal');
enviarMensaje({ tipo: 'movanza:auth-cerrar' });
verificar(!authModal.open && !marcoAuth.hasAttribute('src'), 'Cerrar retira el formulario y deja el Index disponible');
verificar(d.activeElement === d.querySelector('.boton-acceso'), 'Cerrar devuelve el foco al botón de acceso');
d.querySelector('.registro-card').click();
verificar(authModal.open && new URL(marcoAuth.src).pathname === '/signup.html', 'Crear cuenta también se abre sobre el Index');
authModal.querySelector('button').click();
const contacto = d.getElementById('formulario-contacto');
d.getElementById('contacto-nombre').value = 'Prueba';
d.getElementById('contacto-correo').value = 'prueba@example.test';
d.getElementById('contacto-mensaje').value = 'Consulta de prueba';
contacto.dispatchEvent(new e.window.Event('submit', { cancelable: true }));
verificar(d.getElementById('contacto-estado').textContent.includes('Para enviarlo'), 'El formulario dirige al canal real y no simula un envío');
d.getElementById('contacto-mensaje').value = '   ';
contacto.dispatchEvent(new e.window.Event('submit', { cancelable: true }));
verificar(!d.getElementById('contacto-mensaje').checkValidity(), 'El mensaje no acepta solo espacios');
d.getElementById('contacto-mensaje').value = 'Mensaje corregido';
d.getElementById('contacto-mensaje').dispatchEvent(new e.window.Event('input', { bubbles: true }));
verificar(d.getElementById('contacto-mensaje').checkValidity(), 'La corrección del campo quita el error');
verificar(!d.getElementById('contacto-estado').textContent, 'Editar limpia la confirmación anterior');
verificar(d.querySelector('.movanza-loader').hidden, 'La revisión local del formulario no simula esperas');

// La edición de perfil mantiene su funcionamiento en el Index.
e.window.history.replaceState(null, '', '/index.html');
d.getElementById('seccion-perfil').classList.remove('oculto');
await esperar();
const accesoBoton = d.querySelector('#boton-salir');
accesoBoton.disabled = true;
await esperar();
verificar(!d.querySelector('.movanza-loader').hidden, 'Aparece durante una solicitud del perfil existente');
verificar(d.querySelector('.cuenta-existente').getAttribute('aria-busy') === 'true', 'Comunica que la región está ocupada');
d.getElementById('mensaje').textContent = 'Error de acceso';
accesoBoton.disabled = false;
await esperar();
verificar(d.querySelector('.movanza-loader').hidden, 'Desaparece al finalizar una operación con error');
verificar(d.querySelector('.cuenta-existente').getAttribute('aria-busy') === 'false', 'Restablece la región al finalizar');
d.getElementById('mensaje').textContent = 'Comprobando sesión...';
await esperar();
verificar(!d.querySelector('.movanza-loader').hidden, 'Indica la recuperación real de sesión');
d.getElementById('mensaje').textContent = '';
await esperar();
verificar(d.querySelector('.movanza-loader').hidden, 'La recuperación completada retira el indicador');

// Volver al Index con sesión recuperada permite acceder al perfil existente.
d.getElementById('seccion-acceso').classList.add('oculto');
d.getElementById('seccion-perfil').classList.remove('oculto');
await esperar();
verificar(!d.getElementById('cuenta').open, 'Recuperar la sesion no abre Perfil automáticamente');
e.dom.window.close();

const directo = await entorno({ hash: '#preguntas' });
verificar(directo.document.getElementById('preguntas').open, 'Los enlaces directos abren la sección');
directo.window.location.hash = 'servicios';
await esperar();
verificar(directo.document.getElementById('servicios').open && !directo.document.getElementById('preguntas').open, 'Cambiar de ruta cierra la sección anterior');
directo.window.history.back();
await esperar();
verificar(directo.document.getElementById('preguntas').open, 'Atrás restaura la sección anterior');
directo.dom.window.close();

const regresoLegal = await entorno({ hash: '#politicas' });
regresoLegal.document.getElementById('seccion-perfil').classList.remove('oculto');
await esperar();
verificar(regresoLegal.document.getElementById('politicas').open, 'Recuperar sesión respeta el regreso desde una política');
verificar(!regresoLegal.document.getElementById('cuenta').open, 'El perfil no reemplaza una sección pública elegida');
regresoLegal.dom.window.close();

const offline = await entorno({ fallo: true });
verificar(offline.document.getElementById('mensaje').textContent.includes('No se pudo cargar'), 'El fallo del CDN tiene un mensaje visible');
verificar(offline.document.querySelector('.boton-acceso').getAttribute('href') === './login.html', 'El enlace independiente de Login sigue disponible');
verificar(offline.document.querySelector('.movanza-loader').hidden, 'El fallo de carga no deja un loader permanente');
offline.document.querySelector('.card-preguntas a').click();
await esperar();
verificar(offline.document.getElementById('preguntas').open, 'La navegación pública funciona aunque falle la autenticación');
offline.dom.window.close();
const pendiente = await entorno({ demorarAuth: true });
verificar(!pendiente.document.querySelector('.movanza-loader').hidden, 'El indicador permanece durante una carga pendiente');
pendiente.liberarAuth();
await esperar();
verificar(pendiente.document.querySelector('.movanza-loader').hidden, 'La resolución de la carga retira el indicador');
pendiente.dom.window.close();
console.log(`Index público: ${comprobaciones} comprobaciones correctas.`);
