
import { supabase } from '../configuracion/supabase.js';

// =====================================================
// ELEMENTOS Y VARIABLES
// =====================================================

const $ = id => document.getElementById(id);

const mensaje = $('mensaje');
const lista = $('lista-conversaciones');
const historial = $('historial-mensajes');

const seccionConversacion = $('seccion-conversacion');
const formularioMensaje = $('formulario-mensaje');

let perfil = null;
let asignaciones = [];
let trabajos = [];
let empresas = [];

let asignacionSeleccionada = null;
let ocupado = false;

// =====================================================
// FUNCIONES GENERALES
// =====================================================

function informar(texto, tipo = '') {
    mensaje.textContent = texto;
    mensaje.className = tipo;
}

function crearElemento(etiqueta, texto = '') {
    const elemento = document.createElement(etiqueta);
    elemento.textContent = texto;
    return elemento;
}

function crearBoton(texto, accion) {
    const boton = document.createElement('button');

    boton.type = 'button';
    boton.textContent = texto;

    boton.addEventListener('click', accion);

    return boton;
}

function formatearFecha(fecha) {
    if (!fecha) return 'Sin fecha';

    return new Date(fecha).toLocaleString('es-CO', {
        dateStyle: 'medium',
        timeStyle: 'short'
    });
}

function buscarTrabajo(id) {
    return trabajos.find(t => t.id === id);
}

function buscarEmpresa(id) {
    return empresas.find(e => e.id === id);
}

function buscarAsignacion(id) {
    return asignaciones.find(a => a.id === id);
}

function mostrarEstado(estado) {
    const estados = {
        pendiente: 'Pendiente',
        aceptada: 'Aceptada',
        en_curso: 'En curso',
        finalizada: 'Finalizada',
        rechazada: 'Rechazada',
        cancelada: 'Cancelada'
    };

    return estados[estado] || estado;
}

function bloquearControles(bloquear) {
    ocupado = bloquear;

    document.querySelectorAll(
        '#formulario-mensaje button, ' +
        '#boton-actualizar-mensajes, ' +
        '#boton-actualizar-conversaciones, ' +
        '#lista-conversaciones button'
    ).forEach(boton => {
        boton.disabled = bloquear;
    });
}

// =====================================================
// CARGAR CONVERSACIONES VISIBLES
// =====================================================

async function cargarConversaciones() {

    // RLS determina qué asignaciones puede leer.
    // Un usuario puede ser propietario o trabajador.
    const { data, error } = await supabase
        .from('asignaciones')
        .select(
            'id, trabajo_id, trabajador_id, ' +
            'titulo, estado, programada_para'
        )
        .order('creado_en', { ascending: false })
        .limit(500);

    if (error) throw error;

    asignaciones = data || [];
    trabajos = [];
    empresas = [];

    if (asignaciones.length > 0) {

        const idsTrabajos = [
            ...new Set(
                asignaciones.map(a => a.trabajo_id)
            )
        ];

        const resultadoTrabajos = await supabase
            .from('trabajos')
            .select('id, empresa_id, nombre')
            .in('id', idsTrabajos);

        if (resultadoTrabajos.error) {
            throw resultadoTrabajos.error;
        }

        trabajos = resultadoTrabajos.data || [];
    }

    if (trabajos.length > 0) {

        const idsEmpresas = [
            ...new Set(
                trabajos.map(t => t.empresa_id)
            )
        ];

        const resultadoEmpresas = await supabase
            .from('empresas')
            .select('id, nombre, propietario_id')
            .in('id', idsEmpresas);

        if (resultadoEmpresas.error) {
            throw resultadoEmpresas.error;
        }

        empresas = resultadoEmpresas.data || [];
    }

    mostrarConversaciones();

    // Recuperar la conversación abierta
    if (asignacionSeleccionada !== null) {

        const sigueVisible = buscarAsignacion(
            asignacionSeleccionada
        );

        if (sigueVisible) {
            await abrirConversacion(asignacionSeleccionada);
        } else {
            cerrarConversacion();
        }
    }
}

// =====================================================
// LISTADO DE CONVERSACIONES
// =====================================================

