import { supabase } from '../configuracion/supabase.js';
import { consultarAcceso, puedeAbrirModulo } from './acceso.js';
import { prepararEncabezadoEmpresarial } from './encabezado-empresarial.js';
import { vistaTrabajos } from './trabajos-panel.js';

export async function iniciarTrabajos() {
    const sitio = document.getElementById('sitio-trabajos');
    const principal = document.querySelector('main');
    const estado = document.getElementById('estado-acceso');
    const mensaje = document.getElementById('mensaje-acceso');
    let redirigiendo = false;
    let usuarioVerificado = null;
    let usuarioDeSesion = null;
    function salirDeLaVista() {
        if (redirigiendo) return;
        redirigiendo = true;
        vistaTrabajos.retirar();
        sitio.hidden = true; principal.hidden = true;
        sessionStorage.removeItem('movanza_empresa_activa');
        location.replace('../index.html');
    }
    supabase.auth.onAuthStateChange((evento, sesion) => {
        if (evento === 'SIGNED_OUT') { salirDeLaVista(); return; }
        if (sesion?.user?.id) {
            usuarioDeSesion = sesion.user.id;
            if (usuarioVerificado && usuarioVerificado !== usuarioDeSesion) salirDeLaVista();
        }
    });
    const acceso = await consultarAcceso();
    if (redirigiendo) return;
    if (!acceso || (usuarioDeSesion && usuarioDeSesion !== acceso.usuario.id)) { salirDeLaVista(); return; }
    if (!puedeAbrirModulo(acceso.perfil.rol, 'trabajos')) {
        mensaje.textContent = 'Este módulo no está habilitado para tu tipo de cuenta.';
        mensaje.className = 'error'; mensaje.setAttribute('role', 'alert');
        return;
    }
    usuarioVerificado = acceso.usuario.id;
    document.getElementById('usuario-empresarial').textContent = acceso.perfil.nombre_usuario;
    prepararEncabezadoEmpresarial(document.querySelector('.cabecera-empresarial'), {
        cerrarSesion: async () => {
            const boton = document.getElementById('cerrar-sesion');
            if (boton.disabled || vistaTrabajos.estaOcupado()) return;
            if (!await vistaTrabajos.confirmarSalida() || redirigiendo) return;
            boton.disabled = true; sitio.inert = true; estado.hidden = false;
            mensaje.textContent = 'Cerrando sesión…'; mensaje.className = ''; mensaje.setAttribute('role', 'status');
            const loader = estado.querySelector('.movanza-loader'); if (loader) loader.hidden = false;
            try {
                const { error } = await supabase.auth.signOut();
                if (error) throw error;
                salirDeLaVista();
            } catch {
                mensaje.textContent = 'No se pudo cerrar la sesión. Vuelve a intentarlo.';
                mensaje.className = 'error'; mensaje.setAttribute('role', 'alert');
            } finally {
                if (loader) loader.hidden = true;
                boton.disabled = false; sitio.inert = false;
            }
        }
    });
    vistaTrabajos.iniciar();
    const idEmpresa = sessionStorage.getItem('movanza_empresa_activa');
    const modulo = await import('./trabajos.js');
    const empresa = await modulo.trabajosListos;
    if (redirigiendo) return;
    if (sessionStorage.getItem('movanza_empresa_activa') !== idEmpresa) {
        redirigiendo = true; vistaTrabajos.retirar(); location.replace('./seleccionar_empresa.html'); return;
    }
    if (!empresa) {
        const nombre = document.getElementById('nombre-empresa');
        if (nombre.textContent.startsWith('Cargando empresa')) nombre.textContent = 'Empresa no disponible';
        document.getElementById('lista-trabajos').textContent = 'No se pudieron cargar los trabajos.';
    }
    if (idEmpresa && /^\d+$/.test(idEmpresa)) document.querySelector('[data-estadisticas-empresa]').href = './estadisticas.html?empresa=' + encodeURIComponent(idEmpresa);
    principal.hidden = false; sitio.hidden = false; estado.hidden = true;
    if (empresa) {
        const activar = () => { if (!redirigiendo) vistaTrabajos.activar(); };
        if (window.requestAnimationFrame) window.requestAnimationFrame(activar); else activar();
    }
    window.addEventListener('pagehide', () => { sitio.hidden = true; principal.hidden = true; vistaTrabajos.retirar(); });
    window.addEventListener('pageshow', evento => { if (evento.persisted) window.location.reload(); });
}
