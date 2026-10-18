// Requiere npm run dev en otra terminal, sin RESEND_API_KEY.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// El transporte se puede inyectar para ejecutar las mismas verificaciones con
// dispatchFetch de Miniflare, sin sockets HTTP ni secretos del entorno local.
export async function verificarContactoLocal(base = 'http://127.0.0.1:8787', solicitar = fetch) {
    const rutas = ['index.html', 'login.html', 'signup.html', 'home_empresa_1.html', 'home_empresa_2.html', 'home_trabajador.html'];
    const codificar = ruta => ruta.split('/').map(encodeURIComponent).join('/');
    async function agregarPublicos(carpeta) {
        for (const entrada of await readdir(new URL('../' + codificar(carpeta) + '/', import.meta.url), { withFileTypes: true })) {
            if (entrada.name.startsWith('.') || entrada.name === 'node_modules') continue;
            const ruta = carpeta + '/' + entrada.name;
            if (entrada.isDirectory()) await agregarPublicos(ruta);
            else if (entrada.isFile() && !/\.(sql|map)$/.test(ruta) && !/^scripts\/[^/]+\.mjs$/.test(ruta)) rutas.push(ruta);
        }
    }
    for (const carpeta of ['Carpeta_Imagenes', 'componentes', 'configuracion', 'estilos', 'informacion', 'paginas', 'politicas', 'recursos', 'scripts']) await agregarPublicos(carpeta);
    let comprobaciones = 0;
    for (const ruta of rutas) {
        const respuesta = await solicitar(new URL(codificar(ruta), base));
        assert.equal(respuesta.status, 200, ruta);
        assert.deepEqual(Buffer.from(await respuesta.arrayBuffer()), await readFile(new URL('../' + codificar(ruta), import.meta.url)), ruta + ' conserva su contenido');
        comprobaciones++;
    }
    for (const ruta of ['worker/index.mjs', 'wrangler.jsonc', 'package.json', 'package-lock.json', '.dev.vars', '.git/config', 'supabase/roles.sql', 'pruebas/contacto-worker.mjs', 'scripts/generar-home-trabajador.mjs', 'node_modules/jsdom/package.json']) {
        assert.equal((await solicitar(new URL(ruta, base))).status, 404, 'No publicar ' + ruta); comprobaciones++;
    }
    const respuesta = await solicitar(new URL('/api/contacto', base), {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: new URL(base).origin, 'Idempotency-Key': `contacto-${Date.now()}-${crypto.randomUUID()}` },
        body: JSON.stringify({ nombre: 'Prueba local', correo: 'local@example.com', mensaje: 'Sin envío real' })
    });
    assert.equal(respuesta.status, 503, 'Sin secreto debe fallar sin llamar a Resend');
    assert.equal((await respuesta.json()).ok, false); comprobaciones++;
    assert.equal((await solicitar(new URL('/api/contacto', base))).status, 405); comprobaciones++;
    console.log(`Wrangler local: ${comprobaciones} comprobaciones correctas. Sin correos reales.`);
    return comprobaciones;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await verificarContactoLocal(process.argv[2]);
