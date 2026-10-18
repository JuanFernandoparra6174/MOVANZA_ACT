import { cuentaInterfaz, prepararCuenta } from './cuenta-interfaz.js';

// Compartido con las futuras vistas de asignaciones e invitaciones.
export function encabezadoTrabajador({ raiz = './', actual = 'inicio' } = {}) {
    const enlaces = [
        ['inicio', 'Inicio', 'home_trabajador.html'],
        ['mis_asignaciones', 'Mis asignaciones', 'paginas/mis_asignaciones.html'],
        ['mis_invitaciones', 'Mis invitaciones', 'paginas/mis_invitaciones.html']
    ];
    return `<header class="cabecera-publica cabecera-trabajador" id="inicio">
            <a class="marca" href="${raiz}home_trabajador.html" aria-label="MOVANZA, inicio del trabajador"><img src="${raiz}Carpeta_Imagenes/Logo/Logotipo%20MOVANZA.png" alt="MOVANZA" width="170" height="54"></a>
            <button class="menu-boton" type="button" aria-expanded="false" aria-controls="navegacion-trabajador">Menú <span aria-hidden="true">☰</span></button>
            <nav id="navegacion-trabajador" aria-label="Espacio del trabajador">${enlaces.map(([id, nombre, ruta]) => `<a href="${raiz}${ruta}"${actual === id ? ' aria-current="page"' : ''}>${nombre}</a>`).join('')}</nav>
            ${cuentaInterfaz()}
        </header>`;
}

export function prepararEncabezadoTrabajador(elemento, { cerrarSesion } = {}) {
    const menu = elemento.querySelector('.menu-boton');
    const navegacion = elemento.querySelector('#navegacion-trabajador');
    const cuenta = elemento.querySelector('.menu-cuenta');
    const cerrarMenu = () => {
        menu.setAttribute('aria-expanded', 'false');
        navegacion.classList.remove('abierto');
    };
    menu.addEventListener('click', () => {
        const abierto = menu.getAttribute('aria-expanded') !== 'true';
        menu.setAttribute('aria-expanded', String(abierto));
        navegacion.classList.toggle('abierto', abierto);
        cuenta.open = false;
    });
    navegacion.addEventListener('click', evento => { if (evento.target.closest('a')) cerrarMenu(); });
    cuenta.addEventListener('toggle', () => { if (cuenta.open) cerrarMenu(); });
    elemento.addEventListener('keydown', evento => {
        if (evento.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') { cerrarMenu(); menu.focus(); }
    });
    prepararCuenta(cuenta, cerrarSesion);
}
