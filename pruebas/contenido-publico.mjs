import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

if (!process.argv[2]) throw new Error('Indica el directorio temporal con jsdom.');
const { JSDOM } = await import(pathToFileURL(join(resolve(process.argv[2]), 'node_modules/jsdom/lib/api.js')));
const raiz = new URL('../', import.meta.url);
const leer = ruta => readFile(new URL(ruta, raiz), 'utf8');
const normalizar = texto => texto.replace(/\s+/g, ' ').trim();
// Solo ignora formato de TXT: separadores, marcadores de lista y saltos de línea.
const normalizarLegal = texto => normalizar(texto.replace(/={5,}/g, '').replace(/\[\s*\]/g, '').replace(/^\s*-\s+/gm, ''));
const dom = new JSDOM(await leer('index.html'), { url: 'https://movanza.example/index.html' });
const d = dom.window.document;
let comprobaciones = 0;
function igual(actual, esperado, mensaje) { assert.equal(actual, esperado, mensaje); comprobaciones++; }
function verificar(condicion, mensaje) { assert.ok(condicion, mensaje); comprobaciones++; }

const fuente = (await leer('informacion/Movanza_Contenido_Index.txt')).replace(/\r\n/g, '\n');
const bloques = [...fuente.matchAll(/^([0-5])\. [^\n]+\n+([\s\S]*?)(?=\n-{10,}|(?![\s\S]))/gm)].map(m => m[2].trim().split(/\n\n+/));
igual(bloques.length, 6, 'Existen las seis secciones oficiales');
igual(d.querySelector('.portada h1').textContent, bloques[0][0], 'Título oficial de Inicio');
const textoInicio = normalizar(d.querySelector('.portada-texto').textContent);
for (const texto of bloques[0].slice(1, 3)) verificar(textoInicio.includes(texto), 'Se conserva la descripción y el lema de Inicio');
assert.deepEqual([...d.querySelectorAll('.portada-acciones a')].map(a => a.textContent.replace('↗', '').trim()), ['Conoce MOVANZA', 'Contáctanos']);
comprobaciones++;
for (const [indice, id] of [[1, 'nosotros'], [2, 'politicas'], [3, 'contacto'], [4, 'servicios'], [5, 'preguntas']]) {
    igual(d.querySelector(`#${id} > h2`).textContent, bloques[indice][0], 'Título oficial de ' + id);
}
const textoNosotros = normalizar(d.getElementById('nosotros').textContent);
for (const parrafo of bloques[1].slice(1)) verificar(textoNosotros.includes(parrafo), 'Nosotros conserva los nombres, propósito, misión y visión oficiales');
const textoServicios = normalizar(d.getElementById('servicios').textContent);
for (const parrafo of bloques[4].slice(1)) {
    for (const linea of parrafo.split('\n')) verificar(textoServicios.includes(linea), 'Servicios conserva cada descripción y el público definido');
}
const faqs = [...d.querySelectorAll('#preguntas details')];
igual(faqs.length, bloques[5].length - 1, 'Están todas las preguntas oficiales');
for (const [i, faq] of faqs.entries()) {
    const [pregunta, respuesta] = bloques[5][i + 1].split('\n');
    igual(faq.querySelector('summary').textContent, pregunta, 'Pregunta oficial sin sustituciones');
    igual(faq.querySelector('p').textContent, respuesta, 'Respuesta oficial sin sustituciones');
}
igual(d.querySelector('#contacto a[href^="tel:"]').getAttribute('href'), 'tel:+576068631514', 'Teléfono oficial');
igual(d.querySelector('#contacto a[href^="https://wa.me"]').getAttribute('href'), 'https://wa.me/573005623545', 'WhatsApp oficial');
igual(d.querySelector('#contacto a[href^="mailto:"]').getAttribute('href'), 'mailto:juanfer27y@gmail.com', 'Correo oficial');
verificar(d.querySelector('#contacto a[href="./login.html"]'), 'El chat dirige a la página de acceso');
verificar(d.querySelector('#contacto-aviso').textContent.includes('Para enviarlo'), 'El formulario explica cómo utilizar los canales de contacto');

