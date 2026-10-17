
import { supabase } from '../configuracion/supabase.js';

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

const ESTADOS = [
    ['pendiente', 'Pendientes', '#d97706'],
    ['aceptada', 'Aceptadas', '#2563eb'],
    ['en_curso', 'En curso', '#7c3aed'],
    ['finalizada', 'Finalizadas', '#16a34a'],
    ['rechazada', 'Rechazadas', '#dc2626'],
    ['cancelada', 'Canceladas', '#64748b']
];

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
        dateStyle: 'short',
        timeStyle: 'short'
    });
}

function formatoPorcentaje(valor) {
    if (valor === null) return '—';

    return valor.toLocaleString('es-CO', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
    }) + '%';
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

function duracionReal(asignacion) {
    if (
        asignacion.estado !== 'finalizada' ||
        !asignacion.inicio_en ||
        !asignacion.fin_en
    ) {
        return null;
    }

    const inicio = new Date(asignacion.inicio_en).getTime();
    const fin = new Date(asignacion.fin_en).getTime();

    const diferencia = (fin - inicio) / 1000;

    if (!Number.isFinite(diferencia) || diferencia < 0) {
        return null;
    }

    return diferencia;
}

function buscarTrabajo(id) {
    return trabajos.find(t => t.id === id);
}

function buscarEmpresa(id) {
    return empresas.find(e => e.id === id);
}

function nombreEmpresa(id) {
    return buscarEmpresa(id)?.nombre || `Empresa #${id}`;
}

function nombreTrabajador(id) {
    const p = perfiles.find(item => item.id === id);

    if (!p) return `Trabajador #${id}`;

    return p.nombre_completo ||
        (p.nombre_usuario ? '@' + p.nombre_usuario : `Trabajador #${id}`);
}

