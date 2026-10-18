import { confirmarAccion } from './alertas.js';

import { supabase } from '../configuracion/supabase.js';
import { vistaAsignaciones } from './asignaciones-vista.js';

// =====================================================
// ELEMENTOS Y VARIABLES
// =====================================================

const $ = id => document.getElementById(id);

const lista = $('lista-asignaciones');
const mensaje = $('mensaje');
const filtroEstado = $('filtro-estado');
const estadoGps = $('estado-gps');

let perfil = null;
let asignaciones = [];
let trabajos = [];
let empresas = [];

let asignacionParaRechazar = null;
let asignacionParaFinalizar = null;

let ocupado = false;
let contextoVigente = () => true;
const vigente = () => contextoVigente() && vistaAsignaciones.vigente();

// =====================================================
// FUNCIONES GENERALES
// =====================================================

function informar(texto, tipo = '') {
    if (!vigente()) return;
    if (tipo === 'error' && /Fuera del radio autorizado/i.test(texto)) texto = 'No puedes realizar esta acción porque te encuentras fuera del área autorizada. Acércate al trabajo e inténtalo de nuevo.';
    mensaje.textContent = texto;
    mensaje.className = tipo;
    mensaje.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
}

function crearElemento(etiqueta, texto = '') {
    const elemento = document.createElement(etiqueta);
    elemento.textContent = texto;
    return elemento;
}

function crearBoton(texto, accion, clase = '') {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.textContent = texto;

    if (clase) {
        boton.className = clase;
    }

    boton.addEventListener('click', accion);
    return boton;
}

function fechaVisible(fecha) {
    if (!fecha) return 'No registrada';

    return new Date(fecha).toLocaleString('es-CO', {
        dateStyle: 'medium',
        timeStyle: 'medium'
    });
}

function nombreEstado(estado) {
    const nombres = {
        pendiente: 'Pendiente',
        aceptada: 'Aceptada',
        rechazada: 'Rechazada',
        en_curso: 'En curso',
        finalizada: 'Finalizada',
        cancelada: 'Cancelada'
    };

    return nombres[estado] || estado;
}

function obtenerTrabajo(id) {
    return trabajos.find(t => t.id === id);
}

function obtenerEmpresa(id) {
    return empresas.find(e => e.id === id);
}

function obtenerAsignacion(id) {
    return asignaciones.find(a => a.id === id);
}

// CALCULAR DURACIÓN A PARTIR DE FECHAS DEL SERVIDOR
function calcularDuracion(inicio, fin) {
    if (!inicio || !fin) {
        return 'No disponible';
    }

    const milisegundos =
        new Date(fin).getTime() -
        new Date(inicio).getTime();

    if (!Number.isFinite(milisegundos) || milisegundos < 0) {
        return 'No disponible';
    }

    const segundos = Math.floor(milisegundos / 1000);

    const horas = Math.floor(segundos / 3600);
    const minutos = Math.floor((segundos % 3600) / 60);
    const segundosRestantes = segundos % 60;

    return (
        `${horas} h ${minutos} min ${segundosRestantes} s`
    );
}

// EVITAR ACCIONES SIMULTÁNEAS
function bloquearAcciones(bloquear) {
    ocupado = bloquear;
    if (vigente()) vistaAsignaciones.ocupado(bloquear);

    document.querySelectorAll(
        '#lista-asignaciones button, ' +
        '#formulario-rechazo button, ' +
        '#formulario-finalizacion button, ' +
        '#boton-actualizar'
    ).forEach(boton => {
        boton.disabled = bloquear;
    });
}

async function ejecutarAccion(accion, mensajeExito) {
    if (ocupado || !vigente()) return;

    bloquearAcciones(true);

    try {
        await accion();
        if (!vigente()) return;

        // Leer los estados actualizados desde Supabase
        await cargarAsignaciones();

        informar(mensajeExito, 'exito');

    } catch (error) {
        informar(error.message, 'error');
        console.error(error);

        // Volver a consultar para no mostrar estados obsoletos
        try {
            await cargarAsignaciones();
        } catch (errorCarga) {
            console.error(errorCarga);
        }

    } finally {
        bloquearAcciones(false);
    }
}

// =====================================================
// UBICACIÓN GPS
// =====================================================

function errorUbicacion(error) {
    switch (error.code) {
        case 1:
            return new Error(
                'Permiso de ubicación denegado. ' +
                'Habilita Ubicación en los permisos de este sitio desde la barra de direcciones y vuelve a intentarlo.'
            );

        case 2:
            return new Error(
                'No se pudo determinar tu ubicación. ' +
                'Comprueba que el GPS esté disponible.'
            );

        case 3:
            return new Error(
                'La ubicación tardó demasiado en responder. ' +
                'Intenta nuevamente.'
            );

        default:
            return new Error(
                'Ocurrió un problema al consultar el GPS.'
            );
    }
}

