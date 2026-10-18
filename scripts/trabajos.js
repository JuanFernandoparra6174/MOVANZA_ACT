import { confirmarAccion } from './alertas.js';

import { supabase } from '../configuracion/supabase.js';
import { vistaTrabajos } from './trabajos-panel.js';

// ==================================================
// ELEMENTOS Y VARIABLES
// ==================================================

const $ = id => document.getElementById(id);

const mensaje = $('mensaje');
const formulario = $('formulario-trabajo');

let empresa = null;
let perfil = null;

let trabajadores = [];
let trabajos = [];
let asignaciones = [];

let mapa;
let capaTrabajos;
let marcadorTemporal = null;
let circuloTemporal = null;

let ubicacion = null;

// null: crear nuevo trabajo
// número: agregar asignaciones al trabajo existente
let trabajoExistenteId = null;

let trabajoEnEdicion = null;
let asignacionEnEdicion = null;
let ocupado = false;

// ==================================================
// FUNCIONES GENERALES
// ==================================================

function informar(texto, tipo = '') {
    mensaje.textContent = texto;
    mensaje.className = tipo;
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

    boton.className = 'boton-relleno' + (clase ? ' ' + clase : '');

    boton.addEventListener('click', accion);

    return boton;
}

function fechaVisible(fecha) {
    return new Date(fecha).toLocaleString('es-CO');
}

function fechaParaFormulario(fecha) {
    const d = new Date(fecha);
    const dos = n => String(n).padStart(2, '0');

    return (
        `${d.getFullYear()}-` +
        `${dos(d.getMonth() + 1)}-` +
        `${dos(d.getDate())}T` +
        `${dos(d.getHours())}:` +
        `${dos(d.getMinutes())}`
    );
}

function nombreTrabajador(id) {
    const trabajador = trabajadores.find(t => t.id === id);

    if (!trabajador) return `Trabajador #${id}`;

    return (
        trabajador.alias_interno ||
        trabajador.nombre_completo ||
        trabajador.nombre_usuario
    );
}

async function llamarFuncion(nombre, parametros) {
    const { data, error } = await supabase.rpc(
        nombre,
        parametros
    );

    if (error) throw error;

    return data;
}

async function ejecutarAccion(accion, mensajeExito) {
    if (ocupado) return;

    ocupado = true;
    vistaTrabajos.ocupado(true);
    informar('Procesando solicitud...');

    try {
        await accion();
        await cargarDatos();
        informar(mensajeExito, 'exito');
    } catch (error) {
        informar(error.message, 'error');
        console.error(error);
    } finally {
        ocupado = false;
        vistaTrabajos.ocupado(false);
    }
}

// ==================================================
// MAPA LEAFLET
// ==================================================

function iniciarMapa() {
    if (typeof L === 'undefined') {
        throw new Error('No se pudo cargar Leaflet.');
    }

    mapa = L.map('mapa-trabajos').setView(
        [5.0703, -75.5138],
        13
    );

    L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap contributors'
        }
    ).addTo(mapa);

    capaTrabajos = L.featureGroup().addTo(mapa);

    mapa.on('click', evento => {
        if (vistaTrabajos.estaOcupado()) return;
        seleccionarUbicacion(
            evento.latlng.lat,
            evento.latlng.lng
        );
        vistaTrabajos.desdeMapa();
    });
}

function radioSeleccionado() {
    const campo = trabajoEnEdicion !== null
        ? $('editar-radio-trabajo')
        : $('radio-trabajo');

    return Number(campo.value) || 100;
}

function seleccionarUbicacion(latitud, longitud) {
    ubicacion = { latitud, longitud };

    if (marcadorTemporal) {
        mapa.removeLayer(marcadorTemporal);
    }

    if (circuloTemporal) {
        mapa.removeLayer(circuloTemporal);
    }

    marcadorTemporal = L.marker([
        latitud,
        longitud
    ]).addTo(mapa);

    circuloTemporal = L.circle(
        [latitud, longitud],
        {
            radius: radioSeleccionado(),
            color: '#216b99',
            fillColor: '#8cc9f0',
            fillOpacity: 0.15
        }
    ).addTo(mapa);

    $('latitud-seleccionada').textContent =
        latitud.toFixed(6);

    $('longitud-seleccionada').textContent =
        longitud.toFixed(6);
}

function actualizarRadio() {
    if (circuloTemporal) {
        circuloTemporal.setRadius(radioSeleccionado());
    }
}

$('radio-trabajo').addEventListener(
    'input',
    actualizarRadio
);

