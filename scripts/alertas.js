// Card original: recursos/card_alerta, Uiverse.io / dylanharriscameron.
// Una instancia y una cola por ventana superior del mismo origen, también en Login modal.
function anfitrion() {
    try { if (window.top?.document?.body && window.top.location.origin === window.location.origin) return window.top; } catch {}
    return window;
}
const tipos = {
    exito: ['Operación completada', '✓'], error: ['No se pudo completar', '!'],
    advertencia: ['Revisa esta información', '!'], informacion: ['Información', 'i'],
    confirmacion: ['Confirma tu decisión', '?'], entrada: ['Completa la información', '↗']
};
function servicio() {
    const win = anfitrion();
    if (win.__movanzaAlertas) return win.__movanzaAlertas;
    const doc = win.document;
    const estilo = doc.createElement('link'); estilo.rel = 'stylesheet';
    estilo.href = import.meta.url ? new win.URL('../estilos/alertas.css', import.meta.url).href : (document.querySelector('link[href*="estilos/general.css"]')?.href.replace('general.css', 'alertas.css') || '/estilos/alertas.css');
    if (!doc.querySelector('link[data-estilo-alertas], link[href$="/alertas.css"]')) doc.head.append(estilo);
    const dialogo = doc.createElement('dialog');
    dialogo.id = 'movanza-alerta'; dialogo.className = 'movanza-alerta';
    dialogo.setAttribute('aria-labelledby', 'movanza-alerta-titulo'); dialogo.setAttribute('aria-describedby', 'movanza-alerta-mensaje');
    dialogo.innerHTML = `<div class="alerta-card"><div class="alerta-blob" aria-hidden="true"></div><div class="alerta-bg"></div><div class="alerta-contenido"><button type="button" class="alerta-cerrar" aria-label="Cerrar aviso">×</button><p class="alerta-marca">MOVANZA · CONTIGO EN CADA PASO</p><span class="alerta-icono" aria-hidden="true"></span><h2 id="movanza-alerta-titulo"></h2><p id="movanza-alerta-mensaje"></p><form novalidate><div class="alerta-campo" hidden><label for="movanza-alerta-entrada"></label><input id="movanza-alerta-entrada" autocomplete="off" aria-describedby="movanza-alerta-validacion"><p id="movanza-alerta-validacion" role="status"></p></div><div class="alerta-acciones"><button type="button" class="alerta-cancelar">Cancelar</button><button type="submit" class="alerta-confirmar">Entendido</button></div></form></div></div>`;
    doc.body.append(dialogo);
    const $ = s => dialogo.querySelector(s);
    let actual = null, cerrando = false, validando = false;
    const cola = [], inertes = new Map();
    const cancelado = item => item.tipo === 'entrada' ? null : false;
    const visible = fuente => !fuente || (fuente.isConnected && !fuente.closest('[hidden], .oculto') && (!fuente.closest('dialog') || fuente.closest('dialog').open));
    const contextoDisponible = item => visible(item.fuente) && visible(item.origenDocumento?.defaultView?.frameElement) && (!item.vigente || item.vigente());
    function ajustarViewport() {
        if (!actual || !win.visualViewport) return;
        const viewport = win.visualViewport;
        const alto = Math.max(120, viewport.height - 24);
        dialogo.style.maxHeight = alto + 'px';
        dialogo.style.top = (viewport.offsetTop + Math.max(12, (viewport.height - Math.min(dialogo.scrollHeight, alto)) / 2)) + 'px';
        dialogo.style.bottom = 'auto'; dialogo.style.margin = '0 auto';
        if (doc.activeElement === $('#movanza-alerta-entrada')) doc.activeElement.scrollIntoView?.({ block: 'nearest' });
    }
    function restaurarFoco(item) {
        if (item.origen?.isConnected && !item.origen.closest('[hidden], .oculto') && (!item.origen.closest('dialog') || item.origen.closest('dialog').open)) item.origen.focus({ preventScroll: true });
        else {
            const padre = [...doc.querySelectorAll('dialog[open]')].filter(d => d !== dialogo).at(-1);
            padre?.querySelector('button:not(:disabled), input, [tabindex]')?.focus({ preventScroll: true });
        }
    }
    function siguiente() {
        if (actual || cerrando) return;
        while (cola.length) {
            const item = cola.shift();
            if (!contextoDisponible(item)) { item.resolver(cancelado(item)); continue; }
            actual = item; break;
        }
        if (!actual) return;
        const item = actual;
        dialogo.dataset.tipo = item.tipo; dialogo.dataset.destructiva = String(Boolean(item.destructiva));
        dialogo.setAttribute('role', ['error', 'advertencia', 'confirmacion'].includes(item.tipo) ? 'alertdialog' : 'dialog');
        $('#movanza-alerta-titulo').textContent = item.titulo || tipos[item.tipo][0];
        $('#movanza-alerta-mensaje').textContent = item.mensaje || '';
        $('.alerta-icono').textContent = tipos[item.tipo][1];
        $('.alerta-cancelar').hidden = !['confirmacion', 'entrada'].includes(item.tipo);
        $('.alerta-cancelar').textContent = item.textoCancelar || 'Cancelar';
        $('.alerta-confirmar').textContent = item.textoConfirmar || (item.tipo === 'confirmacion' ? 'Confirmar' : item.tipo === 'entrada' ? 'Continuar' : 'Entendido');
        $('.alerta-campo').hidden = item.tipo !== 'entrada';
        $('#movanza-alerta-validacion').textContent = '';
        const campo = $('#movanza-alerta-entrada');
        campo.value = item.valorInicial ?? ''; campo.type = item.tipoCampo || 'text';
        campo.required = Boolean(item.requerido);
        for (const [prop, valor] of [['minlength', item.minLength], ['maxlength', item.maxLength], ['pattern', item.patron]]) {
            if (valor !== undefined) campo.setAttribute(prop, String(valor)); else campo.removeAttribute(prop);
        }
        campo.placeholder = item.placeholder || '';
        $('.alerta-campo label').textContent = item.etiqueta || 'Información';
        for (const el of doc.body.children) if (el !== dialogo) { inertes.set(el, el.inert); el.inert = true; }
        if (typeof dialogo.showModal === 'function') dialogo.showModal(); else dialogo.open = true;
        (item.tipo === 'confirmacion' || item.destructiva ? $('.alerta-cancelar') : item.tipo === 'entrada' ? campo : $('.alerta-confirmar')).focus({ preventScroll: true });
        ajustarViewport();
    }
    async function terminar(valor) {
        if (!actual || cerrando || validando) return;
        cerrando = true;
        const item = actual;
        dialogo.classList.add('alerta-saliendo');
        if (dialogo.animate && !win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
            await dialogo.animate([{ opacity: 1, transform: 'translateY(0) scale(1)' }, { opacity: 0, transform: 'translateY(8px) scale(.97)' }], { duration: 150, easing: 'ease-in' }).finished.catch(() => {});
        }
        for (const [el, valorAnterior] of inertes) if (el.isConnected) el.inert = valorAnterior;
        inertes.clear();
        if (typeof dialogo.close === 'function') dialogo.close(); else dialogo.open = false;
        dialogo.classList.remove('alerta-saliendo');
        $('#movanza-alerta-entrada').value = '';
        actual = null; cerrando = false;
        restaurarFoco(item);
        item.resolver(contextoDisponible(item) ? valor : cancelado(item));
        siguiente();
    }
    $('.alerta-cancelar').addEventListener('click', () => terminar(cancelado(actual || {})));
    $('.alerta-cerrar').addEventListener('click', () => terminar(cancelado(actual || {})));
    dialogo.addEventListener('cancel', e => { e.preventDefault(); e.stopPropagation(); terminar(cancelado(actual || {})); });
    dialogo.addEventListener('click', e => e.stopPropagation());
    dialogo.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key !== 'Tab') return;
        const controles = [...dialogo.querySelectorAll('button, input')].filter(b => !b.disabled && !b.closest('[hidden]'));
        const primero = controles[0], ultimo = controles.at(-1);
        if (e.shiftKey && doc.activeElement === primero) { e.preventDefault(); ultimo?.focus(); }
        else if (!e.shiftKey && doc.activeElement === ultimo) { e.preventDefault(); primero?.focus(); }
    });
    $('form').addEventListener('submit', async e => {
        e.preventDefault();
        e.stopPropagation();
        if (!actual || cerrando || validando) return;
        const item = actual;
        let valor = true;
        if (item.tipo === 'entrada') {
            const campo = $('#movanza-alerta-entrada');
            valor = campo.value;
            let error = campo.checkValidity() ? '' : campo.validationMessage;
            if (!error && item.requerido && !valor.trim()) error = 'Completa este campo.';
            if (!error && item.validar) {
                validando = true; dialogo.setAttribute('aria-busy', 'true');
                dialogo.querySelectorAll('button, input').forEach(b => { b.disabled = true; });
                try { error = await item.validar(valor) || ''; } catch { error = 'No se pudo validar la información. Vuelve a intentarlo.'; }
                finally { validando = false; dialogo.setAttribute('aria-busy', 'false'); dialogo.querySelectorAll('button, input').forEach(b => { b.disabled = false; }); }
            }
            if (!contextoDisponible(item)) { terminar(cancelado(item)); return; }
            if (error) { $('#movanza-alerta-validacion').textContent = error; campo.focus(); return; }
        }
        terminar(valor);
    });
    // Si se retira la página o el formulario de origen, nunca se acepta una decisión obsoleta.
    const vigilar = new win.MutationObserver(() => { if (actual && !contextoDisponible(actual) && !validando) terminar(cancelado(actual)); });
    vigilar.observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'open', 'class'] });
    win.visualViewport?.addEventListener('resize', ajustarViewport);
    win.visualViewport?.addEventListener('scroll', ajustarViewport);
    const api = { pedir(opciones) {
        const clave = opciones.clave || `${opciones.tipo}|${opciones.titulo || ''}|${opciones.mensaje || ''}`;
        const duplicada = [actual, ...cola].find(item => item?.clave === clave);
        // Solo el primer llamador puede continuar una confirmación repetida.
        if (duplicada) return ['confirmacion', 'entrada'].includes(opciones.tipo) ? Promise.resolve(cancelado(opciones)) : duplicada.promesa;
        const origenDocumento = opciones.documentoOrigen || doc;
        const origen = origenDocumento.activeElement?.closest('#movanza-alerta') ? (actual?.origen || origenDocumento.body) : origenDocumento.activeElement;
        const item = { ...opciones, clave, origenDocumento, origen, fuente: opciones.fuente || origen };
        item.promesa = new Promise(resolver => { item.resolver = resolver; });
        cola.push(item); siguiente(); return item.promesa;
    } };
    win.__movanzaAlertas = api;
    return api;
}
export function mostrarAlerta(opciones = {}) {
    if (typeof opciones === 'string') opciones = { mensaje: opciones };
    return servicio().pedir({ ...opciones, documentoOrigen: document, tipo: ['exito', 'error', 'advertencia', 'informacion'].includes(opciones.tipo) ? opciones.tipo : 'informacion' });
}
export function confirmarAccion(opciones = {}) {
    if (typeof opciones === 'string') opciones = { mensaje: opciones };
    return servicio().pedir({ ...opciones, documentoOrigen: document, tipo: 'confirmacion' });
}
export function solicitarTexto(opciones = {}) {
    if (opciones.tipoCampo && !['text', 'email', 'tel', 'url', 'number', 'search'].includes(opciones.tipoCampo)) return Promise.reject(new Error('Este componente no solicita credenciales ni información sensible.'));
    return servicio().pedir({ ...opciones, documentoOrigen: document, tipo: 'entrada' });
}
export function observarResultados(doc = document) {
    if (doc.__movanzaResultados || !doc.body) return;
    const vistos = new WeakMap();
    const revisar = () => {
        for (const nodo of doc.querySelectorAll('[role="alert"], [role="status"], #mensaje.error, #mensaje.exito')) {
            if (nodo.closest('#movanza-alerta')) continue;
            const texto = nodo.textContent.trim();
            const tipo = nodo.classList.contains('exito') || (/perfil-estado/.test(nodo.className) && /actualizado correctamente/.test(texto)) ? 'exito' : nodo.classList.contains('error') || nodo.getAttribute('role') === 'alert' ? 'error' : null;
            const clave = tipo ? `${tipo}|${texto}` : '';
            if (!texto || !tipo) { vistos.set(nodo, ''); continue; }
            if (nodo.closest('[hidden], .oculto') || (nodo.closest('dialog') && !nodo.closest('dialog').open)) continue;
            if (vistos.get(nodo) === clave) continue;
            vistos.set(nodo, clave);
            const gps = tipo === 'error' && /GPS|radio|precisi[oó]n|permiso de ubicaci[oó]n|fuera del [aá]rea/i.test(texto);
            void mostrarAlerta({ tipo: gps ? 'advertencia' : tipo, titulo: gps ? 'Revisa tu ubicación' : undefined, mensaje: texto, fuente: nodo });
        }
    };
    const observador = new doc.defaultView.MutationObserver(revisar);
    observador.observe(doc.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'role', 'hidden', 'open'] });
    doc.__movanzaResultados = observador;
    revisar();
}
if (typeof document !== 'undefined' && document.body) observarResultados(document);