function obtenerUbicacion() {
    return new Promise((resolver, rechazar) => {

        if (!window.isSecureContext) {
            rechazar(new Error(
                'La ubicación requiere HTTPS o localhost. ' +
                'Abre MOVANZA desde un contexto seguro.'
            ));
            return;
        }

        if (!navigator.geolocation) {
            rechazar(new Error(
                'Este navegador no tiene acceso a la geolocalización.'
            ));
            return;
        }

        estadoGps.textContent =
            'Solicitando ubicación actual y precisión...';

        navigator.geolocation.getCurrentPosition(
            posicion => {
                if (!vigente()) { rechazar(new Error('La sesión ya no está disponible.')); return; }
                const coordenadas = posicion.coords;

                const latitud = coordenadas.latitude;
                const longitud = coordenadas.longitude;
                const precision = coordenadas.accuracy;
                


                if (
                    !Number.isFinite(latitud) ||
                    !Number.isFinite(longitud) ||
                    !Number.isFinite(precision) ||
                    precision < 0
                ) {
                    rechazar(new Error(
                        'El navegador devolvió una ubicación inválida.'
                    ));
                    return;
                }

                estadoGps.textContent =
                    `Ubicación obtenida. ` +
                    `Precisión estimada: ${precision.toFixed(1)} metros.`;
                vistaAsignaciones.ubicacion({ latitud, longitud, precision_metros: precision });

                resolver({
                    latitud,
                    longitud,
                    precision_metros: precision
                });
            },

            error => {
                if (!vigente()) { rechazar(errorUbicacion(error)); return; }
                estadoGps.textContent =
                    'No se pudo obtener la ubicación.';

                rechazar(errorUbicacion(error));
            },

            {
                enableHighAccuracy: true,
                timeout: 20000,
                maximumAge: 0
            }
        );
    });
}

// =====================================================
// CARGAR DATOS DE SUPABASE
// =====================================================

async function cargarAsignaciones() {
    if (!vigente()) return;
    const { data, error } = await supabase
        .from('asignaciones')
        .select(
            'id, trabajo_id, trabajador_id, titulo, objetivo, ' +
            'programada_para, minutos_estimados, estado, ' +
            'motivo_rechazo, inicio_en, fin_en, ' +
            'objetivo_cumplido, nota_finalizacion'
        )
        .eq('trabajador_id', perfil.id)
        .order('programada_para', { ascending: false });

    if (error) throw error;
    if (!vigente()) return;

    asignaciones = (data || []).filter(a => a.trabajador_id === perfil.id);
    trabajos = [];
    empresas = [];

    if (asignaciones.length > 0) {
        const idsTrabajos = [
            ...new Set(asignaciones.map(a => a.trabajo_id))
        ];

        const resultado = await supabase
            .from('trabajos')
            .select(
                'id, empresa_id, nombre, latitud, ' +
                'longitud, radio_metros'
            )
            .in('id', idsTrabajos);

        if (resultado.error) throw resultado.error;
        if (!vigente()) return;

        trabajos = resultado.data || [];
    }

    if (trabajos.length > 0) {
        const idsEmpresas = [
            ...new Set(trabajos.map(t => t.empresa_id))
        ];

        const resultado = await supabase
            .from('empresas')
            .select('id, nombre')
            .in('id', idsEmpresas);

        if (resultado.error) throw resultado.error;
        if (!vigente()) return;

        empresas = resultado.data || [];
    }

    actualizarResumen();
    mostrarAsignaciones();
}

function actualizarResumen() {
    const contar = estado =>
        asignaciones.filter(a => a.estado === estado).length;

    $('total-pendientes').textContent = contar('pendiente');
    $('total-aceptadas').textContent = contar('aceptada');
    $('total-en-curso').textContent = contar('en_curso');
    $('total-finalizadas').textContent = contar('finalizada');
}

// =====================================================
// MOSTRAR ASIGNACIONES
// =====================================================

