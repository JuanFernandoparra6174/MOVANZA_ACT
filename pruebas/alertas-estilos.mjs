// Regresión en Chromium real: cascada de las páginas y geometría del brillo.
// Uso: node pruebas/alertas-estilos.mjs <ruta-a-chrome-o-edge>
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const raiz = new URL('../', import.meta.url);
const casos = [];
for (const pagina of ['index.html', 'login.html', 'home_empresa_2.html', 'home_trabajador.html', 'paginas/mis_asignaciones.html', 'paginas/mis_invitaciones.html']) {
    const url = new URL(pagina, raiz), html = await readFile(url, 'utf8');
    const hojas = [...html.matchAll(/<link\b[^>]*href="([^"]+\.css)"[^>]*>/g)].filter(h => new URL(h[1], url).protocol === 'file:');
    const css = await Promise.all(hojas.map(h => readFile(new URL(h[1], url), 'utf8')));
    css.push(await readFile(new URL('estilos/perfil-modal.css', raiz), 'utf8'));
    casos.push({ pagina, clase: /<body[^>]*class="([^"]*)"/.exec(html)?.[1] || '', css: css.join('\n') });
}
const carpeta = await mkdtemp(join(tmpdir(), 'movanza-alertas-estilos-'));
const entrada = join(carpeta, 'verificar.html');
await writeFile(entrada, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style id="estilos"></style>
<body><dialog id="movanza-alerta" class="movanza-alerta"><div class="alerta-card"><div class="alerta-blob"></div><div class="alerta-bg"></div><div class="alerta-contenido"><button class="alerta-cerrar" aria-label="Cerrar">×</button><p class="alerta-marca">MOVANZA · CONTIGO EN CADA PASO</p><span class="alerta-icono">!</span><h2>Descartar cambios</h2><p id="movanza-alerta-mensaje">Tienes cambios sin guardar. ¿Quieres descartarlos?</p><form><div class="alerta-acciones"><button type="button" class="alerta-cancelar">Cancelar</button><button type="submit" class="alerta-confirmar">Descartar cambios</button></div></form></div></div></dialog>
<script>
const casos = ${JSON.stringify(casos).replaceAll('<', '\\u003c')};
const dialogo = document.querySelector('dialog'); dialogo.showModal();
const comprobar = (ok, detalle) => { if (!ok) throw Error(detalle); };
function luminancia(color) {
 const rgb = color.match(/[\\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
 return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
try {
 for (const caso of casos) {
  document.body.className = caso.clase; document.querySelector('#estilos').textContent = caso.css;
  for (const destructiva of ['false', 'true']) {
   dialogo.dataset.destructiva = destructiva;
   // Medir el estado de reposo, después de las transiciones al cambiar de hoja.
   for (const animacion of document.getAnimations()) if (animacion instanceof CSSTransition) animacion.finish();
   for (const clase of ['alerta-cancelar', 'alerta-confirmar']) {
    const estilo = getComputedStyle(document.querySelector('.' + clase));
    comprobar(estilo.backgroundColor !== 'rgba(0, 0, 0, 0)', caso.pagina + ': fondo transparente');
    const valores = [luminancia(estilo.color), luminancia(estilo.backgroundColor)].sort((a,b) => b-a);
    comprobar((valores[0] + .05) / (valores[1] + .05) >= 4.5, caso.pagina + ': texto sin contraste en ' + clase + ' (' + estilo.color + ' / ' + estilo.backgroundColor + ')');
   }
  }
  const blob = document.querySelector('.alerta-blob'), animacion = blob.getAnimations()[0];
  comprobar(!!animacion, caso.pagina + ': falta el brillo animado'); animacion.pause();
  for (const [tiempo, derecha, abajo] of [[0,false,false], [1250,true,false], [2500,true,true], [3750,false,true]]) {
   animacion.currentTime = tiempo;
   const card = document.querySelector('.alerta-card').getBoundingClientRect(), luz = blob.getBoundingClientRect();
   comprobar(Math.abs(luz.x + luz.width / 2 - (derecha ? card.right : card.left)) < 2 && Math.abs(luz.y + luz.height / 2 - (abajo ? card.bottom : card.top)) < 2, caso.pagina + ': el brillo no alcanza el borde');
  }
  comprobar(dialogo.getBoundingClientRect().width <= innerWidth, caso.pagina + ': desbordamiento horizontal');
 }
 for (const animacion of dialogo.getAnimations()) if (animacion.animationName === 'alerta-entrada') animacion.finish();
 document.querySelector('.alerta-cancelar').focus();
 document.documentElement.dataset.resultado = 'ok';
} catch (error) { document.documentElement.dataset.resultado = error.message; }
</script>`, 'utf8');
for (const [ancho, alto] of [[1365, 900], [390, 844]]) {
    const captura = join(carpeta, `alerta-${ancho}.png`);
    // Emulación real: Chrome en Windows impone un ancho mínimo a la ventana.
    const navegador = spawn(process.argv[2], ['--headless', '--disable-gpu', '--no-first-run', '--disable-background-networking', '--remote-debugging-pipe', `--user-data-dir=${join(carpeta, 'perfil-' + ancho)}`], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
    let secuencia = 0, buffer = ''; const pendientes = new Map();
    const enviar = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
        const id = ++secuencia; pendientes.set(id, { resolve, reject });
        navegador.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\0');
    });
    const rechazar = error => { for (const p of pendientes.values()) p.reject(error); pendientes.clear(); };
    navegador.on('error', rechazar);
    navegador.on('exit', () => rechazar(new Error('Chrome se cerró antes de completar la prueba.')));
    navegador.stdio[4].on('data', datos => {
        buffer += datos.toString(); let fin;
        while ((fin = buffer.indexOf('\0')) >= 0) {
            const mensaje = JSON.parse(buffer.slice(0, fin)); buffer = buffer.slice(fin + 1);
            const p = pendientes.get(mensaje.id); if (!p) continue;
            pendientes.delete(mensaje.id); mensaje.error ? p.reject(new Error(mensaje.error.message)) : p.resolve(mensaje.result);
        }
    });
    const limite = setTimeout(() => { rechazar(new Error('Tiempo de prueba agotado.')); navegador.kill(); }, 30000);
    try {
        const { targetId } = await enviar('Target.createTarget', { url: 'about:blank' });
        const { sessionId } = await enviar('Target.attachToTarget', { targetId, flatten: true });
        const pagina = (metodo, params) => enviar(metodo, params, sessionId);
        await pagina('Emulation.setDeviceMetricsOverride', { width: ancho, height: alto, deviceScaleFactor: 1, mobile: ancho < 500 });
        await pagina('Page.navigate', { url: pathToFileURL(entrada).href });
        const { result } = await pagina('Runtime.evaluate', { expression: `new Promise(resolve => { const comprobar = () => document.documentElement.dataset.resultado ? resolve({ resultado: document.documentElement.dataset.resultado, ancho: innerWidth }) : setTimeout(comprobar, 10); comprobar(); })`, awaitPromise: true, returnByValue: true });
        assert.equal(result.value.resultado, 'ok'); assert.equal(result.value.ancho, ancho);
        const { data } = await pagina('Page.captureScreenshot', { format: 'png' });
        await writeFile(captura, Buffer.from(data, 'base64'));
        console.log(`Contraste sin hover y brillo en los cuatro bordes: 6 páginas, ${ancho}px. Captura: ${captura}`);
    } finally {
        clearTimeout(limite); await enviar('Browser.close').catch(() => {}); navegador.kill();
    }
}
