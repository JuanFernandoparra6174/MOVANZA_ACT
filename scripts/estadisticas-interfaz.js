import { supabase } from '../configuracion/supabase.js';
import { consultarAcceso, puedeAbrirModulo } from './acceso.js';
import { prepararEncabezadoEmpresarial } from './encabezado-empresarial.js';
import { vistaEstadisticas } from './estadisticas-vista.js';

export async function iniciarEstadisticas() {
    const sitio = document.getElementById('sitio-estadisticas'), principal = document.querySelector('main');
    const estado = document.getElementById('estado-acceso'), mensaje = document.getElementById('mensaje-acceso');
    let redirigiendo = false, usuarioVerificado = null, usuarioDeSesion = null;
    function retirar() {
        if (redirigiendo) return;
        redirigiendo = true; sitio.hidden = true; principal.hidden = true;
        vistaEstadisticas.destruir(); sessionStorage.removeItem('movanza_empresa_activa'); location.replace('../index.html');
    }
    supabase.auth.onAuthStateChange((evento, sesion) => {
        if (evento === 'SIGNED_OUT') { retirar(); return; }
        if (sesion?.user?.id) { usuarioDeSesion = sesion.user.id; if (usuarioVerificado && usuarioDeSesion !== usuarioVerificado) retirar(); }
    });
    const acceso = await consultarAcceso();
    if (redirigiendo) return;
    if (!acceso || (usuarioDeSesion && usuarioDeSesion !== acceso.usuario.id)) { retirar(); return; }
    if (!puedeAbrirModulo(acceso.perfil.rol, 'estadisticas')) {
        mensaje.textContent = 'Este módulo no está habilitado para tu tipo de cuenta.';
        mensaje.className = 'error'; mensaje.setAttribute('role', 'alert'); return;
    }
    usuarioVerificado = acceso.usuario.id;
    document.getElementById('usuario-empresarial').textContent = acceso.perfil.nombre_usuario;
    prepararEncabezadoEmpresarial(document.querySelector('.cabecera-empresarial'), {
        cerrarSesion: async () => {
            const boton = document.getElementById('cerrar-sesion'); if (boton.disabled) return;
            boton.disabled = true; sitio.inert = true; estado.hidden = false;
            mensaje.textContent = 'Cerrando sesión…'; mensaje.className = ''; mensaje.setAttribute('role', 'status');
            const loader = estado.querySelector('.movanza-loader'); if (loader) loader.hidden = false;
            try { const { error } = await supabase.auth.signOut(); if (error) throw error; retirar(); }
            catch { mensaje.textContent = 'No se pudo cerrar la sesión. Vuelve a intentarlo.'; mensaje.className = 'error'; mensaje.setAttribute('role', 'alert'); }
            finally { if (loader) loader.hidden = true; boton.disabled = false; sitio.inert = false; }
        }
    });
    vistaEstadisticas.iniciar();
    const idEmpresa = sessionStorage.getItem('movanza_empresa_activa');
    const modulo = await import('./estadisticas.js'); await modulo.estadisticasListas;
    if (redirigiendo) { vistaEstadisticas.destruir(); return; }
    if (sessionStorage.getItem('movanza_empresa_activa') !== idEmpresa) {
        redirigiendo = true; vistaEstadisticas.destruir(); location.replace('./seleccionar_empresa.html'); return;
    }
    if (idEmpresa && /^\d+$/.test(idEmpresa)) document.querySelector('[data-estadisticas-empresa]').href = './estadisticas.html?empresa=' + encodeURIComponent(idEmpresa);
    principal.hidden = false; sitio.hidden = false; estado.hidden = true;
    if (window.requestAnimationFrame) window.requestAnimationFrame(() => { if (!redirigiendo) vistaEstadisticas.redimensionar(); });
    window.addEventListener('pagehide', () => { sitio.hidden = true; principal.hidden = true; vistaEstadisticas.destruir(); });
    window.addEventListener('pageshow', evento => { if (evento.persisted) window.location.reload(); });
}
