const $ = id => document.getElementById(id);
const estados = Object.freeze({ pendiente: 'Pendiente', aceptada: 'Aceptada', rechazada: 'Rechazada', cancelada: 'Cancelada' });
const crear = (tag, clase, texto) => { const el = document.createElement(tag); el.className = clase; if (texto !== undefined) el.textContent = texto; return el; };
function fecha(valor) {
    if (!valor || !Number.isFinite(new Date(valor).getTime())) return crear('span', '', 'Fecha no disponible');
    const time = crear('time', '', new Date(valor).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })); time.dateTime = new Date(valor).toISOString(); return time;
}
function iniciales(nombre) { return nombre?.trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toLocaleUpperCase('es') || '—'; }
let iniciada = false;
let filtro = 'pendiente';
let invitaciones = [], membresias = [], empresas = [], responder, actualizar;
let ocupado = false, cargando = true, accionActual = null, resultadoDisponible = false;
let equiposDisponibles = false;

function dibujarInvitaciones() {
    const lista = $('lista-invitaciones');
    lista.replaceChildren();
    const visibles = invitaciones.filter(i => filtro === 'todas' || i.estado === filtro);
    for (const b of document.querySelectorAll('[data-filtro-invitaciones]')) {
        const estado = b.dataset.filtroInvitaciones;
        b.setAttribute('aria-pressed', String(estado === filtro));
        b.querySelector('span').textContent = resultadoDisponible ? String(estado === 'todas' ? invitaciones.length : invitaciones.filter(i => i.estado === estado).length) : '—';
    }
    $('cantidad-invitaciones').textContent = resultadoDisponible ? `${visibles.length} ${visibles.length === 1 ? 'invitación' : 'invitaciones'} ${filtro === 'todas' ? 'en tu historial' : 'en esta vista'}` : 'Consulta tus invitaciones';
    if (!resultadoDisponible) {
        const p = crear('p', 'invitaciones-vacio', cargando ? 'Consultando tus invitaciones…' : 'No se pudieron consultar tus invitaciones. Usa Actualizar para volver a intentarlo.');
        lista.append(p); return;
    }
    if (!visibles.length) {
        const vacio = crear('div', 'invitaciones-vacio');
        const icono = crear('span', 'icono-vacio', '✉'); icono.setAttribute('aria-hidden', 'true');
        const titulo = !invitaciones.length ? 'Las oportunidades llegan aquí' : filtro === 'pendiente' ? 'Estás al día' : 'Sin invitaciones en esta vista';
        const texto = !invitaciones.length ? 'Aún no tienes invitaciones. Cuando una empresa te invite a formar parte de su equipo, podrás verla aquí.' : filtro === 'pendiente' ? 'No tienes invitaciones pendientes. Puedes consultar las que ya respondiste desde los filtros.' : 'No hay invitaciones que coincidan con el estado seleccionado.';
        vacio.append(icono, crear('h3', '', titulo), crear('p', '', texto)); lista.append(vacio); return;
    }
    for (const i of visibles) {
        const card = crear('article', 'invitacion-card efecto-card'); card.dataset.invitacion = String(i.id); card.dataset.estado = i.estado;
        const borde = crear('span', 'efecto-card-borde'); borde.setAttribute('aria-hidden', 'true');
        const interior = crear('div', 'interior-invitacion');
        const cabecera = crear('div', 'identidad-invitacion');
        const avatar = crear('span', 'avatar-empresa', iniciales(i.nombre_empresa)); avatar.setAttribute('aria-hidden', 'true');
        const identidad = crear('div', 'nombre-invitacion'); identidad.append(crear('p', 'etiqueta-origen', 'INVITACIÓN DE EMPRESA'), crear('h3', '', i.nombre_empresa || 'Empresa no disponible'));
        cabecera.append(avatar, identidad);
        const estado = crear('span', 'estado-invitacion estado-' + i.estado, estados[i.estado] || 'Estado no disponible');
        const recibida = crear('p', 'fecha-invitacion'); recibida.append(crear('span', '', 'Recibida · '), fecha(i.creada_en));
        interior.append(cabecera, estado, recibida);
        const textos = { pendiente: 'Esta empresa te invita a formar parte de su equipo de trabajo.', aceptada: 'Aceptaste esta invitación. Puedes consultar tus equipos actuales en esta página.', rechazada: 'Rechazaste esta invitación. La respuesta permanece en tu historial.', cancelada: 'Esta invitación fue cancelada y ya no admite una respuesta.' };
        interior.append(crear('p', 'descripcion-invitacion', textos[i.estado] || 'Consulta el estado registrado de esta invitación.'));
        if (i.estado === 'pendiente') {
            const acciones = crear('div', 'acciones-invitacion');
            for (const [aceptar, etiqueta] of [[true, 'Aceptar invitación'], [false, 'Rechazar invitación']]) {
                const b = crear('button', 'boton-relleno ' + (aceptar ? 'aceptar-invitacion' : 'rechazar-invitacion'), etiqueta);
                b.type = 'button'; b.dataset.responder = String(aceptar);
                b.setAttribute('aria-label', `${etiqueta} de ${i.nombre_empresa || 'esta empresa'}`);
                b.addEventListener('click', () => responder?.(i.id, aceptar)); acciones.append(b);
            }
            interior.append(acciones);
        }
        card.append(borde, interior); lista.append(card);
    }
    actualizarCarga();
}
function dibujarMembresias() {
    const lista = $('lista-membresias'); lista.replaceChildren();
    if (!equiposDisponibles) { lista.append(crear('p', 'equipos-vacio', ocupado ? 'Consultando tus equipos…' : 'No se pudieron actualizar tus equipos. Vuelve a intentarlo.')); return; }
    $('cantidad-equipos').textContent = String(membresias.length);
    if (!membresias.length) { lista.append(crear('p', 'equipos-vacio', 'Todavía no perteneces a ninguna empresa. Aquí aparecerán los equipos de los que formes parte.')); return; }
    const nombres = new Map(empresas.map(e => [e.id, e.nombre]));
    for (const m of membresias) {
        const nombre = nombres.get(m.empresa_id);
        const card = crear('article', 'equipo-card');
        const avatar = crear('span', 'avatar-equipo', iniciales(nombre)); avatar.setAttribute('aria-hidden', 'true');
        const contenido = crear('div', 'datos-equipo'); contenido.append(crear('h3', '', nombre || 'Empresa no disponible'), crear('span', 'miembro-activo', 'Miembro activo'));
        if (m.alias_interno) contenido.append(crear('p', '', 'Mi alias: ' + m.alias_interno));
        const ingreso = crear('p', 'ingreso-equipo'); ingreso.append(crear('span', '', 'Ingreso · '), fecha(m.fecha_ingreso)); contenido.append(ingreso);
        card.append(avatar, contenido); lista.append(card);
    }
}
function actualizarCarga() {
    $('contenido-invitaciones').setAttribute('aria-busy', String(ocupado));
    const loader = $('carga-invitaciones'); if (loader) loader.hidden = !ocupado;
    $('actualizar-invitaciones').disabled = ocupado;
    $('actualizar-invitaciones').textContent = ocupado && !accionActual ? 'Actualizando…' : '↻ Actualizar';
    for (const b of document.querySelectorAll('[data-filtro-invitaciones]')) b.disabled = ocupado;
    for (const b of document.querySelectorAll('[data-responder]')) {
        b.disabled = ocupado;
        if (accionActual && b.closest('[data-invitacion]').dataset.invitacion === String(accionActual.id) && b.dataset.responder === String(accionActual.aceptar)) {
            b.textContent = accionActual.aceptar ? 'Aceptando…' : 'Rechazando…'; b.setAttribute('aria-busy', 'true');
        } else { b.textContent = b.dataset.responder === 'true' ? 'Aceptar invitación' : 'Rechazar invitación'; b.removeAttribute('aria-busy'); }
    }
}
export const vistaInvitaciones = {
    iniciar(acciones) {
        if (iniciada) return; iniciada = true;
        responder = acciones.responder; actualizar = acciones.actualizar;
        for (const b of document.querySelectorAll('[data-filtro-invitaciones]')) b.addEventListener('click', () => { if (ocupado) return; filtro = b.dataset.filtroInvitaciones; dibujarInvitaciones(); });
        $('actualizar-invitaciones').addEventListener('click', () => actualizar?.());
        const loader = window.MovanzaUI?.crearLoader('Consultando MOVANZA…');
        if (loader) { loader.id = 'carga-invitaciones'; $('estado-invitaciones').prepend(loader); }
    },
    presentar(datos, { equiposActualizados = true } = {}) {
        invitaciones = datos.invitaciones; membresias = datos.membresias; empresas = datos.empresas; resultadoDisponible = true; cargando = false;
        if (equiposActualizados) equiposDisponibles = true;
        dibujarInvitaciones(); dibujarMembresias();
    },
    carga(valor, accion = null) { ocupado = valor; accionActual = accion; if (!valor) cargando = false; actualizarCarga(); if (!resultadoDisponible) dibujarInvitaciones(); if (!equiposDisponibles) dibujarMembresias(); },
    informar(texto, tipo = '') { $('mensaje').textContent = texto; $('mensaje').className = tipo; $('mensaje').setAttribute('role', tipo === 'error' ? 'alert' : 'status'); },
    enfocarResultado() { $('titulo-invitaciones-recibidas').focus({ preventScroll: true }); },
    retirar() { invitaciones = []; membresias = []; empresas = []; responder = null; actualizar = null; $('lista-invitaciones').replaceChildren(); $('lista-membresias').replaceChildren(); $('mensaje').textContent = ''; }
};
