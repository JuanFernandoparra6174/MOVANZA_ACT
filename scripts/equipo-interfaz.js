import { supabase } from '../configuracion/supabase.js';
import { consultarAcceso, puedeAbrirModulo } from './acceso.js';
import { prepararEncabezadoEmpresarial } from './encabezado-empresarial.js';

// Orquesta únicamente la presentación; equipo.js conserva las consultas y RPC.
export async function iniciarEquipo() {
    const sitio = document.getElementById('sitio-equipo');
    const principal = document.querySelector('main');
    const estado = document.getElementById('estado-acceso');
    const mensajeAcceso = document.getElementById('mensaje-acceso');
    let redirigiendo = false;
    let usuarioVerificado = null;
    let usuarioDeSesion = null;
    function salirDeLaVista() {
        if (redirigiendo) return;
        redirigiendo = true;
        sitio.hidden = true;
        principal.hidden = true;
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
    if (!puedeAbrirModulo(acceso.perfil.rol, 'equipo')) {
        mensajeAcceso.textContent = 'Este módulo no está habilitado para tu tipo de cuenta.';
        mensajeAcceso.setAttribute('role', 'alert');
        mensajeAcceso.className = 'error';
        return;
    }
    usuarioVerificado = acceso.usuario.id;
    document.getElementById('usuario-empresarial').textContent = acceso.perfil.nombre_usuario;
    prepararEncabezadoEmpresarial(document.querySelector('.cabecera-empresarial'), {
        cerrarSesion: async () => {
            const boton = document.getElementById('cerrar-sesion');
            if (boton.disabled) return;
            boton.disabled = true;
            sitio.inert = true;
            estado.hidden = false;
            mensajeAcceso.setAttribute('role', 'status');
            mensajeAcceso.className = '';
            mensajeAcceso.textContent = 'Cerrando sesión…';
            const loader = estado.querySelector('.movanza-loader');
            if (loader) loader.hidden = false;
            try {
                const { error } = await supabase.auth.signOut();
                if (error) throw error;
                salirDeLaVista();
            } catch {
                mensajeAcceso.textContent = 'No se pudo cerrar la sesión. Vuelve a intentarlo.';
                mensajeAcceso.className = 'error';
                mensajeAcceso.setAttribute('role', 'alert');
            } finally {
                if (loader) loader.hidden = true;
                sitio.inert = false;
                boton.disabled = false;
            }
        }
    });
    const mensaje = document.getElementById('mensaje');
    if (window.MovanzaUI) {
        const loader = window.MovanzaUI.crearLoader('Procesando solicitud…');
        mensaje.after(loader);
        window.MovanzaUI.observarCarga({ region: mensaje, indicador: loader,
            ocupado: () => /^(Procesando solicitud|Buscando usuario)/.test(mensaje.textContent) });
    }
    const idEmpresa = sessionStorage.getItem('movanza_empresa_activa');
    const modulo = await import('./equipo.js');
    await modulo.equipoListo;
    if (redirigiendo) return;
    if (sessionStorage.getItem('movanza_empresa_activa') !== idEmpresa) {
        redirigiendo = true;
        location.replace('./seleccionar_empresa.html');
        return;
    }
    if (document.getElementById('titulo-empresa').textContent.startsWith('Cargando empresa')) {
        document.getElementById('titulo-empresa').textContent = 'Empresa no disponible';
    }
    for (const lista of document.querySelectorAll('#lista-integrantes, #lista-pendientes')) {
        const parrafo = lista.querySelector(':scope > p');
        if (parrafo?.textContent.startsWith('Cargando')) parrafo.textContent = 'No se pudo cargar esta información.';
    }
    if (idEmpresa && /^\d+$/.test(idEmpresa)) {
        document.querySelector('[data-estadisticas-empresa]').href = './estadisticas.html?empresa=' + encodeURIComponent(idEmpresa);
    }
    window.addEventListener('pagehide', () => { sitio.hidden = true; principal.hidden = true; });
    window.addEventListener('pageshow', evento => { if (evento.persisted) window.location.reload(); });
    principal.hidden = false;
    sitio.hidden = false;
    estado.hidden = true;
}