function mostrarAsignaciones() {
    if (!vigente()) return;
    lista.replaceChildren();
    vistaAsignaciones.iniciarListado();

    const filtro = filtroEstado.value;

    const busqueda = $('buscar-asignaciones').value.trim().toLocaleLowerCase('es');
    const visibles = asignaciones.filter(a => {
        const trabajo = obtenerTrabajo(a.trabajo_id);
        const empresa = trabajo && obtenerEmpresa(trabajo.empresa_id);
        return (filtro === 'todas' || a.estado === filtro) && [a.titulo, a.objetivo, trabajo?.nombre, empresa?.nombre].filter(Boolean).join(' ').toLocaleLowerCase('es').includes(busqueda);
    });

    if (visibles.length === 0) {
        lista.appendChild(
            crearElemento(
                'p',
                asignaciones.length ? 'No hay asignaciones que coincidan con estos filtros.' : 'Aún no tienes asignaciones. Cuando recibas una actividad, aparecerá aquí.'
            )
        );
        vistaAsignaciones.finalizarListado();
        return;
    }

    visibles.forEach(asignacion => {
        const trabajo = obtenerTrabajo(asignacion.trabajo_id);
        const empresa = trabajo
            ? obtenerEmpresa(trabajo.empresa_id)
            : null;

        const tarjeta = document.createElement('article');
        tarjeta.className = 'elemento-empresa';

        tarjeta.appendChild(
            crearElemento('h3', asignacion.titulo)
        );

        const estado = crearElemento(
            'span',
            nombreEstado(asignacion.estado)
        );

        estado.className =
            `etiqueta-estado estado-${asignacion.estado}`;

        tarjeta.appendChild(estado);

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
                'Objetivo: ' + asignacion.objetivo
            )
        );

        tarjeta.appendChild(
            crearElemento(
                'p',
                'Fecha programada: ' +
                fechaVisible(asignacion.programada_para)
            )
        );

        tarjeta.appendChild(
            crearElemento(
                'p',
                'Duración estimada: ' +
                asignacion.minutos_estimados + ' minutos'
            )
        );

        if (trabajo) {
            tarjeta.appendChild(
                crearElemento(
                    'p',
                    'Radio autorizado: ' +
                    trabajo.radio_metros + ' metros'
                )
            );
        }

        // HORAS Y DURACIÓN
        if (asignacion.inicio_en) {
            tarjeta.appendChild(
                crearElemento(
                    'p',
                    'Inicio real: ' +
                    fechaVisible(asignacion.inicio_en)
                )
            );
        }

        if (asignacion.fin_en) {
            tarjeta.appendChild(
                crearElemento(
                    'p',
                    'Finalización real: ' +
                    fechaVisible(asignacion.fin_en)
                )
            );
        }

        if (
            asignacion.inicio_en &&
            asignacion.fin_en
        ) {
            tarjeta.appendChild(
                crearElemento(
                    'p',
                    'Duración real: ' +
                    calcularDuracion(
                        asignacion.inicio_en,
                        asignacion.fin_en
                    )
                )
            );
        }

        // RESULTADO DE FINALIZACIÓN
        if (asignacion.estado === 'finalizada') {
            tarjeta.appendChild(
                crearElemento(
                    'p',
                    'Objetivo cumplido: ' +
                    (asignacion.objetivo_cumplido
                        ? 'Sí'
                        : 'No')
                )
            );

            if (asignacion.nota_finalizacion) {
                tarjeta.appendChild(
                    crearElemento(
                        'p',
                        'Observaciones: ' +
                        asignacion.nota_finalizacion
                    )
                );
            }
        }

        // MOTIVO DE RECHAZO
        if (
            asignacion.estado === 'rechazada' &&
            asignacion.motivo_rechazo
        ) {
            tarjeta.appendChild(
                crearElemento(
                    'p',
                    'Motivo del rechazo: ' +
                    asignacion.motivo_rechazo
                )
            );
        }

        const acciones = document.createElement('div');
        acciones.className = 'acciones-trabajo';

        // PENDIENTE: ACEPTAR O RECHAZAR
        if (asignacion.estado === 'pendiente') {
            acciones.appendChild(
                crearBoton(
                    'Aceptar asignación',
                    () => aceptarAsignacion(asignacion.id)
                )
            );

            acciones.appendChild(
                crearBoton(
                    'Rechazar asignación',
                    () => abrirRechazo(asignacion.id),
                    'boton-peligro'
                )
            );
        }

        // ACEPTADA: INICIAR CON GPS
        if (asignacion.estado === 'aceptada') {
            acciones.appendChild(
                crearBoton(
                    'Verificar GPS e iniciar',
                    () => iniciarAsignacion(asignacion.id)
                )
            );
        }

        // EN CURSO: FINALIZAR CON GPS
        if (asignacion.estado === 'en_curso') {
            acciones.appendChild(
                crearBoton(
                    'Finalizar tarea',
                    () => abrirFinalizacion(asignacion.id)
                )
            );
        }

        tarjeta.appendChild(acciones);
        vistaAsignaciones.registrar({ asignacion, trabajo, empresa, detalle: tarjeta, estado: nombreEstado(asignacion.estado), fecha: fechaVisible(asignacion.programada_para) });
    });
    vistaAsignaciones.finalizarListado();

    if (ocupado) {
        lista.querySelectorAll('button').forEach(boton => {
            boton.disabled = true;
        });
    }
}

