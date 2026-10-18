
import { supabase } from '../configuracion/supabase.js';
import { ESTADOS, ZONA_INFORME, calcularIndicadores, duracionReal, limitesPeriodo, unicosPorId } from './estadisticas-calculos.js';
import { vistaEstadisticas } from './estadisticas-vista.js';

// =====================================================
// ELEMENTOS Y ESTADO
// =====================================================

const $ = id => document.getElementById(id);

let perfil = null;
let empresasPropias = [];
let empresas = [];
let trabajos = [];
let perfiles = [];
let asignaciones = [];
let resultadosFiltrados = [];
let cargando = false;
let datosDisponibles = false;
let indiceTrabajos = new Map(), indiceEmpresas = new Map(), indicePerfiles = new Map();
// Solo preselecciona una opción autorizada al entrar desde Home Empresa 2.
let empresaInicial = new URLSearchParams(window.location.search).get('empresa') || sessionStorage.getItem('movanza_empresa_activa');

const CAMPOS_ASIGNACION = [
    'id',
    'trabajo_id',
    'trabajador_id',
    'titulo',
    'programada_para',
    'minutos_estimados',
    'estado',
    'inicio_en',
    'fin_en',
    'objetivo_cumplido'
].join(',');

// =====================================================
// UTILIDADES
// =====================================================

function informar(texto, tipo = '') {
    $('mensaje').textContent = texto;
    $('mensaje').className = tipo;
}

function textoSeguro(elemento, contenido) {
    elemento.textContent = String(contenido);
}

function formatoNumero(numero) {
    return new Intl.NumberFormat('es-CO').format(numero);
}

function formatoFecha(fecha) {
    if (!fecha) return 'Sin fecha';

    const valor = new Date(fecha);

    if (Number.isNaN(valor.getTime())) return 'Sin fecha';

    return valor.toLocaleString('es-CO', {
        timeZone: ZONA_INFORME,
        dateStyle: 'short',
        timeStyle: 'short'
    });
}

function formatoPorcentaje(valor) {
    if (valor === null) return '—';

    return valor.toLocaleString('es-CO', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
    }) + ' %';
}

function formatoDuracion(segundos) {
    if (segundos === null || !Number.isFinite(segundos)) {
        return '—';
    }

    segundos = Math.max(0, Math.round(segundos));

    const horas = Math.floor(segundos / 3600);
    const minutos = Math.floor((segundos % 3600) / 60);
    const resto = segundos % 60;

    return `${horas} h ${minutos} min ${resto} s`;
}

function buscarTrabajo(id) {
    return indiceTrabajos.get(id);
}

function buscarEmpresa(id) {
    return indiceEmpresas.get(id);
}

function nombreEmpresa(id) {
    return buscarEmpresa(id)?.nombre || `Empresa #${id}`;
}

function nombreTrabajador(id) {
    const p = indicePerfiles.get(id);

    if (!p) return `Trabajador #${id}`;

    return p.nombre_completo ||
        (p.nombre_usuario ? '@' + p.nombre_usuario : `Trabajador #${id}`);
}

// =====================================================
// LECTURA PAGINADA
// =====================================================

// Supabase suele limitar el número de filas por respuesta.
// Leemos en bloques de 500 para no calcular solo con
// los primeros resultados.

async function leerTodas(tabla, columnas, configurar = q => q) {
    const registros = [];
    const tamano = 500;
    let desde = 0;

    while (true) {
        let consulta = supabase
            .from(tabla)
            .select(columnas)
            .order('id', { ascending: true })
            .range(desde, desde + tamano - 1);

        consulta = configurar(consulta);

        const { data, error } = await consulta;

        if (error) throw error;

        const lote = data || [];
        registros.push(...lote);

        if (lote.length < tamano) break;

        desde += tamano;
    }

    return unicosPorId(registros);
}

// Dividimos los filtros .in en grupos para que una
// aplicación con muchas asignaciones no genere
// consultas excesivamente largas.

