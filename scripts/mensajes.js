
import { supabase } from '../configuracion/supabase.js';

// =====================================================
// ELEMENTOS Y VARIABLES
// =====================================================

// Una sola implementación para la página existente y para paneles integrados.
export function crearMensajeria({ raiz = document, empresaId = null, perfilInicial = null,
    vista = null, contextoVigente = () => true } = {}) {
const $ = id => raiz.querySelector('#' + id);
const listeners = [];
function escuchar(elemento, evento, accion) {
    elemento.addEventListener(evento, accion);
    listeners.push(() => elemento.removeEventListener(evento, accion));
}
let destruido = false, versionHistorial = 0, cargandoHistorial = false;
let lecturaConversaciones = null, lecturaHistorial = null;
const borradores = new Map();
const vigente = () => !destruido && contextoVigente();

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
    if (!vigente()) return;
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

    actualizarControles();
}
function actualizarControles() {
    if (!vigente()) return;
    raiz.querySelectorAll(
        '#formulario-mensaje button, ' +
        '#boton-actualizar-mensajes, ' +
        '#boton-actualizar-conversaciones, ' +
        '#lista-conversaciones button'
    ).forEach(boton => {
        boton.disabled = ocupado;
    });
    $('boton-enviar-mensaje').disabled = ocupado || cargandoHistorial || asignacionSeleccionada === null;
    $('contenido-mensaje').readOnly = ocupado;
    vista?.carga({ ocupado, historial: cargandoHistorial });
}

// =====================================================
// CARGAR CONVERSACIONES VISIBLES
// =====================================================

function cargarConversaciones() {
    if (lecturaConversaciones) return lecturaConversaciones;
    lecturaConversaciones = leerConversaciones().finally(() => { lecturaConversaciones = null; });
    return lecturaConversaciones;
}
async function leerConversaciones() {

    // RLS determina qué asignaciones puede leer.
    // Un usuario puede ser propietario o trabajador.
    let consultaAsignaciones = supabase
        .from('asignaciones')
        .select(
            'id, trabajo_id, trabajador_id, ' +
            'titulo, estado, programada_para'
        );
    // Ámbito del panel trabajador; RLS sigue autorizando cada lectura.
    if (perfil.rol === 'trabajador') consultaAsignaciones = consultaAsignaciones.eq('trabajador_id', perfil.id);
    const { data, error } = await consultaAsignaciones
        .order('creado_en', { ascending: false })
        .limit(500);

    if (error) throw error;

    if (!vigente()) return;
    let nuevasAsignaciones = data || [];
    if (perfil.rol === 'trabajador') nuevasAsignaciones = nuevasAsignaciones.filter(a => a.trabajador_id === perfil.id);
    let nuevosTrabajos = [], nuevasEmpresas = [];

    if (nuevasAsignaciones.length > 0) {

        const idsTrabajos = [
            ...new Set(
                nuevasAsignaciones.map(a => a.trabajo_id)
            )
        ];

        const resultadoTrabajos = await supabase
            .from('trabajos')
            .select('id, empresa_id, nombre')
            .in('id', idsTrabajos);

        if (resultadoTrabajos.error) {
            throw resultadoTrabajos.error;
        }

        if (!vigente()) return;
        nuevosTrabajos = resultadoTrabajos.data || [];
    }

    if (nuevosTrabajos.length > 0) {

        const idsEmpresas = [
            ...new Set(
                nuevosTrabajos.map(t => t.empresa_id)
            )
        ];

        const resultadoEmpresas = await supabase
            .from('empresas')
            .select('id, nombre, propietario_id')
            .in('id', idsEmpresas);

        if (resultadoEmpresas.error) {
            throw resultadoEmpresas.error;
        }

        if (!vigente()) return;
        nuevasEmpresas = resultadoEmpresas.data || [];
    }

    // El panel empresarial usa solamente la empresa ya verificada por su anfitrión.
    // RLS y la RPC siguen siendo la autoridad sobre lectura y envío.
    if (empresaId !== null) {
        nuevasEmpresas = nuevasEmpresas.filter(e => String(e.id) === String(empresaId) && e.propietario_id === perfil.id);
        nuevosTrabajos = nuevosTrabajos.filter(t => nuevasEmpresas.some(e => e.id === t.empresa_id));
        nuevasAsignaciones = nuevasAsignaciones.filter(a => nuevosTrabajos.some(t => t.id === a.trabajo_id));
    }
    if (perfil.rol === 'trabajador') {
        // El trabajo debe ser legible; los datos de empresa son opcionales.
        nuevasAsignaciones = nuevasAsignaciones.filter(a => nuevosTrabajos.some(t => t.id === a.trabajo_id));
    }
    asignaciones = nuevasAsignaciones; trabajos = nuevosTrabajos; empresas = nuevasEmpresas;

    mostrarConversaciones();

    // Recuperar la conversación abierta
    if (asignacionSeleccionada !== null) {

        const sigueVisible = buscarAsignacion(
            asignacionSeleccionada
        );

        if (sigueVisible) {
            await abrirConversacion(asignacionSeleccionada, { restaurar: true });
        } else {
            cerrarConversacion();
        }
    }
}

