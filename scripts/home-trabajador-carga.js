// La pantalla de estado también funciona si el CDN o la comprobación de acceso falla.
(() => {
    const estado = document.getElementById('estado-acceso');
    const indicador = window.MovanzaUI.crearLoader('Preparando tu espacio de trabajo…');
    estado.prepend(indicador);
    indicador.hidden = false;
    import('./home-trabajador.js').then(modulo => modulo.iniciarHomeTrabajador()).catch(() => {
        document.getElementById('contenido-trabajador').hidden = true;
        estado.hidden = false;
        const mensaje = document.getElementById('mensaje-home');
        mensaje.className = 'error';
        mensaje.setAttribute('role', 'alert');
        mensaje.textContent = 'No se pudo verificar tu cuenta. Comprueba tu conexión o vuelve a iniciar sesión.';
    }).finally(() => { indicador.hidden = true; });
})();
