// PostgreSQL aislado con PGlite; no conecta ni escribe en Supabase.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

if (!process.argv[2]) {
    throw new Error('Uso: node pruebas/roles.mjs <directorio temporal con @electric-sql/pglite>');
}
const { PGlite } = await import(pathToFileURL(join(
    resolve(process.argv[2]), 'node_modules/@electric-sql/pglite/dist/index.js'
)));
const db = new PGlite();
const leer = ruta => readFile(new URL(ruta, import.meta.url), 'utf8');
let comprobaciones = 0;
const ids = {
    empresaA: '10000000-0000-4000-8000-000000000001',
    empresaB: '10000000-0000-4000-8000-000000000002',
    trabajadorA: '10000000-0000-4000-8000-000000000003',
    trabajadorB: '10000000-0000-4000-8000-000000000004',
    trabajadorC: '10000000-0000-4000-8000-000000000005',
    administrador: '10000000-0000-4000-8000-000000000006'
};
const filas = async (sql, parametros = []) => (await db.query(sql, parametros)).rows;
const valor = async (sql, parametros = []) => Object.values((await filas(sql, parametros))[0])[0];
const rpc = (nombre, parametros = []) => valor(
    `select public.${nombre}(${parametros.map((_, i) => '$' + (i + 1)).join(',')}) as resultado`,
    parametros
);
function igual(actual, esperado, mensaje) {
    assert.deepEqual(actual, esperado, mensaje);
    comprobaciones++;
}
async function denegado(accion, mensaje, codigo) {
    await assert.rejects(accion, error => codigo ? error.code === codigo :
        ['42501', 'P0001'].includes(error.code), mensaje);
    comprobaciones++;
}
async function como(usuario, accion) {
    await db.exec('SET ROLE authenticated');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [ids[usuario]]);
    try { return await accion(); }
    finally {
        await db.exec('RESET ROLE');
        await db.exec("select set_config('request.jwt.claim.sub', '', false)");
    }
}

