
import { supabase } from '../configuracion/supabase.js';

const listaInvitaciones = document.getElementById(
    'lista-invitaciones'
);

const listaMembresias = document.getElementById(
    'lista-membresias'
);

const mensaje = document.getElementById('mensaje');

let perfilId = null;
let ocupado = false;

function informar(texto, tipo = '') {
    mensaje.textContent = texto;
    mensaje.className = tipo;
}

function crearTexto(etiqueta, texto) {
    const elemento = document.createElement(etiqueta);
    elemento.textContent = texto;
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

// IDENTIFICAR AL USUARIO
async function iniciarModulo() {
    try {
        const { data, error } = await supabase.auth.getUser();

        if (error) throw error;

        if (!data.user) {
            location.replace('../index.html');
            return;
        }

        const { data: perfil, error: errorPerfil } =
            await supabase
                .from('perfiles')
                .select('id')
                .eq('usuario_auth_id', data.user.id)
                .single();

        if (errorPerfil) throw errorPerfil;

        perfilId = perfil.id;

        await actualizarListas();

    } catch (error) {
        informar(error.message, 'error');
        console.error(error);
    }
}

async function actualizarListas() {
    await cargarInvitaciones();
    await cargarMembresias();
}

// INVITACIONES PERSONALES
async function cargarInvitaciones() {
    const { data, error } = await supabase.rpc(
        'listar_invitaciones_visibles'
    );

    if (error) throw error;

    const pendientes = (data || []).filter(
        invitacion =>
            invitacion.trabajador_id === perfilId &&
            invitacion.estado === 'pendiente'
    );

    listaInvitaciones.replaceChildren();

    if (pendientes.length === 0) {
        listaInvitaciones.appendChild(
            crearTexto('p', 'No tienes invitaciones pendientes.')
        );
        return;
    }

    pendientes.forEach(invitacion => {
        const tarjeta = document.createElement('div');
        tarjeta.className = 'elemento-empresa';

        tarjeta.appendChild(
            crearTexto('h3', invitacion.nombre_empresa)
        );

        tarjeta.appendChild(
            crearTexto(
                'p',
                'Recibida: ' +
                new Date(invitacion.creada_en)
                    .toLocaleDateString('es-CO')
            )
        );

        tarjeta.appendChild(
            crearTexto('p', 'Estado: Pendiente')
        );

        tarjeta.appendChild(crearBoton(
            'Aceptar invitación',
            () => responderInvitacion(invitacion.id, true)
        ));

        tarjeta.appendChild(crearBoton(
            'Rechazar invitación',
            () => responderInvitacion(invitacion.id, false),
            'boton-peligro'
        ));

        listaInvitaciones.appendChild(tarjeta);
    });
}

// ACEPTAR O RECHAZAR
async function responderInvitacion(idInvitacion, aceptar) {
    if (ocupado) return;

    if (!aceptar) {
        const confirmar = window.confirm(
            '¿Estás seguro de rechazar esta invitación?'
        );

        if (!confirmar) return;
    }

    ocupado = true;
    informar('Procesando respuesta...');

    try {
        const { error } = await supabase.rpc(
            'responder_invitacion',
            {
                invitacion_id: idInvitacion,
                aceptar: aceptar
            }
        );

        if (error) throw error;

        await actualizarListas();

        informar(
            aceptar
                ? 'Invitación aceptada. Ya perteneces al equipo.'
                : 'Invitación rechazada.',
            'exito'
        );

    } catch (error) {
        informar(error.message, 'error');
        console.error(error);
    } finally {
        ocupado = false;
    }
}

// EMPRESAS DONDE TRABAJO
async function cargarMembresias() {
    const { data, error } = await supabase
        .from('membresias')
        .select('empresa_id, alias_interno, fecha_ingreso')
        .eq('trabajador_id', perfilId)
        .eq('estado', 'activa');

    if (error) throw error;

    listaMembresias.replaceChildren();

    if (!data || data.length === 0) {
        listaMembresias.appendChild(
            crearTexto(
                'p',
                'Todavía no perteneces a ninguna empresa.'
            )
        );
        return;
    }

    const idsEmpresas = data.map(m => m.empresa_id);

    const { data: empresas, error: errorEmpresas } =
        await supabase
            .from('empresas')
            .select('id, nombre')
            .in('id', idsEmpresas);

    if (errorEmpresas) throw errorEmpresas;

    const mapaEmpresas = new Map(
        (empresas || []).map(e => [e.id, e])
    );

    data.forEach(membresia => {
        const empresa = mapaEmpresas.get(membresia.empresa_id);

        const tarjeta = document.createElement('div');
        tarjeta.className = 'elemento-empresa';

        tarjeta.appendChild(
            crearTexto(
                'h3',
                empresa?.nombre || 'Empresa #' + membresia.empresa_id
            )
        );

        tarjeta.appendChild(
            crearTexto('p', 'Estado: Miembro activo')
        );

        if (membresia.alias_interno) {
            tarjeta.appendChild(
                crearTexto(
                    'p',
                    'Mi alias: ' + membresia.alias_interno
                )
            );
        }

        tarjeta.appendChild(
            crearTexto(
                'p',
                'Ingreso: ' +
                new Date(membresia.fecha_ingreso)
                    .toLocaleDateString('es-CO')
            )
        );

        listaMembresias.appendChild(tarjeta);
    });
}

iniciarModulo();
