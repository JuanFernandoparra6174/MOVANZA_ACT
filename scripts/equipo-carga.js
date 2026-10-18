(() => {
    const estado = document.getElementById('estado-acceso');
    const indicador = window.MovanzaUI.crearLoader('Cargando tu equipo…');
    estado.prepend(indicador);
    indicador.hidden = false;
    import('./equipo-interfaz.js').then(modulo => modulo.iniciarEquipo()).catch(() => {
        document.getElementById('sitio-equipo').hidden = true;
        document.querySelector('main').hidden = true;
        estado.hidden = false;
        const mensaje = document.getElementById('mensaje-acceso');
        mensaje.setAttribute('role', 'alert');
        mensaje.className = 'error';
        mensaje.textContent = 'No se pudo abrir Equipo. Comprueba tu conexión y vuelve a intentarlo.';
    }).finally(() => { indicador.hidden = true; });
})();