async function leerPorIds(tabla, columnas, campo, ids) {
    if (!ids.length) return [];

    const resultado = [];
    const unicos = [...new Set(ids)];

    for (let inicio = 0; inicio < unicos.length; inicio += 100) {
        const grupo = unicos.slice(inicio, inicio + 100);

        const filas = await leerTodas(
            tabla,
            columnas,
            consulta => consulta.in(campo, grupo)
        );

        resultado.push(...filas);
    }

    return resultado;
}

// =====================================================
// CONSULTAR DATOS REALES
// =====================================================

async function cargarDatos() {
    if (cargando) return;

    cargando = true;
    vistaEstadisticas.carga(true);
    $('boton-actualizar-panel').disabled = true;

    informar('Consultando registros de Supabase...');

    try {
        // Las empresas propias determinan las opciones
        // del modo propietario.
        const nuevasPropias = await leerTodas(
            'empresas',
            'id, propietario_id, nombre',
            consulta => consulta.eq('propietario_id', perfil.id)
        );

        // RLS limita las asignaciones visibles.
        const todasVisibles = await leerTodas(
            'asignaciones',
            CAMPOS_ASIGNACION
        );

        const idsTrabajos = [
            ...new Set(todasVisibles.map(a => a.trabajo_id))
        ];

        const nuevosTrabajos = await leerPorIds(
            'trabajos',
            'id, empresa_id, nombre',
            'id',
            idsTrabajos
        );

        const idsEmpresas = [
            ...new Set([
                ...nuevosTrabajos.map(t => t.empresa_id),
                ...nuevasPropias.map(e => e.id)
            ])
        ];

        const empresasVisibles = await leerPorIds(
            'empresas',
            'id, propietario_id, nombre',
            'id',
            idsEmpresas
        );

        const nuevasEmpresas = [
            ...nuevasPropias,
            ...empresasVisibles.filter(
                e => !nuevasPropias.some(p => p.id === e.id)
            )
        ];

        const idsTrabajadores = [
            ...new Set(todasVisibles.map(a => a.trabajador_id))
        ];

        const nuevosPerfiles = await leerPorIds(
            'perfiles',
            'id, nombre_usuario, nombre_completo',
            'id',
            idsTrabajadores
        );

        // Guardamos únicamente asignaciones de trabajos
        // que se pudieron consultar.
        const nuevoIndiceTrabajos = new Map(nuevosTrabajos.map(t => [t.id, t]));
        const nuevasAsignaciones = todasVisibles.filter(a => nuevoIndiceTrabajos.has(a.trabajo_id));
        empresasPropias = nuevasPropias;
        empresas = nuevasEmpresas;
        trabajos = nuevosTrabajos;
        perfiles = nuevosPerfiles;
        asignaciones = nuevasAsignaciones;
        indiceTrabajos = nuevoIndiceTrabajos;
        indiceEmpresas = new Map(empresas.map(e => [e.id, e]));
        indicePerfiles = new Map(perfiles.map(p => [p.id, p]));
        datosDisponibles = true;

        prepararSelectores();
        if (actualizarPanel()) informar('Indicadores actualizados.', 'exito');
        vistaEstadisticas.actualizado();

    } catch (error) {
        datosDisponibles = false;
        vistaEstadisticas.sinDatos('No se pudieron consultar los datos. Vuelve a intentar con Actualizar indicadores.');
        informar(
            'No se pudieron cargar las estadísticas: ' +
            error.message,
            'error'
        );

        console.error(error);

    } finally {
        cargando = false;
        vistaEstadisticas.carga(false);
        $('boton-actualizar-panel').disabled = false;
    }
}

// =====================================================
// SELECTORES
// =====================================================

function crearOpcion(valor, nombre) {
    const opcion = document.createElement('option');
    opcion.value = String(valor);
    opcion.textContent = nombre;
    return opcion;
}

function prepararSelectores() {
    const selectorEmpresa = $('filtro-empresa');
    const anterior = empresaInicial || selectorEmpresa.value;
    empresaInicial = null;

    selectorEmpresa.replaceChildren();
    selectorEmpresa.appendChild(
        crearOpcion('todas', 'Todas mis empresas')
    );

    empresasPropias.forEach(e => {
        selectorEmpresa.appendChild(
            crearOpcion(e.id, e.nombre)
        );
    });

    if (
        [...selectorEmpresa.options].some(
            opcion => opcion.value === anterior
        )
    ) {
        selectorEmpresa.value = anterior;
    } else if (anterior && anterior !== 'todas') {
        selectorEmpresa.prepend(crearOpcion('', 'Selecciona una empresa disponible'));
        selectorEmpresa.value = '';
    }

    actualizarSelectorTrabajadores();
    actualizarSelectorPuntos();
}

