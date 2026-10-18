// Comportamiento visual del recurso de referencia. Auth permanece en autenticacion.js.
(() => {
    const enModal = window.parent !== window && new window.URLSearchParams(window.location.search).get('presentacion') === 'modal';
    if (enModal) {
        document.body.classList.add('auth-en-modal');
        document.body.dataset.presentacion = 'modal';
        document.querySelector('.auth-fondo')?.remove();
        for (const enlace of document.querySelectorAll('.auth-alternativa a')) {
            const ruta = new window.URL(enlace.href);
            ruta.searchParams.set('presentacion', 'modal');
            enlace.href = ruta.href;
        }
        const avisar = datos => window.parent.postMessage(datos, window.location.origin);
        avisar({ tipo: 'movanza:auth-vista', vista: document.body.dataset.autenticacion });
        const medir = () => avisar({ tipo: 'movanza:auth-altura', altura: Math.ceil(document.body.getBoundingClientRect().height) });
        if (window.ResizeObserver) new window.ResizeObserver(medir).observe(document.body);
        window.addEventListener('load', medir);
        document.addEventListener('keydown', evento => {
            if (evento.key === 'Escape' && !evento.defaultPrevented) avisar({ tipo: 'movanza:auth-cerrar' });
        });
    }
    const formulario = document.querySelector('.registration-form form');
    const pasos = [...formulario.querySelectorAll('.input-section')];
    const anterior = document.getElementById('paso-anterior');
    const estadoPaso = document.getElementById('estado-paso');
    const mensaje = document.getElementById('mensaje');
    const enviar = formulario.querySelector('[type="submit"]');
    const indicador = window.MovanzaUI.crearLoader('Procesando solicitud…');
    document.querySelector('.auth-estado').append(indicador);
    let actual = 0;
    let cargando = true;
    let fallo = false;
    const esperando = () => !fallo && (cargando || enviar.disabled || /^Comprobando sesión/.test(mensaje.textContent));
    const carga = window.MovanzaUI.observarCarga({ region: document.querySelector('.registration-form'), indicador, ocupado: esperando });

    function activar(indice, enfocar = true) {
        actual = indice;
        pasos.forEach((paso, i) => {
            paso.classList.toggle('folded', i > actual);
            paso.classList.toggle('fold-up', i < actual);
            paso.style.setProperty('--nivel', String(Math.max(0, i - actual)));
            paso.inert = i !== actual;
            paso.toggleAttribute('inert', i !== actual);
            paso.setAttribute('aria-hidden', String(i !== actual));
        });
        anterior.hidden = actual === 0;
        estadoPaso.textContent = `Paso ${actual + 1} de ${pasos.length}`;
        if (enfocar) pasos[actual].querySelector('input, select').focus();
    }
    function validarPaso() {
        const campo = pasos[actual].querySelector('input, select');
        return campo.reportValidity();
    }
    function avanzar() {
        if (esperando() || !validarPaso()) return;
        activar(Math.min(actual + 1, pasos.length - 1));
    }
    formulario.querySelectorAll('.siguiente-paso').forEach(boton => boton.addEventListener('click', avanzar));
    anterior.addEventListener('click', () => { if (!esperando()) activar(Math.max(0, actual - 1)); });
    formulario.addEventListener('keydown', evento => {
        if (evento.key !== 'Enter' || !evento.target.matches('input')) return;
        evento.preventDefault();
        if (esperando()) return;
        if (actual < pasos.length - 1) avanzar();
        else formulario.requestSubmit(enviar);
    });
    formulario.addEventListener('input', evento => {
        const paso = evento.target.closest('.input-section');
        if (paso) paso.classList.toggle('tiene-valor', Boolean(evento.target.value));
    });
    formulario.addEventListener('change', evento => {
        const paso = evento.target.closest('.input-section');
        if (paso) paso.classList.toggle('tiene-valor', Boolean(evento.target.value));
    });
    formulario.addEventListener('submit', evento => {
        if (esperando() || actual < pasos.length - 1) {
            evento.preventDefault(); evento.stopImmediatePropagation();
            if (!esperando()) avanzar();
            return;
        }
        const invalido = [...formulario.querySelectorAll('input, select')].find(campo => !campo.validity.valid);
        if (invalido) {
            evento.preventDefault(); evento.stopImmediatePropagation();
            activar(pasos.indexOf(invalido.closest('.input-section')));
            invalido.reportValidity();
        }
    }, true);
    formulario.querySelectorAll('[data-clave]').forEach(boton => boton.addEventListener('click', () => {
        const campo = document.getElementById(boton.dataset.clave);
        const mostrar = campo.type === 'password';
        campo.type = mostrar ? 'text' : 'password';
        boton.setAttribute('aria-pressed', String(mostrar));
        boton.setAttribute('aria-label', `${mostrar ? 'Ocultar' : 'Mostrar'} ${campo.id === 'confirmar-clave' ? 'confirmación de contraseña' : 'contraseña'}`);
    }));
    activar(0, false);
    function sincronizar() {
        const ocupado = esperando();
        const bloquear = fallo || ocupado;
        formulario.inert = bloquear;
        for (const boton of formulario.querySelectorAll('button[type="button"]')) {
            if (boton.disabled !== bloquear) boton.disabled = bloquear;
        }
        carga.actualizar();
    }
    new MutationObserver(sincronizar).observe(document.querySelector('.registration-form'), {
        subtree: true, childList: true, attributes: true, attributeFilter: ['disabled', 'class']
    });
    sincronizar();
    import('./autenticacion.js').then(() => {
        cargando = false;
        enviar.disabled = false;
        sincronizar();
    }).catch(() => {
        fallo = true;
        cargando = false;
        mensaje.className = 'error';
        mensaje.textContent = 'No se pudo cargar el acceso. Comprueba tu conexión y recarga la página para volver a intentarlo.';
        enviar.disabled = true;
        sincronizar();
        formulario.querySelectorAll('button').forEach(boton => { boton.disabled = true; });
    });
})();
