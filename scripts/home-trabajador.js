import { supabase } from '../configuracion/supabase.js';
import { consultarAcceso, puedeAbrirModulo } from './acceso.js';
import { prepararEncabezadoTrabajador } from './encabezado-trabajador.js';
import { montarMensajeria } from './mensajeria-panel.js';

export async function iniciarHomeTrabajador() {
    const contenido = document.getElementById('contenido-trabajador');
    const estado = document.getElementById('estado-acceso');
    const mensaje = document.getElementById('mensaje-home');
    let redirigiendo = false;
    let usuarioVerificado = null;
    let usuarioDeSesion = null;
    let mensajeria = null;
    function volverAlAcceso() {
        if (redirigiendo) return;
        redirigiendo = true;
        mensajeria?.destruir();
        contenido.hidden = true;
        sessionStorage.removeItem('movanza_empresa_activa');
        location.replace('./login.html');
    }
    supabase.auth.onAuthStateChange((evento, sesion) => {
        if (evento === 'SIGNED_OUT') { volverAlAcceso(); return; }
        if (sesion?.user?.id) {
            usuarioDeSesion = sesion.user.id;
            if (usuarioVerificado && usuarioDeSesion !== usuarioVerificado) volverAlAcceso();
        }
    });
    const acceso = await consultarAcceso();
    if (redirigiendo) return;
    if (!acceso || (usuarioDeSesion && usuarioDeSesion !== acceso.usuario.id)) { volverAlAcceso(); return; }
    if (!puedeAbrirModulo(acceso.perfil.rol, 'mis_asignaciones')) {
        mensaje.textContent = 'Este espacio está disponible únicamente para cuentas de trabajador.';
        mensaje.className = 'error';
        mensaje.setAttribute('role', 'alert');
        return;
    }
    usuarioVerificado = acceso.usuario.id;
    prepararEncabezadoTrabajador(document.querySelector('.cabecera-trabajador'), {
        cerrarSesion: async () => {
            const boton = document.getElementById('cerrar-sesion');
            if (boton.disabled || redirigiendo) return;
            boton.disabled = true;
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
                boton.disabled = false;
                contenido.inert = false;
            }
        }
    });
    mensajeria = montarMensajeria({ anfitrion: contenido, perfil: acceso.perfil,
        contextoVigente: () => !redirigiendo });
    window.addEventListener('pagehide', () => { mensajeria?.destruir(); contenido.hidden = true; });
    window.addEventListener('pageshow', evento => { if (evento.persisted) window.location.reload(); });
    estado.hidden = true;
    contenido.hidden = false;
}
