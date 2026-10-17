
import { supabase } from '../configuracion/supabase.js';

const tituloEmpresa = document.getElementById('titulo-empresa');
const formularioBusqueda = document.getElementById('formulario-busqueda');
const nombreBuscado = document.getElementById('nombre-buscado');
const resultadoBusqueda = document.getElementById('resultado-busqueda');
const listaPendientes = document.getElementById('lista-pendientes');
const listaIntegrantes = document.getElementById('lista-integrantes');
const mensaje = document.getElementById('mensaje');

let empresa = null;
let perfil = null;
let ocupado = false;

function informar(texto, tipo = '') {
    mensaje.textContent = texto;
    mensaje.className = tipo;
}

function textoElemento(etiqueta, contenido) {
    const elemento = document.createElement(etiqueta);
    elemento.textContent = contenido;
    return elemento;
}

function crearBoton(texto, accion, clase = '') {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.textContent = texto;
    if (clase) boton.className = clase;
    boton.addEventListener('click', accion);
    return boton;
}

async function ejecutar(accion, confirmacion) {
    if (ocupado) return;
    ocupado = true;

    try {
        informar('Procesando solicitud...');
        await accion();

        await cargarPendientes();
        await cargarIntegrantes();

        informar(confirmacion, 'exito');
    } catch (error) {
        informar(error.message, 'error');
        console.error(error);
    } finally {
        ocupado = false;
    }
}

// COMPROBAR PROPIETARIO Y EMPRESA
async function iniciarModulo() {
    try {
        const { data: datosUsuario, error: errorUsuario } =
            await supabase.auth.getUser();

        if (errorUsuario) throw errorUsuario;

        if (!datosUsuario.user) {
            location.replace('../index.html');
            return;
        }

        const { data: datosPerfil, error: errorPerfil } =
            await supabase
                .from('perfiles')
                .select('id')
                .eq('usuario_auth_id', datosUsuario.user.id)
                .single();

        if (errorPerfil) throw errorPerfil;
        perfil = datosPerfil;

        const idGuardado = sessionStorage.getItem(
            'movanza_empresa_activa'
        );

        if (!idGuardado || !/^\d+$/.test(idGuardado)) {
            throw new Error(
                'Primero selecciona una empresa en Mis empresas.'
            );
        }

        const { data, error } = await supabase
            .from('empresas')
            .select('id, nombre, propietario_id')
            .eq('id', idGuardado)
            .eq('propietario_id', perfil.id)
            .single();

        if (error || !data) {
            throw new Error(
                'No puedes administrar esta empresa.'
            );
        }

        empresa = data;
        tituloEmpresa.textContent = empresa.nombre;

        await cargarPendientes();
        await cargarIntegrantes();

    } catch (error) {
        informar(error.message, 'error');
        formularioBusqueda.querySelector('button').disabled = true;
        console.error(error);
    }
}

// BUSCAR USUARIO
formularioBusqueda.addEventListener('submit', async (evento) => {
    evento.preventDefault();

    if (!empresa || ocupado) return;

    const nombre = nombreBuscado.value.trim().toLowerCase();

    resultadoBusqueda.replaceChildren();
    informar('Buscando usuario...');

    try {
        const { data, error } = await supabase.rpc(
            'buscar_trabajador',
            { p_nombre_usuario: nombre }
        );

        if (error) throw error;

        const trabajador = data?.[0];

        if (!trabajador) {
            informar('No se encontró ese usuario.', 'error');
            return;
        }

        if (trabajador.id === perfil.id) {
            informar(
                'No necesitas invitarte a tu propia empresa.',
                'error'
            );
            return;
        }

        const tarjeta = document.createElement('div');
        tarjeta.className = 'elemento-empresa';

        tarjeta.appendChild(
            textoElemento('h3', '@' + trabajador.nombre_usuario)
        );

        tarjeta.appendChild(
            textoElemento('p', 'ID: ' + trabajador.id)
        );

        tarjeta.appendChild(crearBoton(
            'Enviar invitación',
            () => enviarInvitacion(trabajador.id)
        ));

        resultadoBusqueda.appendChild(tarjeta);
        informar('Usuario encontrado.', 'exito');

    } catch (error) {
        informar(error.message, 'error');
        console.error(error);
    }
});

// INVITAR TRABAJADOR
async function enviarInvitacion(trabajadorId) {
    await ejecutar(async () => {
        const { error } = await supabase.rpc(
            'enviar_invitacion',
            {
                empresa_id: empresa.id,
                trabajador_id: trabajadorId
            }
        );

        if (error) {
            if (error.code === '23505') {
                throw new Error(
                    'Ya existe una invitación pendiente para este usuario.'
                );
            }
            throw error;
        }

        resultadoBusqueda.replaceChildren();
        formularioBusqueda.reset();

    }, 'Invitación enviada correctamente.');
}