$('editar-radio-trabajo').addEventListener(
    'input',
    actualizarRadio
);

function limpiarSeleccionMapa() {
    ubicacion = null;

    if (marcadorTemporal) {
        mapa.removeLayer(marcadorTemporal);
        marcadorTemporal = null;
    }

    if (circuloTemporal) {
        mapa.removeLayer(circuloTemporal);
        circuloTemporal = null;
    }

    $('latitud-seleccionada').textContent =
        'Sin seleccionar';

    $('longitud-seleccionada').textContent =
        'Sin seleccionar';
}

function pintarTrabajos() {
    capaTrabajos.clearLayers();

    trabajos.forEach(trabajo => {
        const centro = [
            trabajo.latitud,
            trabajo.longitud
        ];

        const tareas = asignaciones.filter(
            a => a.trabajo_id === trabajo.id
        );

        const marcador = L.marker(centro);

        const contenido = document.createElement('div');

        contenido.appendChild(
            crearElemento('strong', trabajo.nombre)
        );

        contenido.appendChild(
            crearElemento(
                'p',
                `Asignaciones: ${tareas.length}`
            )
        );

        contenido.appendChild(
            crearBoton(
                'Ver detalles',
                () => verTrabajoEnLista(trabajo.id)
            )
        );

        marcador.bindPopup(contenido);
        marcador.on('click', () => vistaTrabajos.seleccionarTrabajo(trabajo.id));
        marcador.addTo(capaTrabajos);
        vistaTrabajos.registrarMarcador(trabajo.id, marcador);

        L.circle(centro, {
            radius: trabajo.radio_metros,
            color: '#5f4d93',
            fillOpacity: 0.10
        }).addTo(capaTrabajos);
    });
}

function centrarMapa() {
    if (trabajos.length > 0) {
        mapa.fitBounds(capaTrabajos.getBounds(), {
            padding: [30, 30],
            maxZoom: 16
        });
    } else {
        mapa.setView([5.0703, -75.5138], 13);
    }
}

$('boton-centrar').addEventListener(
    'click',
    centrarMapa
);

function verTrabajoEnMapa(id) {
    const trabajo = trabajos.find(t => t.id === id);
    if (!trabajo) return;

    mapa.setView(
        [trabajo.latitud, trabajo.longitud],
        16
    );

    vistaTrabajos.verMapa();
}

function verTrabajoEnLista(id) {
    vistaTrabajos.seleccionarTrabajo(id);
}

// ==================================================
// TRABAJADORES ACTIVOS
// ==================================================

async function cargarTrabajadores() {
    const { data, error } = await supabase
        .from('membresias')
        .select('trabajador_id, alias_interno')
        .eq('empresa_id', empresa.id)
        .eq('estado', 'activa');

    if (error) throw error;

    trabajadores = [];

    if (data?.length) {
        const ids = data.map(m => m.trabajador_id);

        const { data: perfiles, error: errorPerfiles } =
            await supabase
                .from('perfiles')
                .select('id, nombre_usuario, nombre_completo')
                .in('id', ids);

        if (errorPerfiles) throw errorPerfiles;

        trabajadores = (perfiles || []).map(p => {
            const membresia = data.find(
                m => m.trabajador_id === p.id
            );

            return {
                ...p,
                alias_interno: membresia?.alias_interno || ''
            };
        });
    }

    mostrarTrabajadores();
}

function mostrarTrabajadores() {
    const contenedor = $('lista-trabajadores');
    contenedor.replaceChildren();

    if (trabajadores.length === 0) {
        contenedor.appendChild(
            crearElemento(
                'p',
                'No hay trabajadores activos. Invita primero a un integrante.'
            )
        );
        return;
    }

    trabajadores.forEach(trabajador => {
        const etiqueta = document.createElement('label');
        etiqueta.className = 'opcion-trabajador';

        const casilla = document.createElement('input');
        casilla.type = 'checkbox';
        casilla.name = 'trabajador';
        casilla.value = String(trabajador.id);

        const nombre = crearElemento(
            'span',
            `${nombreTrabajador(trabajador.id)} (@${trabajador.nombre_usuario})`
        );

        etiqueta.append(casilla, nombre);
        contenedor.appendChild(etiqueta);
    });
}

function trabajadoresSeleccionados() {
    return Array.from(
        document.querySelectorAll(
            'input[name="trabajador"]:checked'
        )
    ).map(casilla => Number(casilla.value));
}