// =====================================================
// ACEPTAR ASIGNACIÓN — RF-10
// =====================================================

async function aceptarAsignacion(id) {
    if (ocupado) return;

    const asignacion = obtenerAsignacion(id);

    if (!asignacion || asignacion.estado !== 'pendiente') {
        informar('La asignación no está pendiente.', 'error');
        return;
    }

    if (!await confirmarAccion({ titulo: 'Aceptar asignación', mensaje: `¿Aceptar la tarea "${asignacion.titulo}"?`, textoConfirmar: 'Aceptar asignación', destructiva: false })) return;

    await ejecutarAccion(async () => {
        const { error } = await supabase.rpc(
            'responder_asignacion',
            {
                asignacion_id: id,
                aceptar: true,
                motivo_rechazo: null
            }
        );

        if (error) throw error;

    }, 'Asignación aceptada correctamente.');
}

// =====================================================
// RECHAZAR ASIGNACIÓN — RF-10
// =====================================================

function abrirRechazo(id) {
    if (ocupado) return;

    const asignacion = obtenerAsignacion(id);

    if (!asignacion || asignacion.estado !== 'pendiente') {
        informar('La asignación no está pendiente.', 'error');
        return;
    }

    asignacionParaRechazar = id;

    $('titulo-rechazo').textContent = asignacion.titulo;
    $('motivo-rechazo').value = '';

    $('seccion-rechazo').classList.remove('oculto');

    vistaAsignaciones.formulario('rechazo');
}

function cerrarRechazo() {
    asignacionParaRechazar = null;
    $('formulario-rechazo').reset();
    $('seccion-rechazo').classList.add('oculto');
    vistaAsignaciones.cerrarFormulario();
}

$('boton-cancelar-rechazo').addEventListener(
    'click',
    async () => { if (await vistaAsignaciones.confirmarDescarte() && vigente()) cerrarRechazo(); }
);

$('formulario-rechazo').addEventListener(
    'submit',
    async evento => {
        evento.preventDefault();
        if (ocupado || !vigente()) return;

        const id = asignacionParaRechazar;
        const motivo = $('motivo-rechazo').value.trim();

        if (id === null || !motivo) {
            informar('Debes indicar un motivo.', 'error');
            return;
        }

        await ejecutarAccion(async () => {
            const { error } = await supabase.rpc(
                'responder_asignacion',
                {
                    asignacion_id: id,
                    aceptar: false,
                    motivo_rechazo: motivo
                }
            );

            if (error) throw error;

            cerrarRechazo();

        }, 'Asignación rechazada correctamente.');
    }
);

// =====================================================
// INICIAR CON GPS — RF-11
// =====================================================

async function iniciarAsignacion(id) {
    if (ocupado) return;

    const asignacion = obtenerAsignacion(id);

    if (!asignacion || asignacion.estado !== 'aceptada') {
        informar(
            'Solo puedes iniciar asignaciones aceptadas.',
            'error'
        );
        return;
    }

    const trabajo = obtenerTrabajo(asignacion.trabajo_id);

    if (!trabajo) {
        informar(
            'No se encontró la ubicación autorizada.',
            'error'
        );
        return;
    }

    if (!await confirmarAccion({ titulo: 'Iniciar asignación', mensaje: `¿Verificar tu ubicación para iniciar "${asignacion.titulo}"?`, textoConfirmar: 'Verificar GPS e iniciar', destructiva: false })) return;

    await ejecutarAccion(async () => {
        informar('Obteniendo ubicación para iniciar...');

        const gps = await obtenerUbicacion();
        if (!vigente()) return;

        informar('Validando ubicación en el servidor...');

        const { error } = await supabase.rpc(
            'iniciar_asignacion',
            {
                asignacion_id: id,
                latitud: gps.latitud,
                longitud: gps.longitud,
                precision_metros: gps.precision_metros
            }
        );

        if (error) throw error;

        estadoGps.textContent =
            'Inicio autorizado por el servidor.';

    }, 'Tarea iniciada correctamente. La hora quedó registrada en el servidor.');
}

// =====================================================
// ABRIR FORMULARIO DE FINALIZACIÓN — RF-12
// =====================================================

