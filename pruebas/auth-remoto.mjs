// Prueba optativa contra Auth y REST reales. Crea cuentas temporales sin enviar
// correos; el operador debe eliminarlas al terminar usando los UUID impresos.
// Nunca imprime ni guarda contraseñas o tokens. Requiere mailer_autoconfirm=true.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';

const configuracion = await readFile(new URL('../configuracion/supabase.js', import.meta.url), 'utf8');
const url = configuracion.match(/https:\/\/[a-z0-9]+\.supabase\.co/)[0];
const clave = configuracion.match(/sb_publishable_[A-Za-z0-9_-]+/)[0];
const ejecucion = randomUUID();
const cuentas = [];
console.log(JSON.stringify({ ejecucion, proyecto: url }));

async function peticion(ruta, { metodo = 'GET', cuerpo, token } = {}) {
    const respuesta = await fetch(url + ruta, {
        method: metodo,
        headers: {
            apikey: clave,
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
        signal: AbortSignal.timeout(20000)
    });
    const texto = await respuesta.text();
    return { estado: respuesta.status, datos: texto ? JSON.parse(texto) : null };
}

try {
    const opciones = await peticion('/auth/v1/settings');
    assert.equal(opciones.estado, 200);
    assert.equal(opciones.datos.mailer_autoconfirm, true,
        'Esta prueba no se ejecuta si el alta puede enviar correos');
    assert.equal(opciones.datos.disable_signup, false);
    assert.equal(opciones.datos.external.email, true);

    for (const rol of ['empresa', 'trabajador', 'administrador']) {
        const email = `movanza-prueba-${ejecucion}-${rol}@example.test`;
        const password = randomBytes(24).toString('base64url') + 'aA9!';
        const alta = await peticion('/auth/v1/signup', {
            metodo: 'POST', cuerpo: { email, password, data: { rol: rol === 'administrador' ? 'trabajador' : rol } }
        });
        if (alta.datos.user?.id) {
            cuentas.push({ rol, id: alta.datos.user.id, email, password });
            console.log(JSON.stringify({ cuenta_creada: { rol, id: alta.datos.user.id, email } }));
        }
        assert.equal(alta.estado, 200, `Falló el alta temporal: ${alta.datos.msg || alta.datos.message || alta.estado}`);
        assert.ok(alta.datos.access_token, 'El registro debe entregar una sesión');
        assert.ok(alta.datos.user.email_confirmed_at, 'La cuenta temporal debe quedar confirmada');
    }

    console.log('ESPERANDO_HABILITACION_ADMIN: promover solo la cuenta temporal administrador mediante SQL y enviar validar.');
    const entrada = createInterface({ input: process.stdin, terminal: false });
    for await (const linea of entrada) {
        if (linea.trim() === 'validar') break;
    }
    entrada.close();

    for (const cuenta of cuentas) {
        const sesion = await peticion('/auth/v1/token?grant_type=password', {
            metodo: 'POST', cuerpo: { email: cuenta.email, password: cuenta.password }
        });
        assert.equal(sesion.estado, 200, `No inició sesión ${cuenta.rol}`);
        const token = sesion.datos.access_token;
        assert.ok(token, 'No se recibió una sesión válida');
        const usuario = await peticion('/auth/v1/user', { token });
        assert.equal(usuario.estado, 200);
        assert.equal(usuario.datos.id, cuenta.id);
        const perfiles = await peticion('/rest/v1/perfiles?select=id,rol,usuario_auth_id', { token });
        assert.equal(perfiles.estado, 200);
        assert.equal(perfiles.datos.length, 1, 'Solo debe ver su perfil sin equipo');
        assert.equal(perfiles.datos[0].rol, cuenta.rol);
        assert.equal(perfiles.datos[0].usuario_auth_id, cuenta.id);
        const cambioRol = await peticion('/rest/v1/perfiles?id=eq.' + perfiles.datos[0].id, {
            metodo: 'PATCH', token, cuerpo: { rol: cuenta.rol === 'administrador' ? 'empresa' : 'administrador' }
        });
        assert.equal(cambioRol.estado, 403, 'La API no debe permitir cambiar el rol');
        const empresa = await peticion('/rest/v1/rpc/crear_empresa', {
            metodo: 'POST', token, cuerpo: { nombre: 'Prueba de permisos HTTP' }
        });
        if (cuenta.rol === 'empresa') {
            assert.equal(empresa.estado, 200, 'Empresa debe poder crear su empresa');
            // Se imprime el ID para limpiar solo el registro creado por esta prueba.
            console.log(JSON.stringify({ empresa_temporal: empresa.datos, propietario: cuenta.id }));
        } else {
            assert.equal(empresa.estado, 403, 'Los otros roles no pueden crear empresas mediante RPC');
        }
        const salida = await peticion('/auth/v1/logout', { metodo: 'POST', token });
        // Logout devuelve un cuerpo vacío en algunas versiones del servicio.
        assert.ok(salida.estado === 200 || salida.estado === 204);
        console.log(JSON.stringify({ autenticacion_correcta: cuenta.rol }));
    }
    console.log('AUTH_REST_CORRECTOS');
} catch (error) {
    console.error('Error de prueba Auth:', error.message);
    process.exitCode = 1;
} finally {
    console.log(JSON.stringify({ limpiar_cuentas: cuentas.map(({ rol, id, email }) => ({ rol, id, email })) }));
}
