// Componentes sin dependencias. No modifica Auth ni las peticiones de la plataforma.
(() => {
    function crearLoader(texto = 'Procesando…') {
        const indicador = document.createElement('div');
        indicador.className = 'movanza-loader';
        indicador.hidden = true;
        // El mensaje de estado del proceso anuncia la operación; evita duplicarlo.
        indicador.setAttribute('aria-hidden', 'true');
        const spinner = document.createElement('span');
        spinner.className = 'movanza-spinner';
        const centro = document.createElement('span');
        centro.className = 'movanza-spinner-centro';
        spinner.append(centro);
        const etiqueta = document.createElement('span');
        etiqueta.textContent = texto;
        indicador.append(spinner, etiqueta);
        return indicador;
    }

    function observarCarga({ region, indicador, ocupado }) {
        const actualizar = () => {
            const esperando = Boolean(ocupado());
            indicador.hidden = !esperando;
            region.setAttribute('aria-busy', String(esperando));
        };
        const observador = new MutationObserver(actualizar);
        observador.observe(region, {
            subtree: true, childList: true, characterData: true,
            attributes: true, attributeFilter: ['disabled', 'class']
        });
        actualizar();
        return { actualizar, desconectar: () => observador.disconnect() };
    }

    window.MovanzaUI = Object.freeze({ crearLoader, observarCarga });
})();