function actualizarSelectorPuntos() {
    const selector = $('filtro-punto');
    if (!selector) return;
    const anterior = selector.value;
    selector.replaceChildren(crearOpcion('todos', 'Todos los puntos con asignaciones'));
    const propias = new Set(empresasPropias.map(e => e.id));
    trabajos.filter(t => propias.has(t.empresa_id) && ($('filtro-empresa').value === 'todas' || String(t.empresa_id) === $('filtro-empresa').value))
        .forEach(t => selector.append(crearOpcion(t.id, t.nombre)));
    if ([...selector.options].some(op => op.value === anterior)) selector.value = anterior;
}

function actualizarSelectorTrabajadores() {
    const selector = $('filtro-trabajador');
    const anterior = selector.value;
    const empresaElegida = $('filtro-empresa').value;

    selector.replaceChildren();
    selector.appendChild(
        crearOpcion('todos', 'Todos los trabajadores')
    );

    const idsPropios = new Set(
        empresasPropias.map(e => e.id)
    );

    const candidatos = asignaciones.filter(a => {
        const trabajo = buscarTrabajo(a.trabajo_id);

        if (!trabajo || !idsPropios.has(trabajo.empresa_id)) {
            return false;
        }

        return empresaElegida === 'todas' ||
            String(trabajo.empresa_id) === empresaElegida;
    });

    const ids = [
        ...new Set(candidatos.map(a => a.trabajador_id))
    ];

    ids.sort((a, b) =>
        nombreTrabajador(a).localeCompare(
            nombreTrabajador(b), 'es'
        )
    );

    ids.forEach(id => {
        selector.appendChild(
            crearOpcion(id, nombreTrabajador(id))
        );
    });

    if (
        [...selector.options].some(
            opcion => opcion.value === anterior
        )
    ) {
        selector.value = anterior;
    }
}

function actualizarFiltrosVisibles() {
    const personalizado =
        $('filtro-periodo').value === 'personalizado';

    $('contenedor-empresa').classList.remove('oculto');
    $('contenedor-trabajador').classList.remove('oculto');

    $('contenedor-fecha-inicio').classList.toggle(
        'oculto', !personalizado
    );

    $('contenedor-fecha-fin').classList.toggle(
        'oculto', !personalizado
    );
}

// =====================================================
// FILTRAR REGISTROS
// =====================================================

function filtrarAsignaciones() {
    const empresaElegida = $('filtro-empresa').value;
    const trabajadorElegido = $('filtro-trabajador').value;
    const periodo = $('filtro-periodo').value;
    const estadoElegido = $('filtro-estado').value;
    const puntoElegido = $('filtro-punto').value;
    if (!empresaElegida) throw new Error('Selecciona una empresa disponible.');

    const idsPropios = new Set(
        empresasPropias.map(e => e.id)
    );

    const { desde, hasta } = limitesPeriodo(periodo, $('fecha-inicio').value, $('fecha-fin').value);

    return asignaciones.filter(a => {
        const trabajo = buscarTrabajo(a.trabajo_id);

        if (!trabajo) return false;

        if (!idsPropios.has(trabajo.empresa_id)) {
            return false;
        }

        if (
            empresaElegida !== 'todas' &&
            String(trabajo.empresa_id) !== empresaElegida
        ) return false;

        if (
            trabajadorElegido !== 'todos' &&
            String(a.trabajador_id) !== trabajadorElegido
        ) return false;
        if (estadoElegido !== 'todos' && a.estado !== estadoElegido) return false;
        if (puntoElegido !== 'todos' && String(a.trabajo_id) !== puntoElegido) return false;

        if (desde || hasta) {
            if (!a.programada_para) return false;

            const fecha = new Date(a.programada_para);

            if (Number.isNaN(fecha.getTime())) {
                return false;
            }

            if (desde && fecha < desde) return false;
            if (hasta && fecha > hasta) return false;
        }

        return true;
    });
}