// ==================================================
// CONSULTAR TRABAJOS Y ASIGNACIONES
// ==================================================

async function cargarDatos() {
    const { data, error } = await supabase
        .from('trabajos')
        .select('id, empresa_id, nombre, latitud, longitud, radio_metros, creado_en')
        .eq('empresa_id', empresa.id)
        .order('creado_en', { ascending: false });

    if (error) throw error;

    trabajos = data || [];
    asignaciones = [];

    if (trabajos.length > 0) {
        const ids = trabajos.map(t => t.id);

        const resultado = await supabase
            .from('asignaciones')
            .select(
                'id, trabajo_id, trabajador_id, titulo, objetivo, programada_para, minutos_estimados, estado, inicio_en, fin_en'
            )
            .in('trabajo_id', ids)
            .order('creado_en', { ascending: true });

        if (resultado.error) throw resultado.error;

        asignaciones = resultado.data || [];
    }

    mostrarTrabajos();
    pintarTrabajos();
}

// ==================================================
// LISTAR TRABAJOS
// ==================================================

function mostrarTrabajos() {
    const contenedor = $('lista-trabajos');
    contenedor.replaceChildren();

    vistaTrabajos.iniciarListado(trabajos.length);

    if (trabajos.length === 0) {
        contenedor.appendChild(
            crearElemento(
                'p',
                'Aún no se han creado trabajos.'
            )
        );
        vistaTrabajos.finalizarListado();
        return;
    }

    trabajos.forEach(trabajo => {
        const tareas = asignaciones.filter(
            a => a.trabajo_id === trabajo.id
        );

        const tarjeta = crearElemento('div');
        tarjeta.className = 'elemento-empresa';
        tarjeta.id = `trabajo-${trabajo.id}`;

        tarjeta.appendChild(
            crearElemento('h3', trabajo.nombre)
        );

        tarjeta.appendChild(
            crearElemento('p', `ID: ${trabajo.id}`)
        );

        tarjeta.appendChild(
            crearElemento(
                'p',
                `Radio permitido: ${trabajo.radio_metros} metros`
            )
        );

        tarjeta.appendChild(
            crearElemento(
                'p',
                `Número de asignaciones: ${tareas.length}`
            )
        );

        const iniciadas = tareas.some(
            a => a.inicio_en !== null
        );

        const enCurso = tareas.some(
            a => a.estado === 'en_curso'
        );

        const pendientes = tareas.some(
            a => ['pendiente', 'aceptada'].includes(a.estado)
        );

        const acciones = crearElemento('div');
        acciones.className = 'acciones-trabajo';

        acciones.appendChild(
            crearBoton(
                'Ver en el mapa',
                () => verTrabajoEnMapa(trabajo.id)
            )
        );

        if (!iniciadas) {
            acciones.appendChild(
                crearBoton(
                    'Editar trabajo',
                    () => abrirEdicionTrabajo(trabajo.id)
                )
            );
        }

        // No agregamos nuevas asignaciones a un
        // trabajo que esté actualmente en ejecución.
        if (!enCurso) {
            acciones.appendChild(
                crearBoton(
                    'Agregar asignaciones',
                    () => prepararAgregar(trabajo.id)
                )
            );
        }

        if (pendientes && !enCurso) {
            acciones.appendChild(
                crearBoton(
                    'Cancelar pendientes',
                    () => cancelarTrabajo(trabajo.id),
                    'boton-peligro'
                )
            );
        }

        tarjeta.appendChild(acciones);

        if (tareas.length === 0) {
            tarjeta.appendChild(
                crearElemento('p', 'Sin asignaciones.')
            );
        }

        tareas.forEach(tarea => {
            tarjeta.appendChild(
                construirTarjetaAsignacion(tarea)
            );
        });

        contenedor.appendChild(vistaTrabajos.registrarTrabajo(trabajo, tarjeta, tareas.length));
    });
    vistaTrabajos.finalizarListado();
}

