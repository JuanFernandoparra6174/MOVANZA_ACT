// Las páginas independientes se muestran sobre el Index sin duplicar sus formularios.
(() => {
    const dialogo = document.createElement('dialog');
    dialogo.id = 'auth-modal';
    dialogo.className = 'auth-modal';
    dialogo.setAttribute('aria-label', 'Iniciar sesión');
    const cabecera = document.createElement('div');
    cabecera.className = 'auth-modal-cabecera';
    const cerrar = document.createElement('button');
    cerrar.type = 'button';
    cerrar.className = 'auth-modal-cerrar';
    cerrar.textContent = 'Cerrar ×';
    const marco = document.createElement('iframe');
    marco.className = 'auth-modal-marco';
    marco.title = 'Iniciar sesión en MOVANZA';
    cabecera.append(cerrar);
    dialogo.append(cabecera, marco);
    document.body.append(dialogo);
    let origen;
    const destinos = new Set(['./home_empresa_1.html', './home_trabajador.html', './paginas/administracion.html']);

    document.addEventListener('click', evento => {
        const enlace = evento.target.closest('a[href]');
        if (!enlace || evento.defaultPrevented || evento.button !== 0 || evento.ctrlKey || evento.metaKey || evento.shiftKey || evento.altKey || enlace.target === '_blank') return;
        const ruta = new URL(enlace.href, location.href);
        if (ruta.origin !== location.origin || !['login.html', 'signup.html'].some(nombre => ruta.pathname === new URL(nombre, document.baseURI).pathname)) return;
        evento.preventDefault();
        origen = enlace;
        for (const abierto of document.querySelectorAll('.dialogo-publico[open]')) abierto.close();
        ruta.searchParams.set('presentacion', 'modal');
        const alta = ruta.pathname.endsWith('/signup.html');
        dialogo.setAttribute('aria-label', alta ? 'Crear cuenta' : 'Iniciar sesión');
        marco.title = alta ? 'Crear cuenta en MOVANZA' : 'Iniciar sesión en MOVANZA';
        marco.src = ruta.href;
        dialogo.showModal();
    });
    cerrar.addEventListener('click', () => dialogo.close());
    dialogo.addEventListener('close', () => {
        marco.removeAttribute('src');
        marco.style.removeProperty('height');
        const oculto = origen?.closest('dialog');
        if (origen?.isConnected && (!oculto || oculto.open)) origen.focus({ preventScroll: true });
        else document.querySelector('.boton-acceso')?.focus({ preventScroll: true });
    });
    window.addEventListener('message', evento => {
        if (!dialogo.open || evento.origin !== location.origin || evento.source !== marco.contentWindow) return;
        const datos = evento.data;
        if (!datos || typeof datos !== 'object') return;
        if (datos.tipo === 'movanza:auth-cerrar') dialogo.close();
        if (datos.tipo === 'movanza:auth-altura' && Number.isFinite(datos.altura)) {
            marco.style.height = `${Math.max(300, Math.min(1200, datos.altura))}px`;
        }
        if (datos.tipo === 'movanza:auth-vista' && ['login', 'signup'].includes(datos.vista)) {
            const titulo = datos.vista === 'signup' ? 'Crear cuenta' : 'Iniciar sesión';
            dialogo.setAttribute('aria-label', titulo);
            marco.title = `${titulo} en MOVANZA`;
        }
        if (datos.tipo === 'movanza:auth-completa' && destinos.has(datos.destino)) {
            location.assign(new URL(datos.destino, document.baseURI).href);
        }
    });
})();
