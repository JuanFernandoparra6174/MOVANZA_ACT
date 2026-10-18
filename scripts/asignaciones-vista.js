import { confirmarAccion } from './alertas.js';
const $ = id => document.getElementById(id);
const crear = (tag, clase, texto) => { const el = document.createElement(tag); el.className = clase; if (texto !== undefined) el.textContent = texto; return el; };
const coordenadasValidas = t => t && t.latitud !== null && t.longitud !== null && t.latitud !== '' && t.longitud !== '' && Number.isFinite(Number(t.latitud)) && Number.isFinite(Number(t.longitud)) && Math.abs(Number(t.latitud)) <= 90 && Math.abs(Number(t.longitud)) <= 180;
let registros = new Map(), marcadores = new Map(), seleccionado = null;
let mapa, capa, personal, precision, acciones = {}, ocupada = false, retirada = false, iniciada = false, encuadrado = false;
let origenFormulario, instantanea = '', formularioActivo = null;
const reducido = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
function iniciarMapa() {
    if (mapa || retirada) return;
    if (typeof L === 'undefined') { $('error-mapa').hidden = false; $('error-mapa').textContent = 'El mapa no pudo cargarse. Puedes usar la lista y volver a intentar con «Ver trabajos».'; return; }
    try {
        mapa = L.map('mapa-asignaciones').setView([0, 0], 2);
        const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(mapa);
        tiles.on?.('tileerror', () => { if (!retirada) { $('error-mapa').hidden = false; $('error-mapa').textContent = 'No se pudo cargar el fondo del mapa. Comprueba tu conexión; la lista sigue disponible.'; } });
        capa = L.featureGroup().addTo(mapa);
        $('error-mapa').hidden = true;
    } catch { mapa?.remove(); mapa = null; $('error-mapa').hidden = false; $('error-mapa').textContent = 'No se pudo abrir el mapa. Puedes continuar desde la lista.'; }
}
function resaltar() {
    for (const [id, r] of registros) { r.card.classList.toggle('seleccionada', id === seleccionado); r.boton.setAttribute('aria-pressed', String(id === seleccionado)); }
    const trabajoId = registros.get(seleccionado)?.trabajo?.id;
    for (const [id, m] of marcadores) { m.getElement?.()?.classList.toggle('punto-seleccionado', id === trabajoId); m.setZIndexOffset?.(id === trabajoId ? 1000 : 0); }
}
function seleccionar(id, { centrar = true, enfocar = true } = {}) {
    if (ocupada || retirada) return;
    const r = registros.get(id); if (!r) return;
    seleccionado = id;
    $('contenido-detalle').replaceChildren(r.detalle);
    $('cerrar-detalle').hidden = false;
    resaltar();
    if (centrar && mapa && coordenadasValidas(r.trabajo)) {
        mapa.setView([Number(r.trabajo.latitud), Number(r.trabajo.longitud)], 17, { animate: !reducido() });
        marcadores.get(r.trabajo.id)?.openPopup();
    }
    if (enfocar) {
        $('titulo-detalle').focus({ preventScroll: true });
        if (window.matchMedia?.('(max-width: 800px)').matches) $('contenido-detalle').scrollIntoView({ behavior: reducido() ? 'auto' : 'smooth', block: 'nearest' });
    }
}
function cerrarDetalle() {
    const anterior = seleccionado; seleccionado = null;
    $('contenido-detalle').replaceChildren(crear('p', 'detalle-vacio', 'Selecciona una actividad para consultar sus detalles y acciones.'));
    $('cerrar-detalle').hidden = true; resaltar(); registros.get(anterior)?.boton.focus({ preventScroll: true });
}
function dibujar() {
    if (!mapa || retirada) return;
    capa.clearLayers(); marcadores.clear();
    const grupos = new Map();
    for (const r of registros.values()) if (coordenadasValidas(r.trabajo)) {
        if (!grupos.has(r.trabajo.id)) grupos.set(r.trabajo.id, []);
        grupos.get(r.trabajo.id).push(r);
    }
    for (const [id, filas] of grupos) {
        const { trabajo, empresa } = filas[0], centro = [Number(trabajo.latitud), Number(trabajo.longitud)];
        const popup = crear('div', 'popup-asignaciones');
        popup.append(crear('strong', '', trabajo.nombre), crear('p', '', empresa?.nombre || 'Empresa no disponible'));
        const radio = Number(trabajo.radio_metros);
        if (Number.isFinite(radio) && radio > 0) {
            L.circle(centro, { radius: radio, color: '#5f4d93', fillColor: '#a89cc8', fillOpacity: .12, weight: 2 }).addTo(capa);
            popup.append(crear('p', '', `Radio autorizado: ${radio} m`));
        }
        for (const r of filas) {
            const b = crear('button', '', `${r.asignacion.titulo} · ${r.estado}`); b.type = 'button';
            b.addEventListener('click', () => seleccionar(r.asignacion.id, { centrar: false })); popup.append(b);
        }
        const icon = L.divIcon({ className: 'pin-trabajo', html: '<span aria-hidden="true">⌖</span>', iconSize: [36, 36], iconAnchor: [18, 18] });
        const marcador = L.marker(centro, { icon, title: trabajo.nombre, alt: 'Trabajo: ' + trabajo.nombre }).addTo(capa).bindPopup(popup);
        marcador.on('click', () => seleccionar(filas.find(r => r.asignacion.id === seleccionado)?.asignacion.id ?? filas[0].asignacion.id, { centrar: false }));
        marcadores.set(id, marcador);
    }
    if (!encuadrado && marcadores.size) { mapa.fitBounds(capa.getBounds(), { padding: [32, 32], maxZoom: 16, animate: false }); encuadrado = true; }
    resaltar();
}
function valores() { const f = formularioActivo && $('formulario-' + formularioActivo); return f ? JSON.stringify([...f.querySelectorAll('input, textarea, select')].map(el => el.value)) : ''; }
export const vistaAsignaciones = {
    conectar(nuevasAcciones) { acciones = nuevasAcciones; },
    iniciar() {
        if (iniciada) return; iniciada = true; retirada = false;
        iniciarMapa();
        $('cerrar-detalle').addEventListener('click', () => { if (!ocupada) cerrarDetalle(); });
        $('ubicarme').addEventListener('click', () => acciones.ubicar?.());
        $('ver-puntos').addEventListener('click', () => { if (!mapa) { iniciarMapa(); dibujar(); this.ocupado(ocupada); } if (marcadores.size) mapa.fitBounds(capa.getBounds(), { padding: [32, 32], maxZoom: 16, animate: !reducido() }); });
        $('cerrar-accion').addEventListener('click', () => { if (!ocupada && formularioActivo) $('boton-cancelar-' + formularioActivo).click(); });
        $('acciones-asignacion').addEventListener('cancel', e => { e.preventDefault(); if (!ocupada && formularioActivo) $('boton-cancelar-' + formularioActivo).click(); });
        const loader = window.MovanzaUI?.crearLoader('Procesando tu actividad…');
        if (loader) { loader.id = 'carga-asignaciones'; $('estado-operacion').prepend(loader); }
    },
    activar() {
        mapa?.invalidateSize({ pan: false });
        if (mapa && marcadores.size) mapa.fitBounds(capa.getBounds(), { padding: [32, 32], maxZoom: 16, animate: false });
    },
    iniciarListado() { registros = new Map(); },
    registrar({ asignacion, trabajo, empresa, detalle, estado, fecha }) {
        if (trabajo && Number.isFinite(Number(trabajo.radio_metros)) && Number(trabajo.radio_metros) > 0 && ['aceptada', 'en_curso'].includes(asignacion.estado)) {
            detalle.insertBefore(crear('p', 'ayuda-gps-detalle', `Para iniciar o finalizar se solicita una posición nueva. Precisión máxima: ${Math.min(Number(trabajo.radio_metros), 50)} m. El servidor valida el radio y el margen de precisión.`), detalle.querySelector('.acciones-trabajo'));
        }
        const card = crear('article', 'asignacion-card');
        const boton = crear('button', 'seleccionar-asignacion'); boton.type = 'button'; boton.dataset.asignacion = String(asignacion.id);
        boton.append(crear('span', 'etiqueta-estado estado-' + asignacion.estado, estado), crear('strong', 'nombre-punto', trabajo?.nombre || 'Trabajo no disponible'), crear('span', 'titulo-tarea', asignacion.titulo), crear('span', 'empresa-tarea', empresa?.nombre || 'Empresa no disponible'), crear('span', 'fecha-tarea', fecha));
        if (!coordenadasValidas(trabajo)) boton.append(crear('span', 'sin-coordenadas', 'Ubicación no disponible'));
        boton.append(crear('span', 'abrir-detalle', 'Consultar actividad ↗'));
        boton.addEventListener('click', () => seleccionar(asignacion.id)); card.append(boton);
        registros.set(asignacion.id, { asignacion, trabajo, empresa, detalle, estado, card, boton });
        $('lista-asignaciones').append(card);
    },
    finalizarListado() {
        if (retirada) return;
        $('cantidad-visibles').textContent = `${registros.size} ${registros.size === 1 ? 'actividad disponible' : 'actividades disponibles'}`;
        if (seleccionado !== null) {
            if (registros.has(seleccionado)) $('contenido-detalle').replaceChildren(registros.get(seleccionado).detalle);
            else cerrarDetalle();
        }
        dibujar();
        this.ocupado(ocupada);
    },
    ocupado(valor) {
        ocupada = valor;
        $('espacio-asignaciones')?.setAttribute('aria-busy', String(valor));
        $('estado-operacion').setAttribute('aria-busy', String(valor));
        if ($('carga-asignaciones')) $('carga-asignaciones').hidden = !valor;
        document.querySelectorAll('#contenido-detalle button, .seleccionar-asignacion, #ubicarme, #cerrar-accion, #buscar-asignaciones, #filtro-estado').forEach(b => { b.disabled = valor; });
        $('ubicarme').disabled = valor || !mapa;
    },
    estaOcupada: () => ocupada,
    formulario(tipo) {
        formularioActivo = tipo; origenFormulario = document.activeElement; instantanea = valores();
        $('estado-en-formulario').append($('estado-operacion'));
        $('acciones-asignacion').showModal();
        $(tipo === 'rechazo' ? 'motivo-rechazo' : 'objetivo-cumplido').focus();
    },
    confirmarDescarte() { return !ocupada && (valores() === instantanea || confirmarAccion({ titulo: 'Cambios sin guardar', mensaje: '¿Descartar los datos de este formulario?', textoConfirmar: 'Descartar datos', destructiva: true })); },
    cerrarFormulario() {
        if (!$('acciones-asignacion').open) return;
        $('acciones-asignacion').close(); formularioActivo = null;
        $('anclaje-estado').append($('estado-operacion'));
        if (origenFormulario?.isConnected) origenFormulario.focus({ preventScroll: true });
        else $('titulo-detalle').focus({ preventScroll: true });
    },
    ubicacion(gps, centrar = false) {
        if (!mapa || retirada || !coordenadasValidas(gps)) return;
        if (personal) mapa.removeLayer(personal);
        if (precision) mapa.removeLayer(precision);
        const centro = [gps.latitud, gps.longitud];
        precision = L.circle(centro, { radius: gps.precision_metros, color: '#216b99', dashArray: '5 5', weight: 1, fillColor: '#8cc9f0', fillOpacity: .18 }).addTo(mapa);
        personal = L.marker(centro, { icon: L.divIcon({ className: 'pin-personal', html: '<span aria-hidden="true"></span>', iconSize: [22, 22] }), title: 'Mi ubicación', alt: 'Mi ubicación' }).addTo(mapa).bindPopup(crear('p', '', `Mi ubicación · precisión estimada ${gps.precision_metros.toFixed(1)} m. Posición consultada, sin seguimiento continuo.`));
        if (centrar) mapa.setView(centro, 17, { animate: !reducido() });
    },
    retirar() { retirada = true; this.cerrarFormulario(); mapa?.remove(); mapa = null; registros.clear(); marcadores.clear(); $('contenido-detalle').replaceChildren(); $('lista-asignaciones').replaceChildren(); },
    vigente: () => !retirada
};
