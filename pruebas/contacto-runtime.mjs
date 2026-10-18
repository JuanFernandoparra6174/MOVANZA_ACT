import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { verificarContactoLocal } from './contacto-local.mjs';

// Se usa el runtime incluido en la versión fijada de Wrangler, sin instalar
// dependencias adicionales ni cargar .dev.vars, secretos o credenciales reales.
const require = createRequire(import.meta.url);
const herramientas = createRequire(require.resolve('wrangler'));
const { Miniflare, convertV4MiniflareOptions } = herramientas('miniflare');
const { build } = herramientas('esbuild');
const raiz = new URL('../', import.meta.url);

test('regresión de contacto en el runtime de Cloudflare con Resend interceptado', async t => {
    const config = JSON.parse(await readFile(new URL('wrangler.jsonc', raiz), 'utf8'));
    assert.equal(config.observability.enabled, true);
    assert.equal(config.observability.logs.invocation_logs, false);
    const bundle = await build({ absWorkingDir: fileURLToPath(raiz), entryPoints: [config.main], bundle: true, write: false, format: 'esm', platform: 'browser' });
    let modo = 'ok', contador = 0, correoEsperado;
    const peticiones = [], registros = [], temporizadores = new Set();
    const mf = new Miniflare(convertV4MiniflareOptions({
        name: config.name, modules: true, script: bundle.outputFiles[0].text,
        compatibilityDate: config.compatibility_date, cf: false, telemetry: { enabled: false },
        bindings: { RESEND_API_KEY: 'secreto-simulado-runtime' },
        ratelimits: Object.fromEntries(config.ratelimits.map(({ name, ...valor }) => [name, valor])),
        handleStructuredLogs: registro => {
            try { const dato = JSON.parse(registro.message); if (dato.evento === 'contacto') registros.push(dato); } catch {}
        },
        outboundService: async request => {
            // Este es el único destino de cualquier fetch saliente del Worker.
            // Incluso una regresión que siga Location queda interceptada aquí.
            peticiones.push(request.url);
            assert.equal(request.url, 'https://api.resend.com/emails');
            assert.equal(request.method, 'POST');
            assert.equal(request.headers.get('Authorization'), 'Bearer secreto-simulado-runtime');
            const cuerpo = await request.json();
            assert.equal(cuerpo.from, 'Movanza <formularios@notificaciones.movanza.site>');
            assert.deepEqual(cuerpo.to, ['contacto@movanza.site']);
            assert.equal(cuerpo.reply_to, correoEsperado);
            if (modo === 'rechazo') return Response.json({ name: 'validation_error', message: 'CONTENIDO-PRIVADO' }, { status: 401 });
            if (modo === 'redireccion') return new Response(null, { status: 302, headers: { Location: 'https://example.invalid/no-seguir' } });
            if (modo === 'no-json') return new Response('CONTENIDO-PRIVADO');
            if (modo === 'sin-id') return Response.json({});
            if (modo === 'excesivo') return new Response('x'.repeat(32769));
            if (modo === 'caida') return Response.json({ name: 'service_unavailable' }, { status: 503 });
            if (modo === 'lento') return new Promise(resolve => {
                const temporizador = setTimeout(() => { temporizadores.delete(temporizador); resolve(Response.json({ id: 'id-simulado' })); }, 10_500);
                temporizadores.add(temporizador);
            });
            return Response.json({ id: '11111111-1111-4111-8111-111111111111' });
        }
    }));
    t.after(async () => { for (const temporizador of temporizadores) clearTimeout(temporizador); await mf.dispose(); });

    for (const [caso, esperado, categoria] of [
        ['ok', 202, 'aceptado'], ['rechazo', 502, 'autenticacion_proveedor'],
        ['redireccion', 502, 'redireccion_rechazada'], ['no-json', 502, 'respuesta_invalida'],
        ['sin-id', 502, 'respuesta_invalida'], ['excesivo', 502, 'respuesta_invalida'],
        ['caida', 502, 'error_proveedor'], ['lento', 502, 'tiempo_agotado']
    ]) await t.test(caso, async () => {
        modo = caso; contador++; correoEsperado = `persona${contador}@example.com`;
        const antes = peticiones.length;
        const respuesta = await mf.dispatchFetch('https://movanza.site/api/contacto', {
            method: 'POST', headers: {
                Origin: 'https://movanza.site', 'Content-Type': 'application/json',
                'CF-Connecting-IP': `192.0.2.${contador}`,
                'Idempotency-Key': `contacto-${Date.now()}-${crypto.randomUUID()}`
            }, body: JSON.stringify({ nombre: 'NOMBRE-PRIVADO', correo: correoEsperado, mensaje: 'MENSAJE-PRIVADO' })
        });
        assert.equal(respuesta.status, esperado);
        assert.equal(peticiones.length - antes, 1, 'Una única llamada: el fetch es válido y no sigue redirecciones');
        assert.equal((await respuesta.json()).ok, esperado === 202);
        const id = respuesta.headers.get('X-Contacto-Id'); assert.ok(id);
        // La entrega de logs del subproceso puede terminar después de la respuesta.
        for (let i = 0; i < 50 && !registros.some(r => r.solicitudId === id && r.etapa === 'respuesta'); i++) await new Promise(r => setTimeout(r, 10));
        assert.ok(registros.some(r => r.solicitudId === id && r.etapa === (caso === 'lento' ? 'resend_envio' : 'resend_respuesta') && r.categoria === categoria));
        assert.ok(registros.some(r => r.solicitudId === id && r.estadoHttp === esperado));
    });
    const textoLogs = JSON.stringify(registros);
    for (const privado of ['NOMBRE-PRIVADO', 'MENSAJE-PRIVADO', 'CONTENIDO-PRIVADO', 'secreto-simulado-runtime', '@example.com', 'no-seguir']) assert.ok(!textoLogs.includes(privado));
});

test('runtime con todos los estáticos, rutas privadas excluidas y secreto ausente', async t => {
    const config = JSON.parse(await readFile(new URL('wrangler.jsonc', raiz), 'utf8'));
    const bundle = await build({ absWorkingDir: fileURLToPath(raiz), entryPoints: [config.main], bundle: true, write: false, format: 'esm', platform: 'browser' });
    const mf = new Miniflare(convertV4MiniflareOptions({
        name: config.name, modules: true, script: bundle.outputFiles[0].text,
        compatibilityDate: config.compatibility_date, cf: false, telemetry: { enabled: false },
        bindings: {},
        ratelimits: Object.fromEntries(config.ratelimits.map(({ name, ...valor }) => [name, valor])),
        // Wrangler establece este enlace al preparar el Worker con assets.
        // Al montar Miniflare directamente hay que declararlo en su router interno.
        assets: { ...config.assets, directory: fileURLToPath(raiz), routerConfig: { has_user_worker: true } },
        handleStructuredLogs: () => {},
        outboundService: () => { throw new Error('Las salidas externas están bloqueadas.'); }
    }));
    t.after(() => mf.dispose());
    // Evita reutilizar sockets del proxy local cuando workerd cancela un cuerpo
    // entrante tras rechazar la solicitud. No modifica las peticiones del frontend.
    const solicitar = (url, opciones = {}) => mf.dispatchFetch(String(url), {
        ...opciones, headers: { ...opciones.headers, Connection: 'close' }
    });
    assert.ok(await verificarContactoLocal('https://movanza.test', solicitar) > 0);
});