function mostrarConversaciones() {

    lista.replaceChildren();

    const busqueda = $('filtro-conversaciones')
        .value.trim().toLowerCase();

    const visibles = asignaciones.filter(asignacion => {

        const trabajo = buscarTrabajo(
            asignacion.trabajo_id
        );

        const empresa = trabajo
            ? buscarEmpresa(trabajo.empresa_id)
            : null;

        const texto = [
            asignacion.titulo,
            trabajo?.nombre || '',
            empresa?.nombre || '',
            String(asignacion.id)
        ].join(' ').toLowerCase();

        return texto.includes(busqueda);
    });

    if (visibles.length === 0) {
        lista.appendChild(
            crearElemento(
                'p',
                'No se encontraron conversaciones.'
            )
        );
        return;
    }

    visibles.forEach(asignacion => {

        const trabajo = buscarTrabajo(
            asignacion.trabajo_id
        );

        const empresa = trabajo
            ? buscarEmpresa(trabajo.empresa_id)
            : null;

        const tarjeta = crearElemento('div');
        tarjeta.className = 'elemento-empresa';

        const titulo = crearElemento(
            'h3',
            asignacion.titulo
        );

        tarjeta.appendChild(titulo);

        tarjeta.appendChild(
            crearElemento(
                'p',
                'Empresa: ' +
                (empresa?.nombre || 'No disponible')
            )
        );

        tarjeta.appendChild(
            crearElemento(
                'p',
                'Trabajo: ' +
                (trabajo?.nombre || 'No disponible')
            )
        );

        tarjeta.appendChild(
            crearElemento(
                'p',
                'Estado: ' + mostrarEstado(asignacion.estado)
            )
        );

        tarjeta.appendChild(
            crearElemento(
                'p',
                'Asignación ID: ' + asignacion.id
            )
        );

        const boton = crearBoton(
            'Abrir conversación',
            () => abrirConversacion(asignacion.id)
        );

        if (ocupado) boton.disabled = true;

        tarjeta.appendChild(boton);
        lista.appendChild(tarjeta);
    });
}

// =====================================================
// ABRIR UNA CONVERSACIÓN
// =====================================================

async function abrirConversacion(id) {
    const asignacion = buscarAsignacion(id);

    if (!asignacion) {
        informar('Asignación no disponible.', 'error');
        return;
    }

    asignacionSeleccionada = id;

    const trabajo = buscarTrabajo(
        asignacion.trabajo_id
    );

    const empresa = trabajo
        ? buscarEmpresa(trabajo.empresa_id)
        : null;

    $('titulo-conversacion').textContent =
        asignacion.titulo;

    $('empresa-conversacion').textContent =
        empresa?.nombre || 'No disponible';

    $('trabajo-conversacion').textContent =
        trabajo?.nombre || 'No disponible';

    $('estado-conversacion').textContent =
        mostrarEstado(asignacion.estado);

    $('id-conversacion').textContent = id;

    seccionConversacion.classList.remove('oculto');

    try {
        await cargarMensajes();

        seccionConversacion.scrollIntoView({
            behavior: 'smooth'
        });

    } catch (error) {
        informar(
            'No se pudo abrir la conversación: ' +
            error.message,
            'error'
        );

        console.error(error);
    }
}

function cerrarConversacion() {
    asignacionSeleccionada = null;
    seccionConversacion.classList.add('oculto');
    historial.replaceChildren();
    formularioMensaje.reset();
}

// =====================================================
// CONSULTAR HISTORIAL
// =====================================================