function construirTarjetaAsignacion(tarea) {
    const tarjeta = crearElemento('div');
    tarjeta.className = 'tarjeta-asignacion';

    tarjeta.appendChild(
        crearElemento('h4', tarea.titulo)
    );

    tarjeta.appendChild(
        crearElemento(
            'p',
            `Trabajador: ${nombreTrabajador(tarea.trabajador_id)}`
        )
    );

    tarjeta.appendChild(
        crearElemento('p', `Asignación ID: ${tarea.id}`)
    );

    const estado = crearElemento(
        'span',
        `Estado: ${tarea.estado}`
    );
    estado.className = 'etiqueta-estado';
    estado.dataset.estado = tarea.estado;
    tarjeta.appendChild(estado);

    tarjeta.appendChild(
        crearElemento(
            'p',
            `Objetivo: ${tarea.objetivo}`
        )
    );

    tarjeta.appendChild(
        crearElemento(
            'p',
            `Programada: ${fechaVisible(tarea.programada_para)}`
        )
    );

    tarjeta.appendChild(
        crearElemento(
            'p',
            `Duración estimada: ${tarea.minutos_estimados} minutos`
        )
    );

    if (['pendiente', 'aceptada'].includes(tarea.estado)) {
        const acciones = crearElemento('div');
        acciones.className = 'acciones-trabajo';

        acciones.appendChild(
            crearBoton(
                'Editar',
                () => abrirEdicionAsignacion(tarea.id)
            )
        );

        acciones.appendChild(
            crearBoton(
                'Cancelar',
                () => cancelarAsignacion(tarea.id),
                'boton-peligro'
            )
        );

        tarjeta.appendChild(acciones);
    }

    return tarjeta;
}

// ==================================================
// FORMULARIO: CREAR O AGREGAR ASIGNACIONES
// ==================================================

function prepararAgregar(id) {
    const trabajo = trabajos.find(t => t.id === id);
    if (!trabajo) return;

    // Cerrar la edición si estaba abierta.
    cerrarEdicionTrabajo();

    trabajoExistenteId = id;

    $('titulo-formulario').textContent =
        'Agregar asignaciones';

    $('descripcion-formulario').textContent =
        `Se agregarán asignaciones al trabajo "${trabajo.nombre}".`;

    $('nombre-trabajo').value = trabajo.nombre;
    $('nombre-trabajo').readOnly = true;

    $('radio-trabajo').value = trabajo.radio_metros;
    $('radio-trabajo').disabled = true;

    $('boton-guardar-trabajo').textContent =
        'Agregar asignaciones';

    $('boton-cancelar-agregar').classList.remove('oculto');

    seleccionarUbicacion(
        trabajo.latitud,
        trabajo.longitud
    );

    vistaTrabajos.mostrarFormulario('agregar');
}

function restaurarCreacion() {
    trabajoExistenteId = null;

    formulario.reset();

    $('nombre-trabajo').readOnly = false;
    $('radio-trabajo').disabled = false;

    $('titulo-formulario').textContent =
        'Crear trabajo';

    $('descripcion-formulario').textContent =
        'Define la ubicación y selecciona los trabajadores responsables.';

    $('boton-guardar-trabajo').textContent =
        'Crear trabajo y asignaciones';

    $('boton-cancelar-agregar').classList.add('oculto');

    limpiarSeleccionMapa();
    vistaTrabajos.creacionRestaurada();
}

$('boton-cancelar-agregar').addEventListener(
    'click',
    () => vistaTrabajos.nuevoPunto()
);

