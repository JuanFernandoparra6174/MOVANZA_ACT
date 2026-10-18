// Presentación compartida. Cada interfaz conserva su operación de cierre de sesión.
import { mostrarAlerta } from './alertas.js';
export function cuentaInterfaz({ usuarioId = '' } = {}) {
    return `<details class="cuenta-empresarial menu-cuenta"><summary class="boton-relleno boton-cuenta">Cuenta <span aria-hidden="true">⌄</span></summary><div class="opciones-cuenta">${usuarioId ? `<p id="${usuarioId}"></p>` : ''}<button type="button" data-abrir-perfil aria-haspopup="dialog">Mi perfil</button><button type="button" id="cerrar-sesion">Cerrar sesión</button></div></details>`;
}

export function prepararCuenta(cuenta, cerrarSesion) {
    cuenta.addEventListener('keydown', evento => {
        if (evento.key === 'Escape' && cuenta.open) {
            cuenta.open = false;
            cuenta.querySelector('summary').focus();
        }
    });
    const abrir = cuenta.querySelector('[data-abrir-perfil], a');
    abrir.removeAttribute('href');
    abrir.setAttribute('aria-haspopup', 'dialog');
    if (abrir.tagName !== 'BUTTON') {
        abrir.setAttribute('role', 'button');
        abrir.tabIndex = 0;
        abrir.addEventListener('keydown', evento => {
            if (evento.key === ' ' || evento.key === 'Enter') { evento.preventDefault(); abrir.click(); }
        });
    }
    abrir.addEventListener('click', async evento => {
        evento.preventDefault();
        try {
            const { abrirPerfil } = await import('./perfil-modal.js');
            await abrirPerfil({ origen: abrir, salir: cuenta.querySelector('#cerrar-sesion') });
        } catch {
            await mostrarAlerta({ tipo: 'error', mensaje: 'No se pudo abrir tu perfil. Comprueba tu conexión y vuelve a intentarlo.' });
        }
    });
    document.addEventListener('click', evento => {
        if (!cuenta.contains(evento.target) && !evento.target.closest('#perfil-modal, #movanza-alerta')) cuenta.open = false;
    });
    if (cerrarSesion) cuenta.querySelector('#cerrar-sesion').addEventListener('click', cerrarSesion);
}

// Controles de acceso al perfil que estén fuera del menú de cuenta.
if (typeof document !== 'undefined') document.addEventListener('click', async evento => {
    const control = evento.target.closest('[data-abrir-perfil]');
    if (!control || control.closest('.menu-cuenta')) return;
    evento.preventDefault();
    try {
        const { abrirPerfil } = await import('./perfil-modal.js');
        await abrirPerfil({ origen: control, salir: document.querySelector('.menu-cuenta #cerrar-sesion') });
    } catch {
        await mostrarAlerta({ tipo: 'error', mensaje: 'No se pudo abrir tu perfil. Comprueba tu conexión y vuelve a intentarlo.' });
    }
});

export function crearCuentaElemento(opciones, cerrarSesion) {
    const contenedor = document.createElement('div');
    contenedor.innerHTML = cuentaInterfaz(opciones);
    const cuenta = contenedor.firstElementChild;
    prepararCuenta(cuenta, cerrarSesion);
    return cuenta;
}
