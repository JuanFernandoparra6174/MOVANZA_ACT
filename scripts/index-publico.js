// Navegación pública independiente del servicio de autenticación.
(() => {
    const dialogos = [...document.querySelectorAll('.dialogo-publico')];
    const cuenta = document.getElementById('cuenta');
    const menu = document.querySelector('.menu-boton');
    const navegacion = document.getElementById('navegacion-principal');
    let origen = null;
    let autenticacionLista = false;
    let falloAutenticacion = false;
    const regionCuenta = cuenta.querySelector('.cuenta-existente');
    const indicador = window.MovanzaUI.crearLoader('Procesando solicitud…');
    cuenta.querySelector(':scope > h2').after(indicador);
    const cargaCuenta = window.MovanzaUI.observarCarga({
        region: regionCuenta,
        indicador,
        ocupado: () => {
            if (falloAutenticacion) return false;
            if (!autenticacionLista) return true;
            const estado = document.getElementById('mensaje').textContent;
            if (/^(Cargando acceso|Comprobando sesión)/.test(estado)) return true;
            return [...cuenta.querySelectorAll('form button, #boton-salir')].some(boton =>
                boton.disabled && !boton.closest('section')?.classList.contains('oculto')
            );
        }
    });

    function abrirDesdeHash() {
        const destino = dialogos.find(dialogo => '#' + dialogo.id === location.hash);
        for (const dialogo of dialogos) {
            if (dialogo !== destino && dialogo.open) dialogo.close();
        }
        if (destino && !destino.open) {
            origen = document.activeElement;
            destino.showModal();
        }
    }

    menu.addEventListener('click', () => {
        const abierto = menu.getAttribute('aria-expanded') !== 'true';
        menu.setAttribute('aria-expanded', String(abierto));
        navegacion.classList.toggle('abierto', abierto);
    });
    document.addEventListener('click', evento => {
        const enlace = evento.target.closest('a[href^="#"]');
        if (!enlace) return;
        menu.setAttribute('aria-expanded', 'false');
        navegacion.classList.remove('abierto');
        if (enlace.hash === location.hash) abrirDesdeHash();
    });
    for (const dialogo of dialogos) {
        dialogo.querySelector('.cerrar-dialogo').addEventListener('click', () => dialogo.close());
        dialogo.addEventListener('close', () => {
            if (!dialogo.open && location.hash === '#' + dialogo.id) {
                history.replaceState(null, '', location.pathname + location.search);
                if (origen?.isConnected) origen.focus({ preventScroll: true });
            }
        });
    }
    window.addEventListener('hashchange', abrirDesdeHash);
    abrirDesdeHash();

    // Recupera el perfil existente. Login y Sign Up tienen páginas independientes.
    // La portada sigue disponible si el CDN o el servicio de acceso falla.
    const mensaje = document.getElementById('mensaje');
    mensaje.textContent = 'Cargando acceso a MOVANZA…';
    import('./autenticacion.js').then(() => {
        autenticacionLista = true;
        cargaCuenta.actualizar();
    }).catch(() => {
        falloAutenticacion = true;
        mensaje.className = 'error';
        mensaje.textContent = 'No se pudo cargar el acceso. Comprueba tu conexión y recarga la página para volver a intentarlo.';
        cargaCuenta.actualizar();
    });
})();
