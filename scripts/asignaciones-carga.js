(() => {
    const estado = document.getElementById('estado-acceso');
    const indicador = window.MovanzaUI.crearLoader('Preparando tus asignaciones…');
    estado.prepend(indicador); indicador.hidden = false;
    import('./asignaciones-interfaz.js').then(m => m.iniciarMisAsignaciones()).catch(() => {
        document.getElementById('sitio-asignaciones').hidden = true;
        const mensaje = document.getElementById('mensaje-acceso');
        mensaje.textContent = 'No se pudo abrir Mis asignaciones. Comprueba tu conexión y vuelve a intentarlo.';
        mensaje.setAttribute('role', 'alert'); estado.hidden = false;
    }).finally(() => { indicador.hidden = true; });
})();
