import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearWorker as crearWorkerReal } from '../worker/index.mjs';
const crearWorker = enviar => crearWorkerReal(enviar, () => {});

const valido = { nombre: 'Ana <Equipo>', correo: 'ana@example.com', mensaje: 'Consulta & detalles\n¿Podemos conversar?', sitioWeb: '' };
const clave = () => `contacto-${Date.now()}-${crypto.randomUUID()}`;
const entorno = cambios => ({ RESEND_API_KEY: 'secreto-solo-de-prueba', CONTACTO_LIMITE: { limit: async () => ({ success: true }) }, CONTACTO_LIMITE_TOTAL: { limit: async () => ({ success: true }) }, ...cambios });
function peticion(datos = valido, headers = {}, opciones = {}) {
    return new Request('https://movanza.site/api/contacto', { method: 'POST', headers: { Origin: 'https://movanza.site', 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1', 'Idempotency-Key': clave(), ...headers }, body: JSON.stringify(datos), ...opciones });
}
const nuncaEnviar = () => { throw new Error('No debería llamar a Resend.'); };

test('formulario válido: destinatario fijo, Reply-To, fecha y HTML escapado', async () => {
    let llamadas = 0;
    const worker = crearWorker(async (url, opciones) => {
        llamadas++; assert.equal(url, 'https://api.resend.com/emails');
        const correo = JSON.parse(opciones.body);
        assert.equal(correo.from, 'Movanza <formularios@notificaciones.movanza.site>');
        assert.deepEqual(correo.to, ['contacto@movanza.site']);
        assert.equal(correo.reply_to, valido.correo);
        assert.equal(correo.subject, 'Nuevo mensaje de contacto — Movanza');
        assert.match(correo.html, /Ana &lt;Equipo&gt;/); assert.match(correo.html, /Consulta &amp; detalles/);
        assert.doesNotMatch(correo.html, /Ana <Equipo>/); assert.match(correo.text, /Fecha de solicitud \(UTC\): \d{4}-/);
        assert.equal(opciones.headers.Authorization, 'Bearer secreto-solo-de-prueba');
        return Response.json({ id: 'id-proveedor-simulado' });
    });
    const respuesta = await worker.fetch(peticion(), entorno());
    assert.equal(respuesta.status, 202); assert.deepEqual(await respuesta.json(), { ok: true });
    assert.equal(respuesta.headers.get('Cache-Control'), 'no-store'); assert.equal(llamadas, 1);
});

for (const [nombre, datos] of [
    ['vacíos', { nombre: ' ', correo: '', mensaje: '' }],
    ['correo inválido', { ...valido, correo: 'ana@@example.com' }],
    ['inyección en correo', { ...valido, correo: 'ana@example.com\r\nBcc: otro@example.com' }],
    ['mensaje demasiado largo', { ...valido, mensaje: 'x'.repeat(4001) }],
    ['tipo incorrecto', { ...valido, nombre: { dato: 'Ana' } }]
]) test(`validación: ${nombre}`, async () => {
    const respuesta = await crearWorker(nuncaEnviar).fetch(peticion(datos), entorno());
    assert.equal(respuesta.status, 422); assert.equal((await respuesta.json()).ok, false);
});

test('rechaza destinatarios adicionales, antispam y objetos inválidos', async () => {
    for (const datos of [{ ...valido, to: 'otro@example.com' }, { ...valido, sitioWeb: 'spam' }, { ...valido, sitioWeb: null }, [], null]) {
        assert.equal((await crearWorker(nuncaEnviar).fetch(peticion(datos), entorno())).status, 400);
    }
});
test('JSON malformado, UTF-8 inválido y límites de bytes, incluso sin Content-Length', async () => {
    const worker = crearWorker(nuncaEnviar);
    assert.equal((await worker.fetch(peticion(valido, {}, { body: '{' }), entorno())).status, 400);
    assert.equal((await worker.fetch(peticion(valido, {}, { body: new Uint8Array([0xff]) }), entorno())).status, 400);
    assert.equal((await worker.fetch(peticion(valido, {}, { body: ' '.repeat(32769) }), entorno())).status, 413);
    assert.equal((await worker.fetch(peticion(valido, { 'Content-Length': '40000' }), entorno())).status, 413);
    const stream = new ReadableStream({ start(controlador) { controlador.enqueue(new Uint8Array(32769)); controlador.close(); } });
    assert.equal((await worker.fetch(peticion(valido, {}, { body: stream, duplex: 'half' }), entorno())).status, 413);
});
test('método, formato y solicitudes de otro origen no autorizados', async () => {
    const worker = crearWorker(nuncaEnviar);
    assert.equal((await worker.fetch(new Request('https://movanza.site/api/contacto'), entorno())).status, 405);
    for (const headers of [{ Origin: 'https://ajeno.example' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
        const respuesta = await worker.fetch(peticion(valido, headers), entorno());
        assert.equal(respuesta.status, 403); assert.equal(respuesta.headers.get('Access-Control-Allow-Origin'), null);
    }
    assert.equal((await worker.fetch(peticion(valido, { 'Content-Type': 'text/plain' }), entorno())).status, 415);
});
test('clave ausente, limitador ausente o averiado: fallo seguro', async () => {
    for (const cambio of [{ RESEND_API_KEY: '' }, { CONTACTO_LIMITE: null }, { CONTACTO_LIMITE_TOTAL: null }, { CONTACTO_LIMITE: { limit() { throw new Error('interno'); } } }]) {
        const respuesta = await crearWorker(nuncaEnviar).fetch(peticion(), entorno(cambio));
        assert.equal(respuesta.status, 503); assert.doesNotMatch(await respuesta.text(), /interno|secreto/);
    }
});
test('límites por IP, correo y total rechazan antes de enviar', async () => {
    for (const bloqueo of ['ip', 'correo', 'total']) {
        const env = entorno({
            CONTACTO_LIMITE: { limit: async ({ key }) => ({ success: !key.startsWith('contacto:' + bloqueo + ':') }) },
            CONTACTO_LIMITE_TOTAL: { limit: async () => ({ success: bloqueo !== 'total' }) }
        });
        const respuesta = await crearWorker(nuncaEnviar).fetch(peticion(), env);
        assert.equal(respuesta.status, 429); assert.equal(respuesta.headers.get('Retry-After'), '60');
    }
});
test('identificador inválido o vencido no llega a Resend', async () => {
    for (const id of ['incorrecto', `contacto-${Date.now() - 86400000}-${crypto.randomUUID()}`, `contacto-${Date.now() + 120000}-${crypto.randomUUID()}`]) {
        assert.equal((await crearWorker(nuncaEnviar).fetch(peticion(valido, { 'Idempotency-Key': id }), entorno())).status, 400);
    }
});
test('fallo de API, red y respuesta incompleta no simulan éxito ni filtran datos', async () => {
    for (const enviar of [async () => Response.json({ message: 'detalle-privado' }, { status: 401 }), async () => { throw new Error('detalle-privado'); }, async () => Response.json({}), async () => new Response('no-json')]) {
        const respuesta = await crearWorker(enviar).fetch(peticion(), entorno());
        assert.equal(respuesta.status, 502); assert.doesNotMatch(await respuesta.text(), /detalle-privado|secreto-solo-de-prueba/);
    }
});
test('no confirma antes de recibir la respuesta del proveedor', async () => {
    let resolver; const pendiente = new Promise(r => { resolver = r; }); let finalizado = false;
    const envio = crearWorker(() => pendiente).fetch(peticion(), entorno()).then(r => { finalizado = true; return r; });
    await new Promise(r => setTimeout(r, 10)); assert.equal(finalizado, false);
    resolver(Response.json({ id: 'id-simulado' })); assert.equal((await envio).status, 202);
});
test('reintentos concurrentes mantienen clave y plantilla idénticas para la idempotencia de Resend', async () => {
    const id = clave(), solicitudes = [];
    const worker = crearWorker(async (url, opciones) => { solicitudes.push(opciones); return Response.json({ id: 'mismo-id-simulado' }); });
    await Promise.all([worker.fetch(peticion(valido, { 'Idempotency-Key': id }), entorno()), worker.fetch(peticion(valido, { 'Idempotency-Key': id }), entorno())]);
    assert.equal(solicitudes.length, 2);
    assert.equal(solicitudes[0].body, solicitudes[1].body); assert.equal(solicitudes[0].headers['Idempotency-Key'], solicitudes[1].headers['Idempotency-Key']);
});
test('rutas estáticas pasan intactas a ASSETS; rutas API desconocidas responden JSON', async () => {
    let original; const env = entorno({ ASSETS: { fetch: request => { original = request; return new Response('archivo-estático', { status: 200 }); } } });
    const worker = crearWorker(nuncaEnviar);
    for (const ruta of ['/', '/login.html', '/signup.html', '/home_empresa_2.html', '/paginas/mis_asignaciones.html', '/scripts/autenticacion.js', '/estilos/index.css']) {
        const request = new Request('https://movanza.site' + ruta);
        const respuesta = await worker.fetch(request, env); assert.equal(await respuesta.text(), 'archivo-estático'); assert.equal(original, request);
    }
    const respuesta = await worker.fetch(new Request('https://movanza.site/api/inexistente'), env);
    assert.equal(respuesta.status, 404); assert.equal((await respuesta.json()).ok, false);
});

test('rechaza explícitamente 3xx sin seguir Location ni reenviar credenciales', async () => {
    for (const status of [300, 301, 302, 303, 304, 307, 308]) {
        const registros = []; let llamadas = 0;
        const worker = crearWorkerReal(async (url, opciones) => {
            llamadas++; assert.equal(url, 'https://api.resend.com/emails');
            assert.equal(opciones.redirect, 'manual');
            return new Response(null, { status, headers: { Location: 'https://example.invalid/privado' } });
        }, registro => registros.push(registro));
        const respuesta = await worker.fetch(peticion(), entorno());
        assert.equal(respuesta.status, 502); assert.equal(llamadas, 1);
        assert.ok(registros.some(r => r.categoria === 'redireccion_rechazada' && r.estadoProveedor === status));
        assert.ok(!JSON.stringify(registros).includes('example.invalid'));
    }
});

test('clasifica HTTP y registra solo códigos Resend permitidos', async () => {
    for (const [status, categoria] of [[400, 'validacion_proveedor'], [401, 'autenticacion_proveedor'], [403, 'permiso_o_dominio_proveedor'], [409, 'conflicto_idempotencia'], [422, 'validacion_proveedor'], [429, 'limite_proveedor'], [500, 'error_proveedor'], [503, 'error_proveedor']]) {
        const registros = [];
        const worker = crearWorkerReal(async () => Response.json({ name: 'validation_error', message: 'no registrar este mensaje' }, { status }), r => registros.push(r));
        assert.equal((await worker.fetch(peticion(), entorno())).status, 502);
        assert.ok(registros.some(r => r.categoria === categoria && r.estadoProveedor === status && r.codigoResend === 'validation_error'));
        assert.ok(!JSON.stringify(registros).includes('no registrar'));
    }
});

test('respuestas inválidas o excesivas no se confirman como enviadas', async () => {
    for (const crearRespuesta of [() => new Response('no-json'), () => Response.json(null), () => Response.json({ id: ' ' }), () => new Response('x'.repeat(32769))]) {
        const registros = [];
        const respuesta = await crearWorkerReal(async () => crearRespuesta(), r => registros.push(r)).fetch(peticion(), entorno());
        assert.equal(respuesta.status, 502);
        assert.ok(registros.some(r => r.categoria === 'respuesta_invalida'));
        assert.ok(!registros.some(r => r.etapa === 'resend_respuesta' && r.categoria === 'aceptado'));
    }
});

test('mantiene el estado HTTP del proveedor aunque su cuerpo no sea JSON', async () => {
    const registros = [];
    const respuesta = await crearWorkerReal(async () => new Response('privado', { status: 401 }), r => registros.push(r)).fetch(peticion(), entorno());
    assert.equal(respuesta.status, 502);
    assert.ok(registros.some(r => r.categoria === 'autenticacion_proveedor' && r.cuerpoProveedor === 'invalido' && r.codigoResend === 'no_clasificado'));
});

test('fallos de conexión y timeout tienen categorías distintas sin exponer la excepción', async () => {
    for (const [nombre, categoria] of [['TypeError', 'conexion_o_preparacion'], ['TimeoutError', 'tiempo_agotado'], ['AbortError', 'tiempo_agotado'], ['dato-privado', 'conexion_o_preparacion']]) {
        const registros = [];
        const worker = crearWorkerReal(async () => { const fallo = new Error('no registrar datos privados'); fallo.name = nombre; throw fallo; }, r => registros.push(r));
        assert.equal((await worker.fetch(peticion(), entorno())).status, 502);
        assert.ok(registros.some(r => r.categoria === categoria));
        assert.ok(!JSON.stringify(registros).includes('privado'));
    }
});

test('diagnósticos correlacionados sin datos personales, secretos ni cabeceras', async () => {
    const registros = [], datos = { ...valido, nombre: 'NOMBRE-PRIVADO', correo: 'privado@example.com', mensaje: 'MENSAJE-PRIVADO' };
    const request = peticion(datos, { Authorization: 'CABECERA-PRIVADA' });
    const worker = crearWorkerReal(async () => Response.json({ name: 'CODIGO-PRIVADO', message: 'RESPUESTA-PRIVADA' }, { status: 400 }), r => registros.push(r));
    const respuesta = await worker.fetch(request, entorno());
    const id = respuesta.headers.get('X-Contacto-Id');
    assert.match(id, /^[0-9a-f-]{36}$/);
    assert.ok(registros.length >= 3 && registros.every(r => r.solicitudId === id && Number.isInteger(r.duracionMs)));
    const serializados = JSON.stringify(registros) + await respuesta.text();
    for (const privado of [datos.nombre, datos.correo, datos.mensaje, 'CABECERA-PRIVADA', 'CODIGO-PRIVADO', 'RESPUESTA-PRIVADA', 'secreto-solo-de-prueba', request.headers.get('Idempotency-Key')]) assert.ok(!serializados.includes(privado));
});

test('un fallo del logger no impide el envío ni expone errores internos', async () => {
    const worker = crearWorkerReal(async () => Response.json({ id: 'id-simulado' }), () => { throw new Error('fallo de logger'); });
    assert.equal((await worker.fetch(peticion(), entorno())).status, 202);
});

test('normaliza espacios al usar el secreto sin modificar su valor almacenado', async () => {
    const env = entorno({ RESEND_API_KEY: ' \tsecreto-solo-de-prueba\n' });
    const original = env.RESEND_API_KEY;
    const worker = crearWorker(async (url, opciones) => {
        assert.equal(opciones.headers.Authorization, 'Bearer secreto-solo-de-prueba');
        return Response.json({ id: 'id-simulado' });
    });
    assert.equal((await worker.fetch(peticion(), env)).status, 202);
    assert.equal(env.RESEND_API_KEY, original);
});
