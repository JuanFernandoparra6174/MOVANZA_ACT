// Informa también de fallos al cargar el módulo o sus dependencias remotas.
(() => {
    const estado = document.getElementById('estado-acceso');
    const indicador = window.MovanzaUI.crearLoader('Comprobando acceso…');
    estado.prepend(indicador);
    indicador.hidden = false;
    import('./home-empresa.js').then(modulo => modulo.iniciarHomeEmpresa()).catch(() => {
        document.getElementById('contenido-empresa').hidden = true;
        estado.hidden = false;
        const mensaje = document.getElementById('mensaje-home');
        mensaje.className = 'error';
        mensaje.setAttribute('role', 'alert');
        mensaje.textContent = 'No se pudo verificar tu acceso. Comprueba tu conexión y vuelve a intentarlo.';
    }).finally(() => { indicador.hidden = true; });
})();
