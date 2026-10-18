(() => {
    const estado = document.getElementById('estado-acceso');
    const indicador = window.MovanzaUI.crearLoader('Preparando tus invitaciones…');
    estado.prepend(indicador); indicador.hidden = false;
    import('./invitaciones-interfaz.js').then(m => m.iniciarMisInvitaciones()).catch(() => {
        document.getElementById('sitio-invitaciones').hidden = true;
        const mensaje = document.getElementById('mensaje-acceso');
        mensaje.textContent = 'No se pudo abrir Mis invitaciones. Comprueba tu conexión y vuelve a intentarlo.';
        mensaje.setAttribute('role', 'alert'); estado.hidden = false;
    }).finally(() => { indicador.hidden = true; });
})();
