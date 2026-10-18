(() => {
    const estado = document.getElementById('estado-acceso');
    const loader = window.MovanzaUI.crearLoader('Abriendo estadísticas…'); estado.prepend(loader); loader.hidden = false;
    import('./estadisticas-interfaz.js').then(modulo => modulo.iniciarEstadisticas()).catch(() => {
        document.getElementById('sitio-estadisticas').hidden = true; document.querySelector('main').hidden = true; estado.hidden = false;
        const mensaje = document.getElementById('mensaje-acceso'); mensaje.textContent = 'No se pudo abrir Estadísticas. Comprueba tu conexión y vuelve a intentarlo.';
        mensaje.className = 'error'; mensaje.setAttribute('role', 'alert');
    }).finally(() => { loader.hidden = true; });
})();
