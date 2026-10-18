import { crearMensajeria } from './mensajes.js';

// Presentación reutilizable: conserva mensajes por asignación y la RPC existente.
export function montarMensajeria({ anfitrion, empresa = null, perfil, contextoVigente = () => true }) {
    if (!['empresa', 'trabajador'].includes(perfil.rol) || (perfil.rol === 'empresa' && !empresa)) return null;
    const existente = anfitrion.querySelector('.mensajeria-integrada');
    if (existente) return existente.controlMensajeria;
    const raiz = document.createElement('div');
    raiz.className = 'mensajeria-integrada';
    raiz.innerHTML = `
        <button class="chatBtn" id="abrir-mensajeria" type="button" aria-label="Abrir mensajes" aria-controls="panel-mensajeria" aria-expanded="false">
            <svg height="1.6em" fill="currentColor" viewBox="0 0 1000 1000" aria-hidden="true"><path d="M881.1,720.5H434.7L173.3,941V720.5h-54.4C58.8,720.5,10,671.1,10,610.2v-441C10,108.4,58.8,59,118.9,59h762.2C941.2,59,990,108.4,990,169.3v441C990,671.1,941.2,720.5,881.1,720.5z M935.6,169.3c0-30.4-24.4-55.2-54.5-55.2H118.9c-30.1,0-54.5,24.7-54.5,55.2v441c0,30.4,24.4,55.1,54.5,55.1h108.8v110.3l163.3-110.2h490.1c30.1,0,54.5-24.7,54.5-55.1V169.3z M717.8,444.8c-30.1,0-54.4-24.7-54.4-55.1s24.3-55.2,54.4-55.2,54.5,24.7,54.5,55.2S747.8,444.8,717.8,444.8z M500,444.8c-30.1,0-54.4-24.7-54.4-55.1s24.3-55.2,54.4-55.2,54.4,24.7,54.4,55.2S530.1,444.8,500,444.8z M282.2,444.8c-30.1,0-54.5-24.7-54.5-55.1s24.4-55.2,54.5-55.2,54.4,24.7,54.4,55.2S312.3,444.8,282.2,444.8z"/></svg>
            <span class="tooltip" aria-hidden="true">Mensajes</span>
        </button>
        <section id="panel-mensajeria" class="panel-mensajeria card-container" role="dialog" aria-modal="false" aria-labelledby="titulo-mensajeria" tabindex="-1" inert data-vista="lista">
            <div class="cabecera-mensajeria"><div><p class="chat-antetitulo">MOVANZA · MENSAJES</p><h2 id="titulo-mensajeria">Tu operación, conectada</h2><p id="empresa-mensajeria"></p></div><button id="cerrar-mensajeria" type="button" class="chat-icono" aria-label="Cerrar mensajes">×</button></div>
            <div class="distribucion-chat">
                <aside class="conversaciones-chat" aria-label="Trabajos y conversaciones">
                    <div class="herramientas-chat"><div class="titulo-lista-chat"><h3>Trabajos</h3><button id="boton-actualizar-conversaciones" type="button" class="chat-icono" aria-label="Actualizar conversaciones" title="Actualizar conversaciones">↻</button></div><label for="filtro-conversaciones">Buscar conversación</label><input id="filtro-conversaciones" type="search" placeholder="Trabajo o asignación" autocomplete="off"></div>
                    <div id="lista-conversaciones" class="lista-conversaciones"><p>Abre mensajes para consultar tus conversaciones.</p></div>
                    <p class="usuario-chat">Conectado como <span id="usuario-actual"></span></p>
                </aside>
                <div class="zona-conversacion">
                    <div id="bienvenida-chat" class="bienvenida-chat"><span aria-hidden="true">↗</span><h3>Cada trabajo, en conversación</h3><p>Elige un trabajo y su asignación para consultar el historial o enviar un mensaje.</p></div>
                    <section id="seccion-conversacion" class="card-body oculto" aria-label="Conversación seleccionada">
                        <div class="card-header"><button id="volver-conversaciones" type="button" class="chat-icono" aria-label="Volver a los trabajos">←</button><div class="img-avatar" aria-hidden="true">T</div><div class="text-chat"><h3 id="trabajo-conversacion"></h3><p id="titulo-conversacion"></p><p class="estado-asignacion-chat"><span id="estado-conversacion"></span> · #<span id="id-conversacion"></span></p></div><button id="boton-actualizar-mensajes" class="chat-icono" type="button" aria-label="Actualizar mensajes" title="Actualizar mensajes">↻</button><span id="empresa-conversacion" hidden></span></div>
                        <div id="historial-mensajes" class="messages-container" role="region" aria-label="Historial de mensajes" tabindex="0"></div>
                        <div class="message-input"><form id="formulario-mensaje"><label for="contenido-mensaje">Escribe un mensaje</label><div class="redactor-chat"><textarea id="contenido-mensaje" class="message-send" rows="2" minlength="1" maxlength="4000" placeholder="Escribe aquí…" required></textarea><button id="boton-enviar-mensaje" class="button-send" type="submit" aria-label="Enviar mensaje"><span>Enviar</span><span aria-hidden="true">↗</span></button></div></form></div>
                    </section>
                </div>
            </div>
            <div class="estado-mensajeria"><p id="mensaje" role="status" aria-live="polite"></p></div>
        </section>`;
    anfitrion.append(raiz);
    const $ = id => raiz.querySelector('#' + id);
    const panel = $('panel-mensajeria'), boton = $('abrir-mensajeria');
    panel.inert = true;
    $('empresa-mensajeria').textContent = empresa?.nombre || 'Tus trabajos y conversaciones';
    const expanded = new Set(), listeners = [], inertes = new Map();
    let abierto = false, iniciado = false, destruido = false;
    const vigente = () => !destruido && contextoVigente();
    const escuchar = (elemento, evento, accion) => { elemento.addEventListener(evento, accion); listeners.push(() => elemento.removeEventListener(evento, accion)); };
    const crear = (tag, clase, texto) => { const el = document.createElement(tag); el.className = clase; if (texto !== undefined) el.textContent = texto; return el; };
    const loader = window.MovanzaUI?.crearLoader('Cargando…');
    if (loader) raiz.querySelector('.estado-mensajeria').prepend(loader);
    function adaptarModal() {
        const pequeno = window.matchMedia?.('(max-width: 700px)').matches;
        const modal = abierto && pequeno;
        // El teclado puede reducir solo el viewport visual en teléfonos.
        if (pequeno && window.visualViewport) {
            panel.style.height = window.visualViewport.height + 'px';
            panel.style.top = window.visualViewport.offsetTop + 'px';
        } else { panel.style.removeProperty('height'); panel.style.removeProperty('top'); }
        panel.setAttribute('aria-modal', String(Boolean(modal)));
        if (modal) {
            for (const elemento of anfitrion.children) if (elemento !== raiz && !inertes.has(elemento)) { inertes.set(elemento, elemento.inert); elemento.inert = true; }
        } else { for (const [el, valor] of inertes) el.inert = valor; inertes.clear(); }
    }
    const vista = {
        carga({ ocupado, historial }) {
            if (loader) loader.hidden = !(ocupado || historial);
            panel.setAttribute('aria-busy', String(ocupado || historial));
            $('boton-enviar-mensaje').classList.toggle('enviando', ocupado);
        },
        conversaciones({ asignaciones, trabajos, seleccionada, abrir, estado, ocupado }) {
            const lista = $('lista-conversaciones'); lista.replaceChildren();
            const grupos = new Map();
            for (const a of asignaciones) { if (!grupos.has(a.trabajo_id)) grupos.set(a.trabajo_id, []); grupos.get(a.trabajo_id).push(a); }
            if (!grupos.size) { lista.append(crear('p', 'chat-vacio', $('filtro-conversaciones').value.trim() ? 'No se encontraron conversaciones para esta búsqueda.' : (perfil.rol === 'trabajador' ? 'No tienes trabajos con conversaciones disponibles.' : 'No hay asignaciones disponibles para conversar en esta empresa.'))); return; }
            for (const [id, filas] of grupos) {
                const trabajo = trabajos.find(t => t.id === id);
                const seleccionado = filas.some(a => a.id === seleccionada);
                const grupo = crear('div', 'grupo-trabajo' + (seleccionado ? ' seleccionado' : ''));
                const abrirGrupo = crear('button', 'trabajo-chat'); abrirGrupo.type = 'button'; abrirGrupo.disabled = ocupado;
                abrirGrupo.dataset.trabajo = String(id);
                const avatar = crear('span', 'img-avatar', trabajo.nombre.slice(0, 1).toLocaleUpperCase('es')); avatar.setAttribute('aria-hidden', 'true');
                const nombre = crear('span', 'resumen-trabajo'); nombre.append(crear('strong', '', trabajo.nombre), crear('small', '', filas.length === 1 ? filas[0].titulo : `${filas.length} asignaciones`));
                abrirGrupo.append(avatar, nombre, crear('span', 'flecha-chat', '›'));
                grupo.append(abrirGrupo);
                if (filas.length === 1) {
                    abrirGrupo.setAttribute('aria-pressed', String(seleccionado));
                    abrirGrupo.addEventListener('click', () => abrir(filas[0].id));
                } else {
                    const sublista = crear('div', 'asignaciones-chat'); sublista.id = 'asignaciones-chat-' + id;
                    sublista.hidden = !(expanded.has(id) || seleccionado);
                    abrirGrupo.setAttribute('aria-expanded', String(!sublista.hidden)); abrirGrupo.setAttribute('aria-controls', sublista.id);
                    abrirGrupo.addEventListener('click', () => { sublista.hidden = !sublista.hidden; if (sublista.hidden) expanded.delete(id); else expanded.add(id); abrirGrupo.setAttribute('aria-expanded', String(!sublista.hidden)); });
                    for (const a of filas) {
                        const opcion = crear('button', 'asignacion-chat'); opcion.type = 'button'; opcion.disabled = ocupado;
                        opcion.dataset.asignacion = String(a.id); opcion.setAttribute('aria-pressed', String(a.id === seleccionada));
                        opcion.append(crear('strong', '', a.titulo), crear('small', '', `${estado(a.estado)} · #${a.id}`));
                        opcion.addEventListener('click', () => abrir(a.id)); sublista.append(opcion);
                    }
                    grupo.append(sublista);
                }
                lista.append(grupo);
            }
        },
        seleccion({ trabajo, restaurar }) {
            $('bienvenida-chat').hidden = true;
            if (!restaurar) panel.dataset.vista = 'conversacion';
            raiz.querySelector('.card-header .img-avatar').textContent = trabajo.nombre.slice(0, 1).toLocaleUpperCase('es');
            // El foco abandona la lista que se oculta en móviles y llega al encabezado.
            $('trabajo-conversacion').tabIndex = -1;
            if (!restaurar) (window.matchMedia?.('(max-width: 700px)').matches ? $('volver-conversaciones') : $('trabajo-conversacion')).focus({ preventScroll: true });
        },
        cerrarConversacion() { $('bienvenida-chat').hidden = false; panel.dataset.vista = 'lista'; }
    };
    const mensajeria = crearMensajeria({ raiz, empresaId: perfil.rol === 'empresa' ? empresa.id : null, perfilInicial: perfil, vista, contextoVigente: vigente });
    function cerrar() {
        abierto = false; raiz.classList.remove('abierta'); panel.inert = true;
        boton.setAttribute('aria-expanded', 'false'); boton.setAttribute('aria-label', 'Abrir mensajes');
        adaptarModal(); if (vigente()) boton.focus({ preventScroll: true });
    }
    async function abrirPanel() {
        if (!vigente()) { destruir(); return; }
        abierto = true; raiz.classList.add('abierta'); panel.inert = false;
        boton.setAttribute('aria-expanded', 'true'); boton.setAttribute('aria-label', 'Cerrar mensajes');
        adaptarModal(); $('cerrar-mensajeria').focus({ preventScroll: true });
        if (!iniciado) { iniciado = true; await mensajeria.iniciar(); }
    }
    function destruir() {
        if (destruido) return;
        abierto = false; adaptarModal(); destruido = true; mensajeria.destruir(); listeners.forEach(quitar => quitar()); raiz.remove();
    }
    escuchar(boton, 'click', () => { if (abierto) cerrar(); else abrirPanel(); });
    escuchar($('cerrar-mensajeria'), 'click', cerrar);
    escuchar($('volver-conversaciones'), 'click', () => { panel.dataset.vista = 'lista'; $('filtro-conversaciones').focus({ preventScroll: true }); });
    escuchar(document, 'keydown', evento => {
        if (!abierto || evento.defaultPrevented) return;
        if (evento.key === 'Escape' && (panel.contains(document.activeElement) || document.activeElement === boton)) { evento.preventDefault(); cerrar(); }
        if (evento.key === 'Tab' && panel.getAttribute('aria-modal') === 'true') {
            const controles = [...panel.querySelectorAll('*')].filter(el => el.matches('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]') && !el.closest('[hidden], .oculto') && (panel.dataset.vista !== 'conversacion' || !el.closest('.conversaciones-chat')) && (panel.dataset.vista !== 'lista' || !el.closest('.zona-conversacion')));
            const primero = controles[0], ultimo = controles.at(-1);
            if (evento.shiftKey && document.activeElement === primero) { evento.preventDefault(); ultimo?.focus(); }
            else if (!evento.shiftKey && document.activeElement === ultimo) { evento.preventDefault(); primero?.focus(); }
        }
    });
    escuchar(window, 'resize', adaptarModal);
    if (window.visualViewport) {
        escuchar(window.visualViewport, 'resize', adaptarModal);
        escuchar(window.visualViewport, 'scroll', adaptarModal);
    }
    escuchar(raiz, 'click', () => { if (!vigente()) destruir(); });
    escuchar(window, 'focus', () => { if (!vigente()) destruir(); });
    escuchar(window, 'pagehide', destruir);
    const control = { abrir: abrirPanel, cerrar, destruir };
    raiz.controlMensajeria = control;
    return control;
}