// =====================================================
// INDICADORES
// =====================================================

function escribirIndicador(id, valor) {
    textoSeguro($(id), valor);
}

function mostrarIndicadores(datos) {
    escribirIndicador(
        'indicador-total', formatoNumero(datos.total)
    );

    const campos = {
        pendiente: 'indicador-pendientes',
        aceptada: 'indicador-aceptadas',
        en_curso: 'indicador-en-curso',
        finalizada: 'indicador-finalizadas',
        rechazada: 'indicador-rechazadas',
        cancelada: 'indicador-canceladas'
    };

    for (const [estado, id] of Object.entries(campos)) {
        escribirIndicador(
            id,
            formatoNumero(datos.conteos[estado])
        );
    }

    escribirIndicador(
        'indicador-tiempo-total',
        formatoDuracion(datos.tiempoTotal)
    );

    escribirIndicador(
        'indicador-tiempo-promedio',
        formatoDuracion(datos.tiempoPromedio)
    );

    escribirIndicador(
        'indicador-objetivos-cumplidos',
        formatoNumero(datos.cumplidas)
    );

    escribirIndicador(
        'indicador-objetivos-no-cumplidos',
        formatoNumero(datos.incumplidas)
    );

    escribirIndicador(
        'indicador-cumplimiento',
        formatoPorcentaje(datos.cumplimiento)
    );
}

// =====================================================
// GRÁFICO DE ESTADOS
// =====================================================

// =====================================================
// TABLAS
// =====================================================

function crearCelda(fila, contenido) {
    const celda = document.createElement('td');
    celda.textContent = String(contenido);
    celda.dataset.etiqueta = ['Asignación', 'Empresa', 'Trabajador', 'Fecha programada', 'Estado', 'Tiempo real', 'Objetivo'][fila.children.length];
    fila.appendChild(celda);
}

function mostrarTablaAgrupada(registros) {
    const cuerpo = $('tabla-agrupacion');
    cuerpo.replaceChildren();

    const porTrabajador = $('filtro-empresa').value !== 'todas';

    $('titulo-agrupacion').textContent = porTrabajador
        ? 'Resultados por trabajador'
        : 'Resultados por empresa';

    $('columna-grupo').textContent = porTrabajador
        ? 'Trabajador'
        : 'Empresa';

    const grupos = new Map();

    registros.forEach(a => {
        const trabajo = buscarTrabajo(a.trabajo_id);
        if (!trabajo) return;

        const id = porTrabajador
            ? a.trabajador_id
            : trabajo.empresa_id;

        if (!grupos.has(id)) grupos.set(id, []);

        grupos.get(id).push(a);
    });

    const ordenados = [...grupos.entries()].sort(
        (a, b) => b[1].length - a[1].length
    );

    const filas = ordenados.map(([id, elementos]) => ({ id, nombre: porTrabajador ? nombreTrabajador(id) : nombreEmpresa(id), datos: calcularIndicadores(elementos) }));
    vistaEstadisticas.grupos(filas, formatoPorcentaje, formatoDuracion);
    return filas;
}

function mostrarTablaDetalle(registros) {
    const cuerpo = $('tabla-detalle');
    cuerpo.replaceChildren();

    if (!registros.length) {
        const fila = document.createElement('tr');
        const celda = document.createElement('td');
        celda.colSpan = 7;
        celda.textContent =
            'No hay asignaciones en el período seleccionado.';
        fila.appendChild(celda);
        cuerpo.appendChild(fila);
        return;
    }

    const ordenados = [...registros].sort((a, b) =>
        new Date(b.programada_para || 0) -
        new Date(a.programada_para || 0)
    );

    ordenados.forEach(a => {
        const trabajo = buscarTrabajo(a.trabajo_id);

        const fila = document.createElement('tr');
        fila.dataset.estado = a.estado;

        crearCelda(fila, a.titulo);
        crearCelda(
            fila,
            trabajo
                ? nombreEmpresa(trabajo.empresa_id)
                : 'No disponible'
        );
        crearCelda(
            fila,
            nombreTrabajador(a.trabajador_id)
        );
        crearCelda(
            fila,
            formatoFecha(a.programada_para)
        );

        const estado = ESTADOS.find(
            item => item[0] === a.estado
        );

        crearCelda(
            fila,
            estado ? estado[1] : a.estado
        );

        crearCelda(
            fila,
            formatoDuracion(duracionReal(a))
        );

        let resultado = '—';

        if (a.estado === 'finalizada') {
            if (a.objetivo_cumplido === true) {
                resultado = 'Cumplido';
            } else if (a.objetivo_cumplido === false) {
                resultado = 'No cumplido';
            }
        }

        crearCelda(fila, resultado);

        cuerpo.appendChild(fila);
    });
}