// =====================================================
// LISTADO DE CONVERSACIONES
// =====================================================

function mostrarConversaciones() {
    if (!vigente()) return;

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

    if (vista) {
        vista.conversaciones({ asignaciones: visibles, trabajos, seleccionada: asignacionSeleccionada,
            abrir: abrirConversacion, estado: mostrarEstado, ocupado });
        return;
    }

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

async function abrirConversacion(id, { restaurar = false } = {}) {
    if (!vigente() || (ocupado && !restaurar)) return;
    const asignacion = buscarAsignacion(id);

    if (!asignacion) {
        informar('Asignación no disponible.', 'error');
        return;
    }

    guardarBorrador();
    const cambio = asignacionSeleccionada !== id;
    asignacionSeleccionada = id;
    $('contenido-mensaje').value = borradores.get(id) || '';
    if (cambio) historial.replaceChildren();

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
    vista?.seleccion({ asignacion, trabajo, empresa, restaurar });
    mostrarConversaciones();
    informar('');

    try {
        await cargarMensajes();

        if (!vista && vigente()) seccionConversacion.scrollIntoView({
            behavior: 'smooth'
        });

    } catch (error) {
        informar(
            'No se pudo abrir la conversación: ' +
            error.message,
            'error'
        );

        console.error(error);
        if (restaurar) throw error;
    }
}

function cerrarConversacion() {
    guardarBorrador(); versionHistorial++;
    asignacionSeleccionada = null;
    seccionConversacion.classList.add('oculto');
    historial.replaceChildren();
    formularioMensaje.reset();
    cargandoHistorial = false;
    lecturaHistorial = null;
    vista?.cerrarConversacion();
    actualizarControles();
}
function guardarBorrador() {
    if (asignacionSeleccionada !== null) borradores.set(asignacionSeleccionada, $('contenido-mensaje').value);
}

// =====================================================
// CONSULTAR HISTORIAL
// =====================================================

function cargarMensajes() {
    if (asignacionSeleccionada === null || !vigente()) return Promise.resolve();
    if (lecturaHistorial?.id === asignacionSeleccionada) return lecturaHistorial.promesa;
    const lectura = { id: asignacionSeleccionada };
    lectura.promesa = leerMensajes().finally(() => { if (lecturaHistorial === lectura) lecturaHistorial = null; });
    lecturaHistorial = lectura;
    return lectura.promesa;
}
async function leerMensajes() {

    if (asignacionSeleccionada === null) return;

    const idConsultado = asignacionSeleccionada;
    const version = ++versionHistorial;
    const cercaDelFinal = historial.scrollHeight - historial.scrollTop - historial.clientHeight < 80;
    const posicion = historial.scrollTop;
    const teniaMensajes = historial.querySelector('.burbuja-mensaje') !== null;
    cargandoHistorial = true; actualizarControles();
    historial.setAttribute('aria-busy', 'true');

    try {
    const { data, error } = await supabase
        .from('mensajes')
        .select(
            'id, asignacion_id, remitente_id, contenido, creado_en'
        )
        .eq('asignacion_id', idConsultado)
        .order('creado_en', { ascending: true })
        .order('id', { ascending: true })
        .limit(500);

    if (!vigente() || version !== versionHistorial) return;
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

    if (!teniaMensajes || cercaDelFinal) historial.scrollTop = historial.scrollHeight;
    else historial.scrollTop = posicion;
    } finally {
        if (vigente() && version === versionHistorial) {
            cargandoHistorial = false; historial.setAttribute('aria-busy', 'false'); actualizarControles();
        }
    }
}

// =====================================================
// ENVIAR MENSAJE
// =====================================================

escuchar(formularioMensaje,
    'submit',
    async evento => {

        evento.preventDefault();

        if (ocupado || cargandoHistorial || !vigente()) return;

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
        let envioConfirmado = false;

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
            if (!vigente()) return;
            envioConfirmado = true;

            borradores.delete(idAsignacion);
            formularioMensaje.reset();

            await cargarMensajes();

            informar(
                'Mensaje enviado correctamente.',
                'exito'
            );

        } catch (error) {
            informar(
                envioConfirmado
                    ? 'Mensaje enviado. No se pudo actualizar el historial: ' + error.message
                    : 'No se pudo enviar: ' + error.message,
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

escuchar($('filtro-conversaciones'),
    'input',
    mostrarConversaciones
);

escuchar($('boton-actualizar-conversaciones'),
    'click',
    async () => {
        if (ocupado || !vigente()) return;

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

escuchar($('boton-actualizar-mensajes'),
    'click',
    async () => {
        if (ocupado || !vigente()) return;

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
    bloquearControles(true);

    try {
        if (perfilInicial) {
            perfil = perfilInicial;
        } else {
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
        }
        if (!vigente()) return;

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
    } finally {
        bloquearControles(false);
    }
}

return { iniciar: iniciarModulo, abrir: abrirConversacion, cerrar: cerrarConversacion,
    ocupado: () => ocupado, destruir() { destruido = true; versionHistorial++; borradores.clear(); listeners.forEach(quitar => quitar()); } };
}

if (document.body.dataset.modulo === 'mensajes') crearMensajeria().iniciar();