function fechaLocalDesdeCampo(valor, finDelDia = false) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
        return null;
    }

    const [anio, mes, dia] = valor.split('-').map(Number);

    const fecha = new Date(
        anio,
        mes - 1,
        dia,
        finDelDia ? 23 : 0,
        finDelDia ? 59 : 0,
        finDelDia ? 59 : 0,
        finDelDia ? 999 : 0
    );

    if (
        fecha.getFullYear() !== anio ||
        fecha.getMonth() !== mes - 1 ||
        fecha.getDate() !== dia
    ) return null;

    return fecha;
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

    return registros;
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
    $('boton-actualizar-panel').disabled = true;

    informar('Consultando registros de Supabase...');

    try {
        // Las empresas propias determinan las opciones
        // del modo propietario.
        empresasPropias = await leerTodas(
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

        trabajos = await leerPorIds(
            'trabajos',
            'id, empresa_id, nombre',
            'id',
            idsTrabajos
        );

        const idsEmpresas = [
            ...new Set([
                ...trabajos.map(t => t.empresa_id),
                ...empresasPropias.map(e => e.id)
            ])
        ];

        const empresasVisibles = await leerPorIds(
            'empresas',
            'id, propietario_id, nombre',
            'id',
            idsEmpresas
        );

        empresas = [
            ...empresasPropias,
            ...empresasVisibles.filter(
                e => !empresasPropias.some(p => p.id === e.id)
            )
        ];

        const idsTrabajadores = [
            ...new Set(todasVisibles.map(a => a.trabajador_id))
        ];

        perfiles = await leerPorIds(
            'perfiles',
            'id, nombre_usuario, nombre_completo',
            'id',
            idsTrabajadores
        );

        // Guardamos únicamente asignaciones de trabajos
        // que se pudieron consultar.
        asignaciones = todasVisibles.filter(a =>
            trabajos.some(t => t.id === a.trabajo_id)
        );

        prepararSelectores();
        actualizarPanel();

        informar('Indicadores actualizados.', 'exito');

    } catch (error) {
        informar(
            'No se pudieron cargar las estadísticas: ' +
            error.message,
            'error'
        );

        console.error(error);

    } finally {
        cargando = false;
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
    const anterior = selectorEmpresa.value;

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
    }

    actualizarSelectorTrabajadores();
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
    const empresa = $('modo-panel').value === 'empresa';
    const personalizado =
        $('filtro-periodo').value === 'personalizado';

    $('contenedor-empresa').classList.toggle(
        'oculto', !empresa
    );

    $('contenedor-trabajador').classList.toggle(
        'oculto', !empresa
    );

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
    const modo = $('modo-panel').value;
    const empresaElegida = $('filtro-empresa').value;
    const trabajadorElegido = $('filtro-trabajador').value;
    const periodo = $('filtro-periodo').value;

    const idsPropios = new Set(
        empresasPropias.map(e => e.id)
    );

    let desde = null;
    let hasta = null;

    if (periodo === 'personalizado') {
        const inicio = $('fecha-inicio').value;
        const fin = $('fecha-fin').value;

        if (!inicio || !fin) {
            throw new Error(
                'Selecciona las fechas de inicio y fin.'
            );
        }

        desde = fechaLocalDesdeCampo(inicio);
        hasta = fechaLocalDesdeCampo(fin, true);

        if (!desde || !hasta || desde > hasta) {
            throw new Error(
                'El período personalizado no es válido.'
            );
        }

    } else if (periodo !== 'todo') {
        const dias = Number(periodo);

        hasta = new Date();
        desde = new Date(hasta);

        desde.setDate(desde.getDate() - (dias - 1));
        desde.setHours(0, 0, 0, 0);
    }

    return asignaciones.filter(a => {
        const trabajo = buscarTrabajo(a.trabajo_id);

        if (!trabajo) return false;

        if (modo === 'trabajador') {
            if (a.trabajador_id !== perfil.id) {
                return false;
            }
        } else {
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
        }

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

function calcularIndicadores(registros) {
    const conteos = {};

    ESTADOS.forEach(([estado]) => {
        conteos[estado] =
            registros.filter(a => a.estado === estado).length;
    });

    const finalizadas = registros.filter(
        a => a.estado === 'finalizada'
    );

    const duraciones = finalizadas
        .map(duracionReal)
        .filter(valor => valor !== null);

    const sumaSegundos = duraciones.reduce(
        (total, segundos) => total + segundos,
        0
    );

    const cumplidas = finalizadas.filter(
        a => a.objetivo_cumplido === true
    ).length;

    const incumplidas = finalizadas.filter(
        a => a.objetivo_cumplido === false
    ).length;

    const conResultado = cumplidas + incumplidas;

    const cumplimiento = conResultado > 0
        ? (cumplidas / conResultado) * 100
        : null;

    return {
        total: registros.length,
        conteos,
        cumplidas,
        incumplidas,
        cumplimiento,
        tiempoTotal: duraciones.length
            ? sumaSegundos
            : null,
        tiempoPromedio: duraciones.length
            ? sumaSegundos / duraciones.length
            : null
    };
}

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

function mostrarGrafico(datos) {
    const contenedor = $('grafico-estados');
    contenedor.replaceChildren();

    if (datos.total === 0) {
        contenedor.textContent =
            'No hay asignaciones para este filtro.';
        return;
    }

    ESTADOS.forEach(([estado, nombre, color]) => {
        const cantidad = datos.conteos[estado];
        const porcentaje = cantidad / datos.total * 100;

        const fila = document.createElement('div');
        fila.className = 'estadistica-barra-fila';

        const encabezado = document.createElement('div');
        encabezado.className =
            'estadistica-barra-encabezado';

        const titulo = document.createElement('span');
        titulo.textContent = nombre;

        const cifra = document.createElement('span');
        cifra.textContent =
            `${cantidad} (${formatoPorcentaje(porcentaje)})`;

        encabezado.append(titulo, cifra);

        const fondo = document.createElement('div');
        fondo.className = 'estadistica-barra-fondo';

        const relleno = document.createElement('div');
        relleno.className = 'estadistica-barra-relleno';

        relleno.style.width = `${porcentaje}%`;
        relleno.style.backgroundColor = color;

        fondo.appendChild(relleno);
        fila.append(encabezado, fondo);

        contenedor.appendChild(fila);
    });
}

// =====================================================
// TABLAS
// =====================================================

function crearCelda(fila, contenido) {
    const celda = document.createElement('td');
    celda.textContent = String(contenido);
    fila.appendChild(celda);
}

function mostrarTablaAgrupada(registros) {
    const cuerpo = $('tabla-agrupacion');
    cuerpo.replaceChildren();

    const modo = $('modo-panel').value;
    const porTrabajador = modo === 'empresa' &&
        $('filtro-empresa').value !== 'todas';

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

    if (!grupos.size) {
        const fila = document.createElement('tr');
        const celda = document.createElement('td');
        celda.colSpan = 6;
        celda.textContent = 'No hay resultados.';
        fila.appendChild(celda);
        cuerpo.appendChild(fila);
        return;
    }

    const ordenados = [...grupos.entries()].sort(
        (a, b) => b[1].length - a[1].length
    );

    ordenados.forEach(([id, elementos]) => {
        const datos = calcularIndicadores(elementos);

        const fila = document.createElement('tr');

        crearCelda(
            fila,
            porTrabajador
                ? nombreTrabajador(id)
                : nombreEmpresa(id)
        );

        crearCelda(fila, datos.total);
        crearCelda(fila, datos.conteos.finalizada);
        crearCelda(fila, datos.conteos.rechazada);
        crearCelda(
            fila, formatoPorcentaje(datos.cumplimiento)
        );
        crearCelda(
            fila, formatoDuracion(datos.tiempoTotal)
        );

        cuerpo.appendChild(fila);
    });
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
    try {
        resultadosFiltrados = filtrarAsignaciones();

        const datos = calcularIndicadores(
            resultadosFiltrados
        );

        mostrarIndicadores(datos);
        mostrarGrafico(datos);
        mostrarTablaAgrupada(resultadosFiltrados);
        mostrarTablaDetalle(resultadosFiltrados);

        const modo = $('modo-panel').value;

        $('descripcion-filtros').textContent =
            `Mostrando ${resultadosFiltrados.length} ` +
            `asignaciones de ${
                modo === 'empresa'
                    ? 'las empresas seleccionadas'
                    : 'tu perfil como trabajador'
            }.`;

        informar('');

    } catch (error) {
        informar(error.message, 'error');
    }
}

// =====================================================
// EVENTOS
// =====================================================

$('modo-panel').addEventListener('change', () => {
    actualizarFiltrosVisibles();
    actualizarPanel();
});

$('filtro-empresa').addEventListener('change', () => {
    actualizarSelectorTrabajadores();
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
    'click', cargarDatos
);

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
        informar(
            'Error al abrir el panel: ' + error.message,
            'error'
        );
        console.error(error);
    }
}

iniciarModulo();