function abrirFinalizacion(id) {
    if (ocupado) return;

    const asignacion = obtenerAsignacion(id);

    if (!asignacion || asignacion.estado !== 'en_curso') {
        informar(
            'Solo puedes finalizar tareas en curso.',
            'error'
        );
        return;
    }

    asignacionParaFinalizar = id;

    $('titulo-finalizacion').textContent =
        asignacion.titulo;

    $('formulario-finalizacion').reset();

    seccionFinalizacionVisible(true);
}

function seccionFinalizacionVisible(visible) {
    $('seccion-finalizacion').classList.toggle(
        'oculto',
        !visible
    );

    if (visible) {
        vistaAsignaciones.formulario('finalizacion');
    } else vistaAsignaciones.cerrarFormulario();
}

function cerrarFinalizacion() {
    asignacionParaFinalizar = null;
    $('formulario-finalizacion').reset();
    seccionFinalizacionVisible(false);
}

$('boton-cancelar-finalizacion').addEventListener(
    'click',
    async () => { if (await vistaAsignaciones.confirmarDescarte() && vigente()) cerrarFinalizacion(); }
);

// =====================================================
// FINALIZAR CON GPS — RF-12 Y RF-13
// =====================================================

$('formulario-finalizacion').addEventListener(
    'submit',
    async evento => {
        evento.preventDefault();

        if (ocupado) return;

        const id = asignacionParaFinalizar;

        if (id === null) {
            informar('Selecciona una asignación.', 'error');
            return;
        }

        const asignacion = obtenerAsignacion(id);

        if (!asignacion || asignacion.estado !== 'en_curso') {
            informar('Esta asignación no está en curso.', 'error');
            return;
        }

        const respuesta = $('objetivo-cumplido').value;
        const nota = $('nota-finalizacion').value.trim();

        if (respuesta !== 'si' && respuesta !== 'no') {
            informar(
                'Indica si se cumplió el objetivo.',
                'error'
            );
            return;
        }

        if (respuesta === 'no' && !nota) {
            informar(
                'Debes explicar por qué no se cumplió el objetivo.',
                'error'
            );
            return;
        }

        if (!await confirmarAccion({ titulo: 'Finalizar asignación', mensaje: '¿Confirmas que deseas finalizar la tarea? ' +
            'No podrás volver a iniciarla ni modificar su resultado libremente.', textoConfirmar: 'Verificar GPS y finalizar', destructiva: false })) return;

        await ejecutarAccion(async () => {
            informar('Obteniendo ubicación de finalización...');

            const gps = await obtenerUbicacion();
            if (!vigente()) return;

            informar('Validando GPS y finalización...');

            const { error } = await supabase.rpc(
                'finalizar_asignacion',
                {
                    asignacion_id: id,
                    latitud: gps.latitud,
                    longitud: gps.longitud,
                    precision_metros: gps.precision_metros,
                    objetivo_cumplido: respuesta === 'si',
                    nota_finalizacion: nota || null
                }
            );

            if (error) throw error;

            cerrarFinalizacion();

            estadoGps.textContent =
                'Finalización autorizada por el servidor.';

        }, 'Tarea finalizada correctamente. Se registraron la hora y la duración real.');
    }
);

// =====================================================
// ACTUALIZAR Y FILTRAR
// =====================================================

filtroEstado.addEventListener(
    'change',
    mostrarAsignaciones
);

$('boton-actualizar').addEventListener(
    'click',
    async () => {
        if (ocupado) return;

        await ejecutarAccion(
            async () => {},
            'Asignaciones actualizadas.'
        );
    }
);

// =====================================================
// INICIALIZAR
// =====================================================

export async function iniciarAsignaciones(perfilVerificado, contexto = () => true) {
    perfil = perfilVerificado;
    contextoVigente = contexto;
    vistaAsignaciones.conectar({ ubicar: async () => {
        if (ocupado || !vigente()) return;
        bloquearAcciones(true);
        try {
            const gps = await obtenerUbicacion();
            if (vigente()) { vistaAsignaciones.ubicacion(gps, true); informar('Tu ubicación se muestra solo en este mapa.'); }
        } catch (error) { informar(error.message, 'error'); }
        finally { bloquearAcciones(false); }
    } });
    bloquearAcciones(true);
    informar('Cargando asignaciones...');
    try { await cargarAsignaciones(); informar(''); }
    catch (error) { lista.textContent = 'No se pudieron consultar tus actividades. Usa Actualizar para volver a intentarlo.'; informar('No se pudieron cargar las asignaciones. Reintenta con Actualizar. ' + error.message, 'error'); }
    finally { bloquearAcciones(false); }
}
$('buscar-asignaciones').addEventListener('input', mostrarAsignaciones);