// LISTAR INVITACIONES PENDIENTES
async function cargarPendientes() {
    const { data, error } = await supabase.rpc(
        'listar_invitaciones_visibles'
    );

    if (error) throw error;

    const pendientes = (data || []).filter(
        invitacion =>
            invitacion.empresa_id === empresa.id &&
            invitacion.estado === 'pendiente'
    );

    listaPendientes.replaceChildren();

    if (pendientes.length === 0) {
        listaPendientes.appendChild(
            textoElemento('p', 'No hay invitaciones pendientes.')
        );
        return;
    }

    pendientes.forEach(invitacion => {
        const tarjeta = document.createElement('div');
        tarjeta.className = 'elemento-empresa';

        tarjeta.appendChild(
            textoElemento('h3', '@' + invitacion.nombre_usuario)
        );

        tarjeta.appendChild(
            textoElemento('p', 'Estado: Pendiente')
        );

        tarjeta.appendChild(
            textoElemento(
                'p',
                'Enviada: ' +
                new Date(invitacion.creada_en)
                    .toLocaleDateString('es-CO')
            )
        );

        listaPendientes.appendChild(tarjeta);
    });
}

// LISTAR MIEMBROS ACTIVOS
async function cargarIntegrantes() {
    const { data, error } = await supabase
        .from('membresias')
        .select('id, trabajador_id, alias_interno, estado, fecha_ingreso')
        .eq('empresa_id', empresa.id)
        .eq('estado', 'activa')
        .order('fecha_ingreso', { ascending: false });

    if (error) throw error;

    listaIntegrantes.replaceChildren();

    if (!data || data.length === 0) {
        listaIntegrantes.appendChild(
            textoElemento('p', 'La empresa todavía no tiene integrantes.')
        );
        return;
    }

    const ids = data.map(m => m.trabajador_id);

    const { data: perfiles, error: errorPerfiles } =
        await supabase
            .from('perfiles')
            .select('id, nombre_usuario, nombre_completo')
            .in('id', ids);

    if (errorPerfiles) throw errorPerfiles;

    const mapaPerfiles = new Map(
        (perfiles || []).map(p => [p.id, p])
    );

    data.forEach(membresia => {
        const trabajador = mapaPerfiles.get(
            membresia.trabajador_id
        );

        const tarjeta = document.createElement('div');
        tarjeta.className = 'elemento-empresa';

        tarjeta.appendChild(
            textoElemento(
                'h3',
                trabajador?.nombre_completo ||
                trabajador?.nombre_usuario ||
                'Trabajador'
            )
        );

        tarjeta.appendChild(
            textoElemento(
                'p',
                'Usuario: @' +
                (trabajador?.nombre_usuario || 'desconocido')
            )
        );

        tarjeta.appendChild(
            textoElemento(
                'p',
                'ID: ' + membresia.trabajador_id
            )
        );

        const etiqueta = document.createElement('label');
        etiqueta.textContent = 'Alias interno';

        const entrada = document.createElement('input');
        entrada.type = 'text';
        entrada.maxLength = 100;
        entrada.value = membresia.alias_interno || '';
        entrada.placeholder = 'Ej: Técnico de mantenimiento';

        etiqueta.appendChild(entrada);
        tarjeta.appendChild(etiqueta);

        tarjeta.appendChild(crearBoton(
            'Guardar alias',
            () => guardarAlias(
                membresia.trabajador_id,
                entrada.value
            )
        ));

        tarjeta.appendChild(crearBoton(
            'Retirar integrante',
            () => retirarIntegrante(membresia.trabajador_id),
            'boton-peligro'
        ));

        listaIntegrantes.appendChild(tarjeta);
    });
}

// CAMBIAR ALIAS
async function guardarAlias(trabajadorId, alias) {
    if (alias.trim().length > 100) {
        informar('El alias no puede superar 100 caracteres.', 'error');
        return;
    }

    await ejecutar(async () => {
        const { error } = await supabase.rpc(
            'cambiar_alias',
            {
                empresa_id: empresa.id,
                trabajador_id: trabajadorId,
                alias_interno: alias.trim()
            }
        );

        if (error) throw error;

    }, 'Alias actualizado correctamente.');
}

// RETIRAR TRABAJADOR
async function retirarIntegrante(trabajadorId) {
    const confirmar = window.confirm(
        '¿Deseas retirar a este trabajador? ' +
        'Perderá su membresía activa, pero se conservará el historial.'
    );

    if (!confirmar) return;

    await ejecutar(async () => {
        const { error } = await supabase.rpc(
            'retirar_trabajador',
            {
                empresa_id: empresa.id,
                trabajador_id: trabajadorId
            }
        );

        if (error) throw error;

    }, 'Trabajador retirado del equipo.');
}

iniciarModulo();
