(() => {
    const estado = document.getElementById('estado-acceso');
    const loader = window.MovanzaUI.crearLoader('Cargando trabajos y mapa…');
    estado.prepend(loader); loader.hidden = false;
    import('./trabajos-interfaz.js').then(modulo => modulo.iniciarTrabajos()).catch(() => {
        document.getElementById('sitio-trabajos').hidden = true;
        document.querySelector('main').hidden = true;
        estado.hidden = false;
        const mensaje = document.getElementById('mensaje-acceso');
        mensaje.className = 'error'; mensaje.setAttribute('role', 'alert');
        mensaje.textContent = 'No se pudo abrir Trabajos. Comprueba tu conexión y vuelve a intentarlo.';
    }).finally(() => { loader.hidden = true; });
})();