const legal = (await leer('informacion/Movanza_Politicas_Completas.txt')).replace(/\r\n/g, '\n');
const documentos = [...legal.matchAll(/^={64}\nDOCUMENTO (\d)\. ([^\n]+)\n={64}\n/gm)];
const inicioAnexos = legal.indexOf('\n================================================================ ANEXO');
const enlaces = [...d.querySelectorAll('#politicas .resumen-politica a')];
igual(enlaces.length, documentos.length, 'Una página real para cada documento completo');
let reconstruido = '';
let cuerposOriginales = '';
for (let i = 0; i < enlaces.length; i++) {
    const resumen = enlaces[i].closest('.resumen-politica');
    const [nombre, descripcion] = bloques[2][i + 3].split('\n');
    igual(resumen.querySelector('h3').textContent, nombre, 'Nombre oficial de política');
    igual(resumen.querySelector('p').textContent, descripcion, 'Descripción breve exacta');
    const ruta = enlaces[i].getAttribute('href').replace(/^\.\//, '');
    await access(new URL(ruta, raiz));
    const pagina = new JSDOM(await leer(ruta));
    const p = pagina.window.document;
    const original = legal.slice(documentos[i].index, documentos[i + 1]?.index ?? inicioAnexos);
    const cuerpoOriginal = original.slice(documentos[i][0].length);
    igual(normalizar(p.querySelector('.texto-legal').textContent), normalizar(cuerpoOriginal), 'Documento completo íntegro, sin cambios de palabras: ' + nombre);
    verificar(!p.querySelector('.preambulo-original, .anexos-originales, .estado-legal, .aviso-legal'), 'La página no incluye notas internas de preparación');
    const fuentesOriginales = legal.slice(inicioAnexos).split(/ANEXO\s+B\. FUENTES NORMATIVAS Y OFICIALES CONSULTADAS/)[1].split('NOTA FINAL:')[0];
    igual(normalizarLegal(p.querySelector('.referencias-legales').textContent), normalizarLegal(fuentesOriginales), 'Se conservan las referencias normativas');
    verificar(!p.querySelector('pre'), 'El documento utiliza HTML de lectura en lugar de texto preformateado');
    const apartados = [...p.querySelectorAll('.apartado-legal')];
    igual(apartados.length, [...cuerpoOriginal.matchAll(/^\d+\.\s/gm)].length, 'Todos los apartados tienen sección propia');
    igual(p.querySelectorAll('.indice-escritorio ol a').length, apartados.length, 'El índice cubre todos los apartados');
    verificar(p.querySelector('.indice-movil:not([open])'), 'El índice móvil comienza plegado');
    for (const enlace of p.querySelectorAll('a[href^="#"]')) verificar(p.getElementById(enlace.hash.slice(1)), 'El índice y los enlaces internos tienen destino');
    for (const apartado of apartados) {
        verificar(apartado.querySelector('h2') && apartado.querySelector('p'), 'Cada título está separado de su párrafo');
        verificar(!apartado.querySelector('p').textContent.includes('\n'), 'Los párrafos fluyen sin saltos artificiales de TXT');
    }
    if (i === 0) {
        igual(normalizar(p.querySelector('#apartado-1 h2').textContent), '1. OBJETO Y ALCANCE', 'MOVANZA pertenece al párrafo, no al título');
        verificar(p.querySelector('#apartado-1 p').textContent.startsWith('MOVANZA es'), 'Se conserva el inicio correcto del párrafo');
    }
    verificar(p.querySelector('a[href="../index.html#politicas"]'), 'Regreso directo a la sección de políticas');
    for (const enlace of p.querySelectorAll('link[rel="stylesheet"]')) await access(new URL(enlace.getAttribute('href'), new URL(ruta, raiz)));
    reconstruido += ' ' + p.querySelector('.texto-legal').textContent;
    cuerposOriginales += ' ' + cuerpoOriginal;
    pagina.window.close();
}
igual(normalizar(reconstruido), normalizar(cuerposOriginales), 'Las páginas conservan íntegros los seis cuerpos legales');
verificar(!d.querySelector('.texto-legal'), 'El texto legal extenso está fuera del Index');

const fondo = d.querySelector('.fondo-exterior');
verificar(fondo.getAttribute('aria-hidden') === 'true' && fondo.hasAttribute('inert'), 'El fondo es decorativo y no participa en la interacción');
igual([...fondo.children].map(n => n.id).join(','), 'stars,stars2,stars3,', 'El fondo mantiene los elementos del recurso original');
verificar(d.querySelector('link[href="./recursos/efecto_fondo/fondo.css"]'), 'Se carga directamente el CSS original del fondo');
verificar(d.querySelector('.sitio-publico > main') && !fondo.contains(d.querySelector('main')), 'El contenido tiene una superficie independiente');
igual(d.querySelectorAll('.mosaico > .efecto-card > .efecto-card-borde').length, 6, 'El efecto reutilizable está presente en las seis cards');
dom.window.close();
console.log(`Contenido oficial, documentos y recursos: ${comprobaciones} comprobaciones correctas.`);