formulario.addEventListener('submit', async evento => {
    evento.preventDefault();

    if (ocupado) return;

    const seleccionados = trabajadoresSeleccionados();

    if (!seleccionados.length) {
        informar(
            'Debes seleccionar al menos un trabajador.',
            'error'
        );
        return;
    }

    if (!trabajoExistenteId && !ubicacion) {
        informar(
            'Selecciona primero una ubicación en el mapa.',
            'error'
        );
        return;
    }

    const nombre = $('nombre-trabajo').value.trim();
    const radio = Number($('radio-trabajo').value);
    const titulo = $('titulo-asignacion').value.trim();
    const objetivo = $('objetivo-asignacion').value.trim();
    const minutos = Number($('minutos-asignacion').value);

    const fechaTexto = $('fecha-asignacion').value;
    const fecha = new Date(fechaTexto);

    if (
        nombre.length < 2 ||
        titulo.length < 2 ||
        objetivo.length < 2 ||
        !fechaTexto ||
        Number.isNaN(fecha.getTime()) ||
        !Number.isInteger(minutos) ||
        minutos < 1 ||
        minutos > 10080 ||
        !Number.isInteger(radio) ||
        radio < 10 ||
        radio > 1000
    ) {
        informar(
            'Revisa los campos del formulario.',
            'error'
        );
        return;
    }

    ocupado = true;
    vistaTrabajos.ocupado(true);
    $('boton-guardar-trabajo').disabled = true;

    let idTrabajo = trabajoExistenteId;
    let creadas = 0;

    try {
        // Si no existe un trabajo previo, crearlo.
        if (idTrabajo === null) {
            informar('Creando trabajo...');

            idTrabajo = await llamarFuncion(
                'crear_trabajo',
                {
                    empresa_id: empresa.id,
                    nombre,
                    latitud: ubicacion.latitud,
                    longitud: ubicacion.longitud,
                    radio_metros: radio
                }
            );
        }

        // Una asignación independiente por trabajador.
        for (const idTrabajador of seleccionados) {
            informar(
                `Guardando asignaciones: ${creadas + 1} de ${seleccionados.length}`
            );

            await llamarFuncion(
                'crear_asignacion',
                {
                    trabajo_id: idTrabajo,
                    trabajador_id: idTrabajador,
                    titulo,
                    objetivo,
                    programada_para: fecha.toISOString(),
                    minutos_estimados: minutos
                }
            );

            creadas++;
        }

        restaurarCreacion();
        await cargarDatos();
        vistaTrabajos.seleccionarTrabajo(idTrabajo, { forzar: true });

        informar(
            `Trabajo #${idTrabajo}: ${creadas} asignación(es) guardadas correctamente.`,
            'exito'
        );

    } catch (error) {
        console.error(error);

        informar(
            `Ocurrió un error: ${error.message}. ` +
            `Trabajo: ${idTrabajo ?? 'sin crear'}. ` +
            `Asignaciones guardadas: ${creadas}/${seleccionados.length}. ` +
            'Revisa los registros antes de intentar nuevamente.',
            'error'
        );

        try {
            await cargarDatos();
        } catch (errorCarga) {
            console.error(errorCarga);
        }

    } finally {
        ocupado = false;
        vistaTrabajos.ocupado(false);
        $('boton-guardar-trabajo').disabled = false;
    }
});

// ==================================================
// EDITAR TRABAJO
// ==================================================

function abrirEdicionTrabajo(id) {
    const trabajo = trabajos.find(t => t.id === id);
    if (!trabajo) return;

    // Evitar modificar accidentalmente el formulario
    // que agrega asignaciones.
    if (trabajoExistenteId !== null) {
        restaurarCreacion();
    }

    trabajoEnEdicion = id;

    $('id-trabajo-edicion').textContent = id;
    $('editar-nombre-trabajo').value = trabajo.nombre;
    $('editar-radio-trabajo').value = trabajo.radio_metros;

    seleccionarUbicacion(
        trabajo.latitud,
        trabajo.longitud
    );

    $('seccion-editar-trabajo').classList.remove('oculto');

    vistaTrabajos.mostrarFormulario('editar-trabajo');
}

function cerrarEdicionTrabajo() {
    trabajoEnEdicion = null;
    $('seccion-editar-trabajo').classList.add('oculto');

    if (mapa) limpiarSeleccionMapa();
    vistaTrabajos.edicionCerrada('editar-trabajo');
}

$('cerrar-edicion-trabajo').addEventListener(
    'click',
    () => vistaTrabajos.cerrar()
);

$('formulario-editar-trabajo').addEventListener(
    'submit',
    async evento => {
        evento.preventDefault();

        if (trabajoEnEdicion === null || !ubicacion) {
            informar('Selecciona una ubicación válida.', 'error');
            return;
        }

        const id = trabajoEnEdicion;

        await ejecutarAccion(async () => {
            await llamarFuncion('editar_trabajo', {
                trabajo_id: id,
                nombre: $('editar-nombre-trabajo').value.trim(),
                latitud: ubicacion.latitud,
                longitud: ubicacion.longitud,
                radio_metros: Number(
                    $('editar-radio-trabajo').value
                )
            });

            cerrarEdicionTrabajo();

        }, 'Trabajo actualizado correctamente.');
    }
);

// ==================================================
// EDITAR ASIGNACIÓN
// ==================================================

function abrirEdicionAsignacion(id) {
    const tarea = asignaciones.find(a => a.id === id);
    if (!tarea) return;

    asignacionEnEdicion = id;

    $('id-asignacion-edicion').textContent = id;
    $('editar-titulo').value = tarea.titulo;
    $('editar-objetivo').value = tarea.objetivo;
    $('editar-fecha').value =
        fechaParaFormulario(tarea.programada_para);

    $('editar-minutos').value =
        tarea.minutos_estimados;

    $('seccion-editar-asignacion').classList.remove('oculto');

    vistaTrabajos.mostrarFormulario('editar-asignacion');
}

function cerrarEdicionAsignacion() {
    asignacionEnEdicion = null;
    $('seccion-editar-asignacion').classList.add('oculto');
    vistaTrabajos.edicionCerrada('editar-asignacion');
}

