(() => {
    const estado = document.getElementById('estado-acceso');
    const indicador = window.MovanzaUI.crearLoader('Comprobando tu empresa…');
    estado.prepend(indicador);
    indicador.hidden = false;
    import('./home-empresa-2.js').then(modulo => modulo.iniciarHomeEmpresa2()).catch(() => {
        document.getElementById('contenido-empresa').hidden = true;
        estado.hidden = false;
        const mensaje = document.getElementById('mensaje-home');
        mensaje.className = 'error';
        mensaje.setAttribute('role', 'alert');
        mensaje.textContent = 'No se pudo verificar el acceso a tu empresa. Comprueba tu conexión y vuelve a intentarlo.';
    }).finally(() => { indicador.hidden = true; });
})();
