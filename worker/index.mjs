import { validarContacto } from '../scripts/contacto-validacion.js';

const MAX_CUERPO = 32 * 1024;
const responder = (status, cuerpo, cabeceras = {}) => Response.json(cuerpo, {
    status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...cabeceras }
});
const error = (status, mensaje, cabeceras) => responder(status, { ok: false, mensaje }, cabeceras);
const escapar = valor => valor.replace(/[&<>"']/g, letra => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[letra]);

async function leerCuerpo(request) {
    if (Number(request.headers.get('Content-Length')) > MAX_CUERPO) throw new RangeError();
    if (!request.body) throw new SyntaxError();
    const lector = request.body.getReader(), partes = []; let longitud = 0;
    try {
        while (true) {
            const { done, value } = await lector.read(); if (done) break;
            longitud += value.byteLength;
            if (longitud > MAX_CUERPO) { await lector.cancel(); throw new RangeError(); }
            partes.push(value);
        }
    } finally { lector.releaseLock(); }
    const bytes = new Uint8Array(longitud); let posicion = 0;
    for (const parte of partes) { bytes.set(parte, posicion); posicion += parte.length; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

async function contacto(request, env, enviar) {
    if (request.method !== 'POST') return error(405, 'Utiliza el formulario para enviar tu mensaje.', { Allow: 'POST' });
    const origen = new URL(request.url).origin;
    if (request.headers.get('Origin') !== origen || request.headers.get('Sec-Fetch-Site') === 'cross-site') return error(403, 'Envía el mensaje desde el formulario de MOVANZA.');
    if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json' || ![null, 'identity'].includes(request.headers.get('Content-Encoding'))) return error(415, 'El formato de la solicitud no es válido.');
    if (!env.RESEND_API_KEY?.trim() || !env.CONTACTO_LIMITE?.limit || !env.CONTACTO_LIMITE_TOTAL?.limit) return error(503, 'El formulario no está disponible temporalmente. Inténtalo más tarde.');

    // CF-Connecting-IP lo establece Cloudflare; no se confía en X-Forwarded-For.
    const ip = request.headers.get('CF-Connecting-IP') || 'sin-ip';
    if (!(await env.CONTACTO_LIMITE.limit({ key: 'contacto:ip:' + ip })).success) return error(429, 'Has enviado varias solicitudes. Espera un minuto antes de volver a intentarlo.', { 'Retry-After': '60' });
    let entrada;
    try { entrada = await leerCuerpo(request); }
    catch (e) { return error(e instanceof RangeError ? 413 : 400, e instanceof RangeError ? 'El mensaje supera el tamaño permitido.' : 'No se pudo leer el mensaje. Revisa el formulario.'); }
    if (!entrada || Array.isArray(entrada) || typeof entrada !== 'object' || Object.keys(entrada).some(campo => !['nombre', 'correo', 'mensaje', 'sitioWeb'].includes(campo)) || (entrada.sitioWeb !== undefined && entrada.sitioWeb !== '')) return error(400, 'La solicitud no es válida. Revisa el formulario.');
    const { datos, errores, valido } = validarContacto(entrada);
    if (!valido) return responder(422, { ok: false, mensaje: 'Revisa los campos indicados.', errores });

    // La fecha del primer intento mantiene idéntica la plantilla en reintentos.
    // No se usa para permisos ni para datos de negocio; se limita a 23 horas.
    const clave = request.headers.get('Idempotency-Key') || '';
    const coincidencia = /^contacto-(\d{13})-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.exec(clave);
    const fecha = Number(coincidencia?.[1]), ahora = Date.now();
    if (!coincidencia || fecha < ahora - 23 * 60 * 60 * 1000 || fecha > ahora + 60_000) return error(400, 'La solicitud ha vencido. Actualiza el formulario e inténtalo de nuevo.');
    const correoHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(datos.correo.toLowerCase()))), byte => byte.toString(16).padStart(2, '0')).join('');
    if (!(await env.CONTACTO_LIMITE.limit({ key: 'contacto:correo:' + correoHash })).success || !(await env.CONTACTO_LIMITE_TOTAL.limit({ key: 'contacto:total' })).success) return error(429, 'En este momento recibimos varias solicitudes. Espera un minuto y vuelve a intentarlo.', { 'Retry-After': '60' });

    const fechaTexto = new Date(fecha).toISOString();
    const payload = {
        from: 'Movanza <formularios@notificaciones.movanza.site>',
        to: ['contacto@movanza.site'], reply_to: datos.correo,
        subject: 'Nuevo mensaje de contacto — Movanza',
        text: `Nuevo mensaje de contacto\n\nNombre: ${datos.nombre}\nCorreo: ${datos.correo}\nFecha de solicitud (UTC): ${fechaTexto}\n\n${datos.mensaje}`,
        html: `<html lang="es"><body style="margin:0;background:#f7f7f7;color:#303044;font:16px/1.6 Arial,sans-serif"><main style="max-width:600px;margin:24px auto;padding:32px;background:#fff;border:1px solid #ddd;border-radius:14px"><p style="color:#5f4d93;font-weight:bold;letter-spacing:2px">MOVANZA</p><h1 style="font-size:24px">Nuevo mensaje de contacto</h1><p><strong>Nombre:</strong> ${escapar(datos.nombre)}<br><strong>Correo:</strong> ${escapar(datos.correo)}<br><strong>Fecha de solicitud (UTC):</strong> ${fechaTexto}</p><div style="border-top:1px solid #ddd;padding-top:20px;white-space:pre-wrap;overflow-wrap:anywhere">${escapar(datos.mensaje)}</div><p style="font-size:13px;color:#625b71">Puedes responder directamente a este correo para contactar con el visitante.</p></main></body></html>`
    };
    try {
        const respuesta = await enviar('https://api.resend.com/emails', {
            method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': clave },
            body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000), redirect: 'error'
        });
        if (!respuesta.ok) { await respuesta.body?.cancel(); return error(502, 'No pudimos confirmar el envío. Conservamos tu mensaje para que puedas volver a intentarlo.'); }
        const resultado = await respuesta.json();
        if (typeof resultado.id !== 'string' || !resultado.id.trim()) return error(502, 'No pudimos confirmar el envío. Vuelve a intentarlo.');
        return responder(202, { ok: true });
    } catch {
        return error(502, 'No pudimos confirmar el envío. Conservamos tu mensaje para que puedas volver a intentarlo.');
    }
}

// La inyección de fetch permite probar Resend sin correos reales ni secretos.
export function crearWorker(enviar = fetch) {
    return { async fetch(request, env) {
        const ruta = new URL(request.url).pathname;
        if (!ruta.startsWith('/api/')) return env.ASSETS.fetch(request);
        if (ruta !== '/api/contacto') return error(404, 'Esta ruta no existe.');
        try { return await contacto(request, env, enviar); }
        catch { return error(503, 'El formulario no está disponible temporalmente. Inténtalo más tarde.'); }
    } };
}
export default crearWorker();