// =====================================================
// ACTUALIZAR PANEL
// =====================================================

function actualizarPanel() {
    if (!datosDisponibles) return false;
    try {
        resultadosFiltrados = filtrarAsignaciones();

        const datos = calcularIndicadores(
            resultadosFiltrados
        );

        mostrarIndicadores(datos);
        const grupos = mostrarTablaAgrupada(resultadosFiltrados);
        mostrarTablaDetalle(resultadosFiltrados);
        vistaEstadisticas.representar({ datos, registros: resultadosFiltrados, grupos, formatoDuracion });

        const filtros = ['filtro-empresa', 'filtro-trabajador', 'filtro-periodo', 'filtro-estado', 'filtro-punto'].map(id => $(id).selectedOptions[0]?.textContent.trim()).filter(Boolean);
        if ($('filtro-periodo').value === 'personalizado') filtros.push(`${$('fecha-inicio').value} → ${$('fecha-fin').value}`);
        $('descripcion-filtros').textContent = `${resultadosFiltrados.length} asignaciones · ${filtros.join(' · ')} · Hora de Colombia`;
        $('empresa-informe').textContent = $('filtro-empresa').selectedOptions[0]?.textContent.trim() || 'Selecciona una empresa';

        informar('');
        return true;

    } catch (error) {
        vistaEstadisticas.sinDatos('Corrige los filtros para consultar los resultados.', { filtros: true });
        informar(error.message, 'error');
        return false;
    }
}

// =====================================================
// EVENTOS
// =====================================================

$('filtro-empresa').addEventListener('change', () => {
    actualizarSelectorTrabajadores();
    actualizarSelectorPuntos();
    actualizarPanel();
});

$('filtro-trabajador').addEventListener(
    'change', actualizarPanel
);

$('filtro-periodo').addEventListener('change', () => {
    actualizarFiltrosVisibles();
    actualizarPanel();
});

$('fecha-inicio').addEventListener(
    'change', actualizarPanel
);

$('fecha-fin').addEventListener(
    'change', actualizarPanel
);

$('boton-actualizar-panel').addEventListener(
    'click', () => perfil ? cargarDatos() : iniciarModulo()
);
$('filtro-estado').addEventListener('change', actualizarPanel);
$('filtro-punto').addEventListener('change', actualizarPanel);

// =====================================================
// INICIAR MÓDULO
// =====================================================

async function iniciarModulo() {
    try {
        const { data, error } =
            await supabase.auth.getUser();

        if (error) throw error;

        if (!data.user) {
            window.location.replace('../index.html');
            return;
        }

        const resultado = await supabase
            .from('perfiles')
            .select('id, nombre_usuario')
            .eq('usuario_auth_id', data.user.id)
            .single();

        if (resultado.error) {
            throw resultado.error;
        }

        perfil = resultado.data;

        $('usuario-actual').textContent =
            '@' + perfil.nombre_usuario;

        actualizarFiltrosVisibles();
        await cargarDatos();

    } catch (error) {
        datosDisponibles = false;
        vistaEstadisticas.sinDatos('No se pudo abrir el informe. Vuelve a intentarlo.');
        informar(
            'Error al abrir el panel: ' + error.message,
            'error'
        );
        console.error(error);
    }
}

export const estadisticasListas = iniciarModulo();