async function cargarMensajes() {

    if (asignacionSeleccionada === null) return;

    const idConsultado = asignacionSeleccionada;

    const { data, error } = await supabase
        .from('mensajes')
        .select(
            'id, asignacion_id, remitente_id, contenido, creado_en'
        )
        .eq('asignacion_id', idConsultado)
        .order('creado_en', { ascending: true })
        .order('id', { ascending: true })
        .limit(500);

    if (error) throw error;

    // Evitar mostrar el historial de otra conversación
    // si el usuario cambió de selección.
    if (asignacionSeleccionada !== idConsultado) {
        return;
    }

    historial.replaceChildren();

    if (!data || data.length === 0) {
        historial.appendChild(
            crearElemento(
                'p',
                'Todavía no hay mensajes en esta conversación.'
            )
        );

        return;
    }

    const asignacion = buscarAsignacion(idConsultado);

    data.forEach(m => {
        const esMio = m.remitente_id === perfil.id;

        const esTrabajador =
            m.remitente_id === asignacion.trabajador_id;

        const tarjeta = crearElemento('div');

        tarjeta.className = esMio
            ? 'burbuja-mensaje mensaje-propio'
            : 'burbuja-mensaje mensaje-recibido';

        const remitente = crearElemento(
            'strong',
            esMio
                ? 'Tú'
                : (esTrabajador ? 'Trabajador' : 'Empresa')
        );

        const contenido = crearElemento(
            'p',
            m.contenido
        );

        const fecha = crearElemento(
            'small',
            formatearFecha(m.creado_en)
        );

        tarjeta.append(
            remitente,
            contenido,
            fecha
        );

        historial.appendChild(tarjeta);
    });

    historial.scrollTop = historial.scrollHeight;
}

// =====================================================
// ENVIAR MENSAJE
// =====================================================

formularioMensaje.addEventListener(
    'submit',
    async evento => {

        evento.preventDefault();

        if (ocupado) return;

        if (asignacionSeleccionada === null) {
            informar(
                'Primero selecciona una conversación.',
                'error'
            );
            return;
        }

        const contenido = $('contenido-mensaje')
            .value.trim();

        if (!contenido) {
            informar(
                'El mensaje no puede estar vacío.',
                'error'
            );
            return;
        }

        if (contenido.length > 4000) {
            informar(
                'El mensaje supera 4000 caracteres.',
                'error'
            );
            return;
        }

        const idAsignacion = asignacionSeleccionada;

        bloquearControles(true);
        informar('Enviando mensaje...');

        try {
            // Solo la función SQL puede insertar mensajes.
            // Supabase comprueba quién tiene acceso.
            const { error } = await supabase.rpc(
                'enviar_mensaje',
                {
                    asignacion_id: idAsignacion,
                    contenido: contenido
                }
            );

            if (error) throw error;

            formularioMensaje.reset();

            await cargarMensajes();

            informar(
                'Mensaje enviado correctamente.',
                'exito'
            );

        } catch (error) {
            informar(
                'No se pudo enviar: ' + error.message,
                'error'
            );

            console.error(error);

        } finally {
            bloquearControles(false);
        }
    }
);

// =====================================================
// ACTUALIZACIONES MANUALES
// =====================================================

$('filtro-conversaciones').addEventListener(
    'input',
    mostrarConversaciones
);

$('boton-actualizar-conversaciones').addEventListener(
    'click',
    async () => {
        if (ocupado) return;

        bloquearControles(true);

        try {
            await cargarConversaciones();

            informar(
                'Conversaciones actualizadas.',
                'exito'
            );

        } catch (error) {
            informar(error.message, 'error');
            console.error(error);

        } finally {
            bloquearControles(false);
        }
    }
);

$('boton-actualizar-mensajes').addEventListener(
    'click',
    async () => {
        if (ocupado) return;

        bloquearControles(true);

        try {
            await cargarMensajes();

            informar('Mensajes actualizados.', 'exito');

        } catch (error) {
            informar(error.message, 'error');
            console.error(error);

        } finally {
            bloquearControles(false);
        }
    }
);

// =====================================================
// INICIALIZACIÓN
// =====================================================

async function iniciarModulo() {

    informar('Cargando conversaciones...');

    try {
        const {
            data: datosUsuario,
            error: errorUsuario
        } = await supabase.auth.getUser();

        if (errorUsuario) throw errorUsuario;

        if (!datosUsuario.user) {
            location.replace('../index.html');
            return;
        }

        const {
            data: datosPerfil,
            error: errorPerfil
        } = await supabase
            .from('perfiles')
            .select('id, nombre_usuario')
            .eq('usuario_auth_id', datosUsuario.user.id)
            .single();

        if (errorPerfil) throw errorPerfil;

        perfil = datosPerfil;

        $('usuario-actual').textContent =
            '@' + perfil.nombre_usuario;

        await cargarConversaciones();

        informar('');

    } catch (error) {
        informar(
            'No se pudieron cargar las conversaciones: ' +
            error.message,
            'error'
        );

        console.error(error);
    }
}

iniciarModulo();
