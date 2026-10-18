// Presentación del formulario; las consultas y el registro siguen en empresas.js.
import { confirmarAccion } from './alertas.js';
export function prepararCreacionEmpresa() {
    const dialogo = document.getElementById('crear-empresa-modal');
    const formulario = document.getElementById('formulario-empresa');
    const campo = document.getElementById('nombre-empresa');
    const guardar = document.getElementById('boton-crear');
    const carga = window.MovanzaUI.crearLoader('Preparando tu empresa…');
    dialogo.querySelector('.auth-estado').prepend(carga);
    let listo = false;
    let preparando = false;
    let origen;
    let cerrando = false;

    function actualizarCarga() {
        const ocupado = preparando || formulario.getAttribute('aria-busy') === 'true';
        carga.lastElementChild.textContent = preparando ? 'Preparando tu empresa…' : 'Creando empresa…';
        carga.hidden = !ocupado;
        dialogo.querySelectorAll('[data-cerrar-empresa]').forEach(boton => { boton.disabled = ocupado; });
    }
    async function cerrar() {
        if (preparando || formulario.getAttribute('aria-busy') === 'true' || cerrando) return;
        if (campo.value && !await confirmarAccion({ titulo: 'Descartar empresa', mensaje: '¿Descartar los datos de la empresa sin guardar?', textoConfirmar: 'Descartar datos', destructiva: true })) return;
        if (!dialogo.open || preparando || formulario.getAttribute('aria-busy') === 'true' || cerrando) return;
        cerrando = true;
        dialogo.inert = true;
        dialogo.classList.add('cerrando');
        if (typeof dialogo.animate === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            await dialogo.animate([{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(16px)' }], { duration: 180 }).finished.catch(() => {});
        }
        dialogo.close();
        dialogo.inert = false;
        dialogo.classList.remove('cerrando');
        cerrando = false;
        formulario.reset();
        document.getElementById('mensaje').textContent = '';
        origen?.focus();
    }
    document.querySelectorAll('[data-crear-empresa]').forEach(boton => boton.addEventListener('click', async () => {
        if (dialogo.open || cerrando) return;
        origen = boton;
        dialogo.showModal();
        document.querySelector('.menu-boton').setAttribute('aria-expanded', 'false');
        document.getElementById('navegacion-principal').classList.remove('abierto');
        if (!listo) {
            preparando = true;
            guardar.disabled = true;
            actualizarCarga();
            try {
                const modulo = await import('./empresas.js');
                listo = await modulo.iniciarModulo();
            } catch {
                document.getElementById('mensaje').textContent = 'No se pudo cargar el formulario. Cierra la ventana y vuelve a intentarlo.';
                document.getElementById('mensaje').className = 'error';
            } finally {
                preparando = false;
                guardar.disabled = !listo;
                actualizarCarga();
            }
        }
        if (dialogo.open) campo.focus();
    }));
    dialogo.querySelectorAll('[data-cerrar-empresa]').forEach(boton => boton.addEventListener('click', cerrar));
    dialogo.addEventListener('cancel', evento => { evento.preventDefault(); cerrar(); });
    campo.addEventListener('input', () => dialogo.querySelector('.input-section').classList.toggle('tiene-valor', Boolean(campo.value)));
    formulario.addEventListener('reset', () => dialogo.querySelector('.input-section').classList.remove('tiene-valor'));
    formulario.addEventListener('empresa-procesando', actualizarCarga);
    formulario.addEventListener('empresa-finalizada', actualizarCarga);
}
