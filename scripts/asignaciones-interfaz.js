import { supabase } from '../configuracion/supabase.js';
import { consultarAcceso, puedeAbrirModulo } from './acceso.js';
import { prepararEncabezadoTrabajador } from './encabezado-trabajador.js';
import { vistaAsignaciones } from './asignaciones-vista.js';

export async function iniciarMisAsignaciones() {
    const sitio = document.getElementById('sitio-asignaciones');
    const principal = document.querySelector('main');
    const estado = document.getElementById('estado-acceso');
    const mensaje = document.getElementById('mensaje-acceso');
    let retirado = false, usuarioVerificado = null, usuarioSesion = null;
    const vigente = () => !retirado;
    function salir() {
        if (retirado) return;
        retirado = true; vistaAsignaciones.retirar();
        sitio.hidden = true; principal.hidden = true;
        sessionStorage.removeItem('movanza_empresa_activa');
        location.replace('../login.html');
    }
    supabase.auth.onAuthStateChange((evento, sesion) => {
        if (evento === 'SIGNED_OUT') { salir(); return; }
        if (sesion?.user?.id) { usuarioSesion = sesion.user.id; if (usuarioVerificado && usuarioSesion !== usuarioVerificado) salir(); }
    });
    const acceso = await consultarAcceso();
    if (!vigente()) return;
    if (!acceso || (usuarioSesion && usuarioSesion !== acceso.usuario.id)) { salir(); return; }
    if (!puedeAbrirModulo(acceso.perfil.rol, 'mis_asignaciones')) {
        mensaje.textContent = 'Este espacio está disponible únicamente para cuentas de trabajador.';
        mensaje.className = 'error'; mensaje.setAttribute('role', 'alert'); return;
    }
    usuarioVerificado = acceso.usuario.id;
    prepararEncabezadoTrabajador(document.querySelector('.cabecera-trabajador'), {
        cerrarSesion: async () => {
            const boton = document.getElementById('cerrar-sesion');
            if (boton.disabled || vistaAsignaciones.estaOcupada()) return;
            if (!await vistaAsignaciones.confirmarDescarte() || !vigente()) return;
            boton.disabled = true;
            try { const { error } = await supabase.auth.signOut(); if (error) throw error; salir(); }
            catch { mensaje.textContent = 'No se pudo cerrar la sesión. Vuelve a intentarlo.'; mensaje.setAttribute('role', 'alert'); estado.hidden = false; }
            finally { boton.disabled = false; }
        }
    });
    vistaAsignaciones.iniciar();
    const modulo = await import('./mis_asignaciones.js');
    if (!vigente()) return;
    await modulo.iniciarAsignaciones?.(acceso.perfil, vigente);
    if (!vigente()) return;
    sitio.hidden = false; principal.hidden = false; estado.hidden = true;
    const activar = () => { if (vigente()) vistaAsignaciones.activar(); };
    if (window.requestAnimationFrame) window.requestAnimationFrame(activar); else activar();
    window.addEventListener('pagehide', () => { retirado = true; vistaAsignaciones.retirar(); sitio.hidden = true; principal.hidden = true; });
    window.addEventListener('pageshow', evento => { if (evento.persisted) window.location.reload(); });
}
