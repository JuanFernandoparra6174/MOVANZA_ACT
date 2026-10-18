import { supabase } from '../configuracion/supabase.js';
import { consultarAcceso, puedeAbrirModulo } from './acceso.js';
import { prepararCreacionEmpresa } from './empresa-modal.js';
import { prepararCuenta } from './cuenta-interfaz.js';

export async function iniciarHomeEmpresa() {
    const contenido = document.getElementById('contenido-empresa');
    const estado = document.getElementById('estado-acceso');
    const mensaje = document.getElementById('mensaje-home');
    const salir = document.getElementById('cerrar-sesion');
    const raiz = document.body.dataset.raiz || './';
    let redirigiendo = false;
    let usuarioVerificado = null;
    let usuarioDeSesion = null;
    function volverAlAcceso() {
        if (redirigiendo) return;
        redirigiendo = true;
        document.getElementById('crear-empresa-modal')?.close();
        contenido.hidden = true;
        sessionStorage.removeItem('movanza_empresa_activa');
        location.replace(raiz + 'login.html');
    }
    // Escucha antes de la consulta para no perder un cierre o cambio de sesión
    // que ocurra mientras la respuesta del perfil está pendiente.
    supabase.auth.onAuthStateChange((evento, sesion) => {
        if (evento === 'SIGNED_OUT') { volverAlAcceso(); return; }
        if (sesion?.user?.id) {
            usuarioDeSesion = sesion.user.id;
            if (usuarioVerificado && usuarioDeSesion !== usuarioVerificado) volverAlAcceso();
        }
    });
    const acceso = await consultarAcceso();
    if (redirigiendo) return;
    if (!acceso) { volverAlAcceso(); return; }
    if (usuarioDeSesion && usuarioDeSesion !== acceso.usuario.id) { volverAlAcceso(); return; }
    if (!puedeAbrirModulo(acceso.perfil.rol, 'empresas')) {
        mensaje.textContent = 'Este espacio está disponible para cuentas de empresa.';
        mensaje.className = 'error';
        mensaje.setAttribute('role', 'alert');
        return;
    }
    usuarioVerificado = acceso.usuario.id;
    prepararCuenta(document.querySelector('.menu-cuenta'));
    if (document.getElementById('crear-empresa-modal')) prepararCreacionEmpresa();
    const menu = document.querySelector('.menu-boton');
    const navegacion = document.getElementById('navegacion-principal');
    menu.addEventListener('click', () => {
        const abierto = menu.getAttribute('aria-expanded') !== 'true';
        menu.setAttribute('aria-expanded', String(abierto));
        navegacion.classList.toggle('abierto', abierto);
    });
    navegacion.addEventListener('click', evento => {
        if (!evento.target.closest('a')) return;
        menu.setAttribute('aria-expanded', 'false');
        navegacion.classList.remove('abierto');
    });
    salir.addEventListener('click', async () => {
        if (salir.disabled) return;
        salir.disabled = true;
        contenido.inert = true;
        estado.hidden = false;
        mensaje.className = '';
        mensaje.setAttribute('role', 'status');
        mensaje.textContent = 'Cerrando sesión…';
        const indicador = estado.querySelector('.movanza-loader');
        if (indicador) indicador.hidden = false;
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            volverAlAcceso();
        } catch {
            mensaje.textContent = 'No se pudo cerrar la sesión. Vuelve a intentarlo.';
            mensaje.className = 'error';
            mensaje.setAttribute('role', 'alert');
        } finally {
            if (indicador) indicador.hidden = true;
            salir.disabled = false;
            contenido.inert = false;
        }
    });
    estado.hidden = true;
    contenido.hidden = false;
    if (document.body.classList.contains('pagina-seleccion') && !redirigiendo) {
        const empresas = await import('./empresas.js');
        if (!redirigiendo) await empresas.iniciarModulo();
    }
}