$('cerrar-edicion-asignacion').addEventListener(
    'click',
    () => vistaTrabajos.cerrar()
);

$('formulario-editar-asignacion').addEventListener(
    'submit',
    async evento => {
        evento.preventDefault();

        if (asignacionEnEdicion === null) return;

        const fechaTexto = $('editar-fecha').value;
        const fecha = new Date(fechaTexto);

        if (
            !fechaTexto ||
            Number.isNaN(fecha.getTime())
        ) {
            informar('La fecha no es válida.', 'error');
            return;
        }

        const id = asignacionEnEdicion;

        await ejecutarAccion(async () => {
            await llamarFuncion('editar_asignacion', {
                asignacion_id: id,
                titulo: $('editar-titulo').value.trim(),
                objetivo: $('editar-objetivo').value.trim(),
                programada_para: fecha.toISOString(),
                minutos_estimados: Number(
                    $('editar-minutos').value
                )
            });

            cerrarEdicionAsignacion();

        }, 'Asignación actualizada correctamente.');
    }
);

// ==================================================
// CANCELACIONES
// ==================================================

async function cancelarAsignacion(id) {
    const confirmar = await confirmarAccion({ titulo: 'Cancelar asignación', mensaje: `¿Deseas cancelar la asignación #${id}? ` +
        'El registro histórico se conservará.', textoConfirmar: 'Cancelar asignación', destructiva: true });

    if (!confirmar) return;

    await ejecutarAccion(async () => {
        await llamarFuncion('cancelar_asignacion', {
            asignacion_id: id
        });

        if (asignacionEnEdicion === id) {
            cerrarEdicionAsignacion();
        }

    }, 'Asignación cancelada correctamente.');
}

async function cancelarTrabajo(id) {
    const confirmar = await confirmarAccion({ titulo: 'Cancelar trabajo', mensaje: `Trabajo #${id}: se cancelarán las asignaciones pendientes ` +
        'o aceptadas de este trabajo. ' +
        'No se borrará el historial. ¿Continuar?', textoConfirmar: 'Cancelar asignaciones', destructiva: true });

    if (!confirmar) return;

    await ejecutarAccion(async () => {
        await llamarFuncion('cancelar_trabajo', {
            trabajo_id: id
        });

    }, 'Asignaciones no iniciadas canceladas.');
}

// ==================================================
// AUTENTICACIÓN Y EMPRESA SELECCIONADA
// ==================================================

async function iniciarModulo() {
    try {
        const { data: resultado, error: errorUsuario } =
            await supabase.auth.getUser();

        if (errorUsuario) throw errorUsuario;

        if (!resultado.user) {
            location.replace('../index.html');
            return;
        }

        const { data: datosPerfil, error: errorPerfil } =
            await supabase
                .from('perfiles')
                .select('id')
                .eq('usuario_auth_id', resultado.user.id)
                .single();

        if (errorPerfil) throw errorPerfil;

        perfil = datosPerfil;

        const idEmpresa = sessionStorage.getItem(
            'movanza_empresa_activa'
        );

        if (!idEmpresa || !/^\d+$/.test(idEmpresa)) {
            throw new Error(
                'Primero selecciona una empresa en Mis empresas.'
            );
        }

        const { data: datosEmpresa, error: errorEmpresa } =
            await supabase
                .from('empresas')
                .select('id, nombre, propietario_id')
                .eq('id', idEmpresa)
                .eq('propietario_id', perfil.id)
                .single();

        if (errorEmpresa || !datosEmpresa) {
            throw new Error(
                'No puedes administrar esta empresa.'
            );
        }

        empresa = datosEmpresa;

        $('nombre-empresa').textContent = empresa.nombre;

        iniciarMapa();

        await cargarTrabajadores();
        await cargarDatos();

        centrarMapa();
        return empresa;

    } catch (error) {
        informar(error.message, 'error');
        console.error(error);

        $('seccion-crear').classList.add('oculto');
    }
}

vistaTrabajos.conectar({ restaurarCreacion, cerrarEdicionTrabajo, cerrarEdicionAsignacion,
    ajustarMapa: () => mapa?.invalidateSize({ pan: false }),
    seleccionarCentro: () => {
        const centro = mapa.getCenter();
        seleccionarUbicacion(centro.lat, centro.lng);
        vistaTrabajos.desdeMapa();
    },
    centrarMapa });
export const trabajosListos = iniciarModulo();