try {
    await db.exec(await leer('./estructura_previa.sql'));
    const migracion = await leer('../supabase/migrations/20261017020446_separar_roles.sql');
    await db.exec(migracion);
    for (const [nombre, id] of Object.entries(ids)) {
        const rol = nombre.startsWith('empresa') ? 'empresa' : 'trabajador';
        await db.query('insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,$3)',
            [id, `${nombre}@example.test`, JSON.stringify({ rol })]);
    }
    await denegado(() => db.query(
        'insert into auth.users(id,raw_user_meta_data) values ($1,$2)',
        ['20000000-0000-4000-8000-000000000001', '{"rol":"administrador"}']
    ), 'Rechaza el alta pública como administrador', '42501');
    await denegado(() => db.query(
        'insert into auth.users(id,raw_user_meta_data) values ($1,$2)',
        ['20000000-0000-4000-8000-000000000002', '{"rol":"otro"}']
    ), 'Rechaza roles desconocidos', '42501');
    await db.query('select privado.habilitar_administrador($1)', [ids.administrador]);
    const perfiles = Object.fromEntries(await Promise.all(Object.entries(ids).map(async ([nombre, id]) =>
        [nombre, Number(await valor('select id from public.perfiles where usuario_auth_id=$1', [id]))]
    )));
    igual(await valor('select count(*)::int from public.perfiles'), 6, 'Cada alta crea un perfil');

    const empresaA = await como('empresaA', () => rpc('crear_empresa', ['Empresa Alfa']));
    const empresaA2 = await como('empresaA', () => rpc('crear_empresa', ['Empresa Alfa Dos']));
    const empresaB = await como('empresaB', () => rpc('crear_empresa', ['Empresa Beta']));
    await como('trabajadorA', async () => {
        igual(await valor('select rol from public.perfiles'), 'trabajador', 'Solo lee su perfil');
        await denegado(() => rpc('crear_empresa', ['No permitida']), 'Trabajador no crea empresas', '42501');
        await denegado(() => db.exec("update public.perfiles set rol='administrador'"), 'No puede editar su rol', '42501');
        await denegado(() => db.query('select privado.habilitar_administrador($1)', [ids.trabajadorA]),
            'No puede ejecutar el procedimiento administrativo', '42501');
        igual((await filas('select * from public.buscar_trabajador($1)', ['usuario_' + perfiles.trabajadorB])).length,
            0, 'Un trabajador no busca perfiles ajenos');
        await rpc('actualizar_mi_perfil', ['trabajador_alfa', 'Trabajador Alfa']);
        igual(await valor('select nombre_usuario from public.perfiles'), 'trabajador_alfa', 'Se conserva editar perfil');
        igual(await valor('select rol from public.perfiles'), 'trabajador', 'Editar perfil conserva el rol');
    });
    // Simula un cambio de metadatos hecho por Auth: no debe cambiar el rol de la base.
    await db.query('update auth.users set raw_user_meta_data=$1 where id=$2',
        ['{"rol":"administrador"}', ids.trabajadorA]);
    igual(await como('trabajadorA', () => valor('select privado.mi_rol()')), 'trabajador',
        'Cambiar metadatos de Auth no eleva privilegios');

    let invitacionA, invitacionA2, invitacionB, invitacionC;
    await como('empresaA', async () => {
        igual(await valor('select count(*)::int from public.empresas'), 2, 'La empresa ve solo sus empresas');
        igual((await filas('select * from public.buscar_trabajador($1)', ['trabajador_alfa'])).length, 1,
            'La empresa puede buscar trabajadores');
        igual((await filas('select * from public.buscar_trabajador($1)', ['usuario_' + perfiles.empresaB])).length,
            0, 'La búsqueda excluye cuentas Empresa');
        invitacionA = await rpc('enviar_invitacion', [empresaA, perfiles.trabajadorA]);
        invitacionA2 = await rpc('enviar_invitacion', [empresaA2, perfiles.trabajadorA]);
        invitacionC = await rpc('enviar_invitacion', [empresaA, perfiles.trabajadorC]);
        await denegado(() => rpc('enviar_invitacion', [empresaA, perfiles.empresaB]), 'No invita empresas como trabajadores');
        await denegado(() => rpc('enviar_invitacion', [empresaA, perfiles.administrador]), 'No invita administradores');
        await denegado(() => rpc('enviar_invitacion', [empresaB, perfiles.trabajadorA]), 'No administra empresas ajenas');
    });
    invitacionB = await como('empresaB', () => rpc('enviar_invitacion', [empresaB, perfiles.trabajadorB]));
    await como('trabajadorA', async () => {
        igual((await filas('select * from public.listar_invitaciones_visibles()')).length, 2, 'Solo lista sus invitaciones');
        await denegado(() => rpc('responder_invitacion', [invitacionC, true]), 'No responde invitaciones ajenas');
        await rpc('responder_invitacion', [invitacionA, true]);
        await rpc('responder_invitacion', [invitacionA2, true]);
        igual(await valor('select count(*)::int from public.membresias'), 2, 'Conserva pertenencia a varias empresas');
    });
    await como('trabajadorB', () => rpc('responder_invitacion', [invitacionB, true]));
    const trabajoA = await como('empresaA', () => rpc('crear_trabajo', [empresaA, 'Trabajo Alfa', 4, -74, 100]));
    const trabajoB = await como('empresaB', () => rpc('crear_trabajo', [empresaB, 'Trabajo Beta', 4, -74, 100]));
    const parametros = () => ['Tarea de prueba', 'Objetivo de prueba', '2026-10-17T12:00:00Z', 30];
    const asignacionA = await como('empresaA', () => rpc('crear_asignacion',
        [trabajoA, perfiles.trabajadorA, ...parametros()]));
    const asignacionB = await como('empresaB', () => rpc('crear_asignacion',
        [trabajoB, perfiles.trabajadorB, ...parametros()]));
    await como('empresaA', async () => {
        igual(await valor('select count(*)::int from public.asignaciones'), 1, 'Solo lee asignaciones propias');
        await denegado(() => rpc('crear_asignacion', [trabajoA, perfiles.trabajadorB, ...parametros()]),
            'No asigna a un trabajador de otro equipo');
        await denegado(() => rpc('crear_asignacion', [trabajoA, perfiles.empresaB, ...parametros()]),
            'No asigna tareas a cuentas Empresa');
        await rpc('cambiar_alias', [empresaA, perfiles.trabajadorA, 'Técnico']);
        igual(await valor('select alias_interno from public.membresias where empresa_id=$1', [empresaA]),
            'Técnico', 'Se conserva el alias del equipo');
        await rpc('enviar_mensaje', [asignacionA, 'Mensaje de la empresa']);
    });
    await como('trabajadorA', async () => {
        igual(await valor('select count(*)::int from public.asignaciones'), 1, 'Solo lee sus asignaciones');
        igual(await valor('select count(*)::int from public.trabajos'), 1, 'Solo lee trabajos asignados');
        igual(await valor('select count(*)::int from public.empresas'), 2, 'Lee las empresas a las que pertenece');
        igual(await valor('select count(*)::int from public.mensajes'), 1, 'Lee los mensajes de su asignación');
        await denegado(() => rpc('enviar_mensaje', [asignacionB, 'No permitido']), 'No escribe en conversaciones ajenas');
        await denegado(() => rpc('crear_trabajo', [empresaA, 'No permitido', 4, -74, 100]), 'Trabajador no crea trabajos');
        await denegado(() => rpc('cancelar_asignacion', [asignacionA]), 'Trabajador no ejecuta acciones de empresa');
        await rpc('responder_asignacion', [asignacionA, true, null]);
        await denegado(() => rpc('iniciar_asignacion', [asignacionA, 5, -74, 5]), 'Conserva el control del radio GPS');
        await rpc('iniciar_asignacion', [asignacionA, 4, -74, 5]);
    });
    await como('empresaA', async () => {
        await denegado(() => rpc('retirar_trabajador', [empresaA, perfiles.trabajadorA]),
            'No retira al trabajador con una asignación en curso');
    });
    await como('trabajadorA', async () => {
        await rpc('enviar_mensaje', [asignacionA, 'Mensaje del trabajador']);
        await rpc('finalizar_asignacion', [asignacionA, 4, -74, 5, true, null]);
        igual(await valor('select estado from public.asignaciones'), 'finalizada', 'Conserva el flujo completo de ejecución');
    });
    await como('empresaB', async () => {
        igual(await valor('select count(*)::int from public.mensajes'), 0, 'Aísla conversaciones entre empresas');
        await denegado(() => rpc('editar_trabajo', [trabajoA, 'Ajeno', 4, -74, 100]), 'No modifica trabajos ajenos');
    });
    await como('empresaA', async () => {
        igual(await valor('select count(*)::int from public.mensajes'), 2, 'Ambas partes conservan la conversación');
        await rpc('retirar_trabajador', [empresaA, perfiles.trabajadorA]);
        igual(await valor('select estado from public.membresias where empresa_id=$1', [empresaA]),
            'retirada', 'Se conserva el retiro sin borrar el historial');
    });
    await como('administrador', async () => {
        igual(await valor('select rol from public.perfiles'), 'administrador', 'El administrador lee su perfil');
        for (const tabla of ['empresas', 'membresias', 'invitaciones', 'trabajos', 'asignaciones', 'mensajes']) {
            igual(await valor(`select count(*)::int from public.${tabla}`), 0, `Administrador sin acceso operativo a ${tabla}`);
        }
        await denegado(() => rpc('crear_empresa', ['No permitida']), 'Administrador no crea empresas', '42501');
        await denegado(() => db.query('select privado.habilitar_administrador($1)', [ids.trabajadorC]),
            'Administrador no concede roles desde el cliente', '42501');
    });
    await db.exec('SET ROLE anon');
    try {
        await denegado(() => filas('select * from public.perfiles'), 'Sin sesión no lee perfiles', '42501');
        await denegado(() => rpc('crear_empresa', ['Anónima']), 'Sin sesión no ejecuta escrituras', '42501');
    } finally { await db.exec('RESET ROLE'); }
    await denegado(() => db.query('select privado.habilitar_administrador($1)', [ids.empresaA]),
        'El procedimiento evita promover una cuenta con empresas');

    // La migración también debe conservar bases que ya tengan actividad.
    for (const ambiguo of [false, true]) {
        const anterior = new PGlite();
        try {
            await anterior.exec(await leer('./estructura_previa.sql'));
            await anterior.query("insert into auth.users(id) values ($1),($2)", [ids.empresaA, ids.trabajadorA]);
            const previos = (await anterior.query('select id from public.perfiles order by id')).rows;
            await anterior.query('insert into public.empresas(propietario_id,nombre) values ($1,$2)',
                [previos[0].id, 'Empresa anterior']);
            await anterior.query('insert into public.membresias(empresa_id,trabajador_id) values (1,$1)',
                [previos[1].id]);
            if (ambiguo) {
                await anterior.query('insert into public.membresias(empresa_id,trabajador_id) values (1,$1)',
                    [previos[0].id]);
                await denegado(() => anterior.exec(migracion), 'Detiene la clasificación de una cuenta con ambos usos');
                await anterior.exec('ROLLBACK');
                igual((await anterior.query("select count(*)::int as total from information_schema.columns where table_schema='public' and table_name='perfiles' and column_name='rol'")).rows[0].total,
                    0, 'Una migración rechazada no deja cambios parciales');
            } else {
                await anterior.exec(migracion);
                igual((await anterior.query('select rol from public.perfiles order by id')).rows.map(p => p.rol),
                    ['empresa', 'trabajador'], 'Clasifica perfiles previos conservando sus relaciones');
                igual((await anterior.query('select count(*)::int as total from public.membresias')).rows[0].total,
                    1, 'Conserva las membresías existentes');
            }
            igual((await anterior.query('select count(*)::int as total from public.empresas')).rows[0].total,
                1, 'Conserva las empresas existentes');
        } finally { await anterior.close(); }
    }
    await db.exec(await leer('./roles_remotos.sql'));
    console.log(`Permisos y regresión SQL: ${comprobaciones} comprobaciones correctas y prueba transaccional de integración correcta.`);
} catch (error) {
    console.error('Error de validación:', error.message, error.code || '', error.where || '');
    process.exitCode = 1;
} finally {
    await db.close();
}
