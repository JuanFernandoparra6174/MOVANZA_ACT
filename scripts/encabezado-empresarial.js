import { cuentaInterfaz, prepararCuenta } from './cuenta-interfaz.js';
// Fuente única del encabezado para Home Empresa 2 y los futuros módulos.
export function encabezadoEmpresarial({ raiz = './', actual = 'inicio' } = {}) {
    const enlaces = [
        ['inicio', 'Inicio', 'home_empresa_2.html'],
        ['equipo', 'Equipo', 'paginas/equipo.html'],
        ['trabajos', 'Trabajos', 'paginas/trabajos.html'],
        ['estadisticas', 'Estadísticas', 'paginas/estadisticas.html'],
        ['cambiar', 'Cambiar empresa', 'paginas/seleccionar_empresa.html']
    ];
    return `<header class="cabecera-empresarial">
        <div class="identidad-empresarial"><a class="marca" href="${raiz}home_empresa_2.html" aria-label="MOVANZA, inicio empresarial"><img src="${raiz}Carpeta_Imagenes/Logo/Logotipo%20MOVANZA.png" alt="MOVANZA" width="170" height="54"></a></div>
        <button class="menu-empresarial" type="button" aria-expanded="false" aria-controls="navegacion-empresarial">Menú <span aria-hidden="true">☰</span></button>
        <nav id="navegacion-empresarial" aria-label="Administración empresarial">${enlaces.map(([id, texto, ruta]) => `<a href="${raiz}${ruta}"${id === actual ? ' aria-current="page"' : ''}${id === 'estadisticas' ? ' data-estadisticas-empresa' : ''}>${texto}</a>`).join('')}</nav>
        ${cuentaInterfaz({ raiz, usuarioId: 'usuario-empresarial' })}
    </header>`;
}

export function prepararEncabezadoEmpresarial(elemento, { cerrarSesion }) {
    const menu = elemento.querySelector('.menu-empresarial');
    const navegacion = elemento.querySelector('#navegacion-empresarial');
    const cuenta = elemento.querySelector('.cuenta-empresarial');
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
    elemento.addEventListener('keydown', evento => {
        if (evento.key !== 'Escape') return;
        if (cuenta.open) { cuenta.open = false; cuenta.querySelector('summary').focus(); }
        if (menu.getAttribute('aria-expanded') === 'true') { cerrarMenu(); menu.focus(); }
    });
    prepararCuenta(cuenta, cerrarSesion);
}
