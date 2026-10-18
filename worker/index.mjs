import { validarContacto } from '../scripts/contacto-validacion.js';

const MAX_CUERPO = 32 * 1024;
const MENSAJE_ENVIO = 'No pudimos confirmar el envío. Conservamos tu mensaje para que puedas volver a intentarlo.';
// Solo se registra este vocabulario, nunca mensajes ni cuerpos del proveedor.
const CODIGOS_RESEND = new Set([
    'validation_error', 'missing_api_key', 'restricted_api_key', 'invalid_permission',
    'suspended_api_key', 'invalid_idempotency_key', 'concurrent_idempotent_requests',
    'invalid_idempotent_request', 'missing_required_field', 'missing_required_parameter',
    'invalid_parameter', 'daily_quota_exceeded', 'monthly_quota_exceeded',
    'rate_limit_exceeded', 'application_error', 'service_unavailable', 'not_found',
    'method_not_allowed', 'resource_locked'
]);
const TIPOS_EXCEPCION = new Set(['Error', 'TypeError', 'SyntaxError', 'RangeError', 'AbortError', 'TimeoutError']);
const responder = (status, cuerpo, cabeceras = {}) => Response.json(cuerpo, {
    status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...cabeceras }
});
const error = (status, mensaje, cabeceras) => responder(status, { ok: false, mensaje }, cabeceras);
const escapar = valor => valor.replace(/[&<>"']/g, letra => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[letra]);

function crearDiagnostico(registrar) {
    const solicitudId = crypto.randomUUID(), inicio = Date.now();
    return {
        solicitudId,
        anotar(etapa, categoria, detalle = {}) {
            // Todos los valores son constantes, números o códigos de listas cerradas.
            // No se incluye URL, IP, correo, contenido, cabeceras ni claves de idempotencia.
            const registro = { evento: 'contacto', solicitudId, etapa, categoria, duracionMs: Date.now() - inicio, ...detalle };
            try { registrar(registro); } catch { /* Un fallo del logger no altera el envío. */ }
        }
    };
}

function clasificarHTTP(status) {
    if (status === 401) return 'autenticacion_proveedor';
    if (status === 403) return 'permiso_o_dominio_proveedor';
    if (status === 409) return 'conflicto_idempotencia';
    if (status === 429) return 'limite_proveedor';
    if (status >= 500) return 'error_proveedor';
    if (status === 400 || status === 422) return 'validacion_proveedor';
    return 'error_http_proveedor';
}

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

async function contacto(request, env, enviar, diagnostico) {
    if (request.method !== 'POST') return error(405, 'Utiliza el formulario para enviar tu mensaje.', { Allow: 'POST' });
    const origen = new URL(request.url).origin;
    if (request.headers.get('Origin') !== origen || request.headers.get('Sec-Fetch-Site') === 'cross-site') return error(403, 'Envía el mensaje desde el formulario de MOVANZA.');
    if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json' || ![null, 'identity'].includes(request.headers.get('Content-Encoding'))) return error(415, 'El formato de la solicitud no es válido.');
    const claveResend = typeof env.RESEND_API_KEY === 'string' ? env.RESEND_API_KEY.trim() : '';
    if (!claveResend || !env.CONTACTO_LIMITE?.limit || !env.CONTACTO_LIMITE_TOTAL?.limit) {
        diagnostico.anotar('configuracion', !claveResend ? 'secreto_ausente' : 'limitador_ausente');
        return error(503, 'El formulario no está disponible temporalmente. Inténtalo más tarde.');
    }

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
    let etapa = 'resend_envio', signal, estadoProveedor;
    diagnostico.anotar(etapa, 'inicio');
    try {
        signal = AbortSignal.timeout(10_000);
        const respuesta = await enviar('https://api.resend.com/emails', {
            method: 'POST', headers: { Authorization: `Bearer ${claveResend}`, 'Content-Type': 'application/json', 'Idempotency-Key': clave },
            body: JSON.stringify(payload), signal, redirect: 'manual'
        });
        estadoProveedor = respuesta.status;
        etapa = 'resend_respuesta';
        // Workers no admite redirect: 'error'. Manual permite rechazar 3xx sin
        // reenviar Authorization a otra URL ni intentar una segunda petición.
        if (estadoProveedor >= 300 && estadoProveedor < 400) {
            diagnostico.anotar(etapa, 'redireccion_rechazada', { estadoProveedor });
            await respuesta.body?.cancel();
            return error(502, MENSAJE_ENVIO);
        }
        let resultado, cuerpoProveedor = 'json';
        try { resultado = await leerCuerpo(respuesta); }
        catch (fallo) {
            if (signal.aborted || fallo?.name === 'AbortError' || fallo?.name === 'TimeoutError') throw fallo;
            cuerpoProveedor = fallo instanceof RangeError ? 'excesivo' : 'invalido';
        }
        if (!respuesta.ok) {
            const codigoResend = CODIGOS_RESEND.has(resultado?.name) ? resultado.name : 'no_clasificado';
            diagnostico.anotar(etapa, clasificarHTTP(estadoProveedor), { estadoProveedor, codigoResend, cuerpoProveedor });
            return error(502, MENSAJE_ENVIO);
        }
        if (cuerpoProveedor !== 'json' || typeof resultado?.id !== 'string' || !resultado.id.trim()) {
            diagnostico.anotar(etapa, 'respuesta_invalida', { estadoProveedor, cuerpoProveedor, motivo: cuerpoProveedor === 'json' ? 'id_ausente' : 'cuerpo_no_valido' });
            return error(502, MENSAJE_ENVIO);
        }
        diagnostico.anotar(etapa, 'aceptado', { estadoProveedor });
        return responder(202, { ok: true });
    } catch (fallo) {
        const tiempoAgotado = signal?.aborted || fallo?.name === 'AbortError' || fallo?.name === 'TimeoutError';
        const tipoExcepcion = TIPOS_EXCEPCION.has(fallo?.name) ? fallo.name : 'desconocida';
        diagnostico.anotar(etapa, tiempoAgotado ? 'tiempo_agotado' : etapa === 'resend_envio' ? 'conexion_o_preparacion' : 'lectura_fallida', {
            tipoExcepcion, ...(estadoProveedor === undefined ? {} : { estadoProveedor })
        });
        return error(502, MENSAJE_ENVIO);
    }
}

// La inyección de fetch permite probar Resend sin correos reales ni secretos.
export function crearWorker(enviar = fetch, registrar = registro => console.log(JSON.stringify(registro))) {
    return { async fetch(request, env) {
        const ruta = new URL(request.url).pathname;
        if (!ruta.startsWith('/api/')) return env.ASSETS.fetch(request);
        if (ruta !== '/api/contacto') return error(404, 'Esta ruta no existe.');
        const diagnostico = crearDiagnostico(registrar);
        diagnostico.anotar('solicitud', 'inicio');
        let respuesta;
        try { respuesta = await contacto(request, env, enviar, diagnostico); }
        catch {
            diagnostico.anotar('interno', 'error_controlado');
            respuesta = error(503, 'El formulario no está disponible temporalmente. Inténtalo más tarde.');
        }
        diagnostico.anotar('respuesta', respuesta.status === 202 ? 'aceptado' : 'rechazado', { estadoHttp: respuesta.status });
        respuesta.headers.set('X-Contacto-Id', diagnostico.solicitudId);
        return respuesta;
    } };
}
export default crearWorker();
