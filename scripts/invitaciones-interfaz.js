import { supabase } from '../configuracion/supabase.js';
import { consultarAcceso, puedeAbrirModulo } from './acceso.js';
import { prepararEncabezadoTrabajador } from './encabezado-trabajador.js';
import { vistaInvitaciones } from './invitaciones-vista.js';

export async function iniciarMisInvitaciones() {
    const sitio = document.getElementById('sitio-invitaciones');
    const principal = document.querySelector('main');
    const estado = document.getElementById('estado-acceso');
    const mensaje = document.getElementById('mensaje-acceso');
    let retirado = false, usuarioVerificado = null, usuarioSesion = null, modulo;
    const vigente = () => !retirado;
    function salir() {
        if (retirado) return;
        retirado = true; vistaInvitaciones.retirar();
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
    if (!puedeAbrirModulo(acceso.perfil.rol, 'mis_invitaciones')) {
        mensaje.textContent = 'Este espacio está disponible únicamente para cuentas de trabajador.';
        mensaje.className = 'error'; mensaje.setAttribute('role', 'alert'); return;
    }
    usuarioVerificado = acceso.usuario.id;
    prepararEncabezadoTrabajador(document.querySelector('.cabecera-trabajador'), {
        cerrarSesion: async () => {
            const boton = document.getElementById('cerrar-sesion');
            if (boton.disabled || modulo?.invitacionesOcupadas?.()) return;
            boton.disabled = true;
            try { const { error } = await supabase.auth.signOut(); if (error) throw error; salir(); }
            catch { mensaje.textContent = 'No se pudo cerrar la sesión. Vuelve a intentarlo.'; mensaje.setAttribute('role', 'alert'); estado.hidden = false; }
            finally { boton.disabled = false; }
        }
    });
    modulo = await import('./mis_invitaciones.js');
    if (!vigente()) return;
    await modulo.iniciarInvitaciones?.(acceso.perfil, vigente);
    if (!vigente()) return;
    sitio.hidden = false; principal.hidden = false; estado.hidden = true;
    window.addEventListener('pagehide', () => { retirado = true; vistaInvitaciones.retirar(); sitio.hidden = true; principal.hidden = true; });
    window.addEventListener('pageshow', evento => { if (evento.persisted) window.location.reload(); });
}
