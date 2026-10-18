import { validarContacto } from './contacto-validacion.js';
import { mostrarAlerta } from './alertas.js';

export function iniciarContacto(formulario = document.getElementById('formulario-contacto')) {
    if (!formulario || formulario.dataset.contactoInicializado) return;
    formulario.dataset.contactoInicializado = 'true';
    const estado = formulario.querySelector('#contacto-estado');
    const boton = formulario.querySelector('[type="submit"]');
    const campos = ['nombre', 'correo', 'mensaje'];
    const controles = [...formulario.querySelectorAll('input, textarea, button')];
    const loader = window.MovanzaUI.crearLoader('Enviando tu mensaje…');
    loader.hidden = true; boton.after(loader);
    let enviando = false, intento = null;

    formulario.addEventListener('input', evento => {
        evento.target.setCustomValidity?.('');
        evento.target.removeAttribute('aria-invalid');
        if (!enviando) estado.textContent = '';
    });
    formulario.addEventListener('submit', async evento => {
        evento.preventDefault();
        if (enviando) return;
        const entrada = Object.fromEntries(campos.map(campo => [campo, formulario.elements.namedItem(campo).value]));
        const { datos, errores } = validarContacto(entrada);
        for (const campo of campos) {
            const input = formulario.elements.namedItem(campo);
            input.setCustomValidity(errores[campo] || '');
            input.setAttribute('aria-invalid', String(Boolean(errores[campo])));
        }
        if (!formulario.reportValidity()) return;
        const contenido = JSON.stringify({ ...datos, sitioWeb: formulario.elements.namedItem('sitioWeb').value });
        // Reutilizar la clave en reintentos evita duplicar un correo cuya respuesta se perdió.
        if (!intento || intento.contenido !== contenido || Date.now() - intento.fecha > 22 * 60 * 60 * 1000) {
            const fecha = Date.now();
            intento = { contenido, fecha, clave: `contacto-${fecha}-${window.crypto.randomUUID()}` };
        }
        enviando = true;
        const anteriores = controles.map(control => control.disabled);
        controles.forEach(control => { control.disabled = true; });
        formulario.setAttribute('aria-busy', 'true'); loader.hidden = false;
        boton.textContent = 'Enviando…'; estado.textContent = 'Estamos enviando tu mensaje…';
        const controlador = new window.AbortController();
        const tiempoLimite = window.setTimeout(() => controlador.abort(), 20_000);
        let aviso;
        try {
            const respuesta = await window.fetch('/api/contacto', {
                method: 'POST', credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', 'Idempotency-Key': intento.clave },
                body: contenido, signal: controlador.signal
            });
            const resultado = await respuesta.json();
            if (!respuesta.ok || resultado.ok !== true) {
                // Solo se presentan textos previstos; nunca errores internos del proveedor.
                const mensajes = {
                    400: 'No pudimos validar la solicitud. Revisa los datos o actualiza la página.',
                    413: 'El mensaje supera el tamaño permitido. Reduce su longitud.',
                    422: 'Revisa los campos del formulario.',
                    429: 'Has enviado varias solicitudes. Espera un minuto antes de volver a intentarlo.',
                    503: 'El formulario no está disponible temporalmente. Inténtalo más tarde.'
                };
                const fallo = new Error('Envío no confirmado');
                fallo.mensajeContacto = mensajes[respuesta.status] || 'No pudimos confirmar el envío. Tu mensaje se conserva; vuelve a intentarlo.';
                throw fallo;
            }
            formulario.reset(); intento = null;
            estado.textContent = 'Tu mensaje se ha enviado correctamente. Gracias por contactar con MOVANZA.';
            aviso = { tipo: 'exito', titulo: 'Mensaje enviado', mensaje: estado.textContent };
        } catch (error) {
            estado.textContent = error.mensajeContacto || 'No pudimos confirmar el envío. Comprueba tu conexión y vuelve a intentarlo; tu mensaje se conserva.';
            aviso = { tipo: 'error', titulo: 'No se pudo enviar el mensaje', mensaje: estado.textContent };
        } finally {
            window.clearTimeout(tiempoLimite);
            controles.forEach((control, posicion) => { control.disabled = anteriores[posicion]; });
            enviando = false; loader.hidden = true;
            formulario.removeAttribute('aria-busy'); boton.textContent = 'Enviar mensaje';
        }
        // El status permanece visible; una sola card utiliza el servicio compartido.
        void mostrarAlerta({ ...aviso, fuente: estado });
    });
}

iniciarContacto();
