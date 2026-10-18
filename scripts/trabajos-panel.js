// Adaptador de presentación: reutiliza nodos y acciones creados por trabajos.js.
import { confirmarAccion } from './alertas.js';
const $ = id => document.getElementById(id);
let acciones = {};
let modo = 'inicial';
let seleccionado = null;
let ocupado = false;
let instantanea = '';
let origen = null;
let reiniciando = false;
let media;
let iniciada = false;
let cerrando = false;
let ubicacionModificada = false;
let habilitada = false;
let salidaConfirmada = false;
const registros = new Map();
const marcadores = new Map();
const secciones = { inicial: 'panel-inicial', detalle: 'panel-detalle', crear: 'seccion-crear', agregar: 'seccion-crear', 'editar-trabajo': 'seccion-editar-trabajo', 'editar-asignacion': 'seccion-editar-asignacion' };
const titulos = { inicial: 'Tu espacio de gestión', detalle: 'Detalle del punto', crear: 'Nuevo punto de trabajo', agregar: 'Agregar asignaciones', 'editar-trabajo': 'Editar punto de trabajo', 'editar-asignacion': 'Editar asignación' };

function formularioActual() { return $(secciones[modo])?.querySelector('form'); }
function valoresActuales() {
    const form = formularioActual();
    if (!form) return '';
    return JSON.stringify([...form.querySelectorAll('input, textarea, select')].map(c => [c.id || c.name, c.value, c.checked])) + (modo === 'editar-asignacion' ? '' : $('latitud-seleccionada').textContent + $('longitud-seleccionada').textContent);
}
function descartar() {
    return !formularioActual() || (valoresActuales() === instantanea && !ubicacionModificada) || confirmarAccion({ titulo: 'Cambios sin guardar', mensaje: 'Hay cambios sin guardar. ¿Deseas descartarlos?', textoConfirmar: 'Descartar cambios', destructiva: true });
}
function limpiarModos() {
    reiniciando = true;
    acciones.cerrarEdicionTrabajo?.();
    acciones.cerrarEdicionAsignacion?.();
    acciones.restaurarCreacion?.();
    reiniciando = false;
}
function moverEstado(alPanel) {
    (alPanel ? $('mensajes-panel') : $('mensajes-trabajos')).append($('estado-operacion'));
}
function animar() {
    if (!media || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    $('panel-trabajo').animate?.([{ opacity: .45, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 180, easing: 'ease-out' });
}
function distribuirPanel() {
    if (!iniciada) return;
    const movil = media.matches;
    const dialogo = $('panel-movil');
    if (movil && modo !== 'inicial') {
        dialogo.append($('panel-trabajo'));
        if (!dialogo.open) dialogo.showModal();
    } else {
        if (dialogo.open) dialogo.close();
        $('anclaje-panel').append($('panel-trabajo'));
    }
    acciones.ajustarMapa?.();
}
function mostrar(nuevoModo, { capturar = true, enfocar = true } = {}) {
    modo = nuevoModo;
    for (const id of new Set(Object.values(secciones))) $(id).classList.toggle('oculto', id !== secciones[modo]);
    $('titulo-panel').textContent = titulos[modo];
    $('cerrar-panel').hidden = modo === 'inicial';
    $('cancelar-panel').hidden = modo === 'inicial';
    $('cancelar-panel').textContent = formularioActual() ? 'Cancelar' : 'Cerrar';
    $('elegir-ubicacion').hidden = !['crear', 'editar-trabajo'].includes(modo);
    moverEstado(modo !== 'inicial');
    if (capturar) { instantanea = valoresActuales(); ubicacionModificada = false; }
    $('volver-card').hidden = true;
    distribuirPanel();
    animar();
    if (enfocar && modo !== 'inicial') $('titulo-panel').focus({ preventScroll: true });
}
function marcarSeleccion() {
    for (const [id, registro] of registros) {
        const activo = id === seleccionado;
        registro.resumen.classList.toggle('empresa-seleccionada', activo);
        registro.resumen.querySelector('button').setAttribute('aria-pressed', String(activo));
    }
    for (const [id, marcador] of marcadores) {
        marcador.getElement?.()?.classList.toggle('marcador-activo', id === seleccionado);
        marcador.setZIndexOffset?.(id === seleccionado ? 1000 : 0);
    }
}
function renderizarDetalle() {
    const registro = registros.get(seleccionado);
    if (!registro) return;
    $('detalle-contenido').replaceChildren(registro.tarjeta);
    marcarSeleccion();
}

export const vistaTrabajos = {
    conectar(controlador) { acciones = controlador; },
    confirmarSalida() { return !ocupado && descartar(); },
    iniciar() {
        iniciada = true;
        media = window.matchMedia('(max-width: 900px)');
        media.addEventListener('change', distribuirPanel);
        $('nuevo-punto').addEventListener('click', () => this.nuevoPunto());
        $('cerrar-panel').addEventListener('click', () => this.cerrar());
        $('cancelar-panel').addEventListener('click', () => this.cerrar());
        $('panel-movil').addEventListener('cancel', evento => { evento.preventDefault(); this.cerrar(); });
        $('panel-trabajo').addEventListener('keydown', evento => {
            if (evento.key === 'Escape' && !$('panel-movil').open) { evento.preventDefault(); this.cerrar(); }
        });
        $('elegir-ubicacion').addEventListener('click', () => {
            if (ocupado) return;
            if ($('panel-movil').open) $('panel-movil').close();
            this.verMapa();
            $('volver-card').hidden = !media.matches;
            $('instruccion-mapa').textContent = 'Pulsa en el mapa para elegir la ubicación. Tu formulario se conserva.';
        });
        $('volver-card').addEventListener('click', () => mostrar(modo, { capturar: false }));
        $('usar-centro').addEventListener('click', () => { if (habilitada && !ocupado && !cerrando) acciones.seleccionarCentro?.(); });
        for (const nombre of ['mapa', 'lista']) {
            const tab = $('tab-' + nombre);
            tab.addEventListener('click', () => this.cambiarVista(nombre));
            tab.addEventListener('keydown', evento => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(evento.key)) return;
                evento.preventDefault();
                const siguiente = evento.key === 'Home' ? 'mapa' : evento.key === 'End' ? 'lista' : nombre === 'mapa' ? 'lista' : 'mapa';
                this.cambiarVista(siguiente); $('tab-' + siguiente).focus();
            });
        }
        if (window.MovanzaUI) {
            const carga = window.MovanzaUI.crearLoader('Procesando solicitud…');
            $('estado-operacion').append(carga);
            this.indicador = carga;
        }
        mostrar('inicial', { enfocar: false });
        window.addEventListener('beforeunload', evento => {
            if (!salidaConfirmada && (ocupado || (formularioActual() && (valoresActuales() !== instantanea || ubicacionModificada)))) { evento.preventDefault(); evento.returnValue = ''; }
        });
        document.querySelectorAll('a[href]').forEach(enlace => enlace.addEventListener('click', async evento => {
            if (evento.ctrlKey || evento.metaKey || evento.shiftKey || enlace.target === '_blank' || enlace.getAttribute('href').startsWith('#')) return;
            if (ocupado) { evento.preventDefault(); return; }
            if (!formularioActual() || (valoresActuales() === instantanea && !ubicacionModificada)) { salidaConfirmada = true; return; }
            // Se cancela el evento antes del primer await: ningún enlace navega anticipadamente.
            evento.preventDefault();
            if (await descartar() && habilitada && !ocupado) { salidaConfirmada = true; window.location.assign(enlace.href); }
        }));
    },
    activar() {
        habilitada = true;
        $('nuevo-punto').disabled = false; $('boton-centrar').disabled = false;
        $('usar-centro').disabled = false;
        acciones.ajustarMapa?.(); acciones.centrarMapa?.();
    },
    cambiarVista(nombre) {
        for (const n of ['mapa', 'lista']) {
            $('vista-' + n).hidden = n !== nombre;
            $('tab-' + n).setAttribute('aria-selected', String(n === nombre));
            $('tab-' + n).tabIndex = n === nombre ? 0 : -1;
        }
        if (nombre === 'mapa') acciones.ajustarMapa?.();
    },
    verMapa() {
        this.cambiarVista('mapa');
        if ($('panel-movil').open) $('panel-movil').close();
        $('volver-card').hidden = !media.matches || modo === 'inicial';
        $('volver-card').textContent = formularioActual() ? 'Volver al formulario' : 'Volver al detalle';
        $('mapa-trabajos').focus({ preventScroll: true });
        $('mapa-trabajos').scrollIntoView?.({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
    },
    async nuevoPunto() {
        if (!habilitada || ocupado || cerrando || !await descartar()) return;
        if (!habilitada || ocupado || cerrando) return;
        origen = document.activeElement;
        limpiarModos(); seleccionado = null; marcarSeleccion();
        mostrar('crear');
    },
    desdeMapa() {
        if (!habilitada || ocupado) return;
        if (['inicial', 'detalle'].includes(modo)) { seleccionado = null; marcarSeleccion(); mostrar('crear'); }
        else mostrar(modo, { capturar: false });
        ubicacionModificada = true;
        $('instruccion-mapa').textContent = 'Ubicación seleccionada. Puedes ajustar el radio en el formulario.';
    },
    mostrarFormulario(tipo) { mostrar(tipo); },
    async seleccionarTrabajo(id, { forzar = false } = {}) {
        const registro = registros.get(id);
        if (!registro || (!forzar && (!habilitada || ocupado || cerrando || !await descartar()))) return;
        if (!forzar && (!habilitada || ocupado || cerrando)) return;
        origen = document.activeElement;
        limpiarModos(); seleccionado = id;
        renderizarDetalle(); mostrar('detalle');
    },
    iniciarListado(cantidad) {
        registros.clear(); marcadores.clear();
        $('cantidad-trabajos').textContent = String(cantidad);
    },
    registrarTrabajo(trabajo, tarjeta, cantidad) {
        tarjeta.classList.add('detalle-trabajo');
        const coordenadas = document.createElement('p');
        coordenadas.textContent = `Ubicación: ${trabajo.latitud}, ${trabajo.longitud}`;
        tarjeta.querySelector('.acciones-trabajo').before(coordenadas);
        for (const asignacion of tarjeta.querySelectorAll('.tarjeta-asignacion')) {
            const desplegable = document.createElement('details');
            desplegable.className = 'asignacion-desplegable';
            const resumen = document.createElement('summary');
            resumen.append(asignacion.querySelector('h4'), asignacion.querySelector('.etiqueta-estado'));
            const cuerpo = document.createElement('div'); cuerpo.className = 'cuerpo-asignacion';
            cuerpo.append(...asignacion.childNodes);
            desplegable.append(resumen, cuerpo); asignacion.replaceWith(desplegable);
        }
        const resumen = document.createElement('article'); resumen.className = 'elemento-empresa grid-1-5';
        const nombre = document.createElement('h3'); nombre.textContent = trabajo.nombre;
        const meta = document.createElement('p'); meta.textContent = `#${trabajo.id} · Radio ${trabajo.radio_metros} m · ${cantidad} asignación(es)`;
        const boton = document.createElement('button'); boton.type = 'button'; boton.className = 'button boton-relleno'; boton.textContent = 'Abrir punto ↗';
        boton.setAttribute('aria-pressed', 'false'); boton.addEventListener('click', () => this.seleccionarTrabajo(trabajo.id));
        resumen.append(nombre, meta, boton); registros.set(trabajo.id, { tarjeta, resumen });
        return resumen;
    },
    finalizarListado() {
        if (modo === 'detalle') {
            if (registros.has(seleccionado)) renderizarDetalle();
            else { seleccionado = null; mostrar('inicial', { enfocar: false }); }
        }
        marcarSeleccion();
    },
    registrarMarcador(id, marcador) { marcadores.set(id, marcador); marcarSeleccion(); },
    creacionRestaurada() {
        if (!reiniciando && ['crear', 'agregar'].includes(modo)) mostrar('inicial', { enfocar: false });
    },
    edicionCerrada(tipo) {
        if (!reiniciando && modo === tipo) {
            if (registros.has(seleccionado)) { renderizarDetalle(); mostrar('detalle'); }
            else mostrar('inicial', { enfocar: false });
        }
    },
    async cerrar() {
        if (ocupado || cerrando || !await descartar()) return;
        if (ocupado || cerrando) return;
        cerrando = true;
        $('panel-trabajo').inert = true;
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && $('panel-trabajo').animate) {
            await $('panel-trabajo').animate([{ opacity: 1 }, { opacity: .2 }], { duration: 140 }).finished.catch(() => {});
            if (ocupado) { cerrando = false; $('panel-trabajo').inert = false; return; }
        }
        limpiarModos(); seleccionado = null; marcarSeleccion(); mostrar('inicial', { enfocar: false });
        cerrando = false;
        $('panel-trabajo').inert = false;
        origen?.focus?.({ preventScroll: true });
    },
    ocupado(valor) {
        ocupado = valor;
        if (this.indicador) this.indicador.hidden = !valor;
        for (const form of document.querySelectorAll('#panel-trabajo form')) { form.inert = valor; form.setAttribute('aria-busy', String(valor)); }
        $('detalle-contenido').inert = valor; $('lista-trabajos').inert = valor;
        for (const id of ['cerrar-panel', 'cancelar-panel', 'nuevo-punto', 'elegir-ubicacion', 'usar-centro']) $(id).disabled = valor;
    },
    estaOcupado() { return ocupado || cerrando; },
    retirar() { habilitada = false; salidaConfirmada = true; if ($('panel-movil').open) $('panel-movil').close(); }
};
