import { supabase } from '../configuracion/supabase.js';
import { consultarAcceso, puedeAbrirModulo } from './acceso.js';
import { prepararEncabezadoEmpresarial } from './encabezado-empresarial.js';
import { montarMensajeria } from './mensajeria-panel.js';

export async function iniciarHomeEmpresa2() {
    const contenido = document.getElementById('contenido-empresa');
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
    function seleccionarOtraEmpresa({ limpiar = true } = {}) {
        if (redirigiendo) return;
        redirigiendo = true;
        mensajeria?.destruir();
        contenido.hidden = true;
        if (limpiar) sessionStorage.removeItem('movanza_empresa_activa');
        location.replace('./paginas/seleccionar_empresa.html');
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
    if (!puedeAbrirModulo(acceso.perfil.rol, 'empresas')) {
        mensaje.textContent = 'Este espacio está disponible para cuentas de empresa.';
        mensaje.className = 'error';
        mensaje.setAttribute('role', 'alert');
        return;
    }
    usuarioVerificado = acceso.usuario.id;
    const idEmpresa = sessionStorage.getItem('movanza_empresa_activa');
    if (!idEmpresa || !/^\d+$/.test(idEmpresa)) { seleccionarOtraEmpresa(); return; }

    // Mismo contexto y comprobación de propietario que utilizan Equipo y Trabajos.
    const { data: empresa, error } = await supabase.from('empresas')
        .select('id, nombre, propietario_id')
        .eq('id', idEmpresa)
        .eq('propietario_id', acceso.perfil.id)
        .single();
    if (redirigiendo) return;
    if (sessionStorage.getItem('movanza_empresa_activa') !== idEmpresa) {
        seleccionarOtraEmpresa({ limpiar: false });
        return;
    }
    if (error && error.code !== 'PGRST116') throw error;
    if (!empresa || String(empresa.id) !== idEmpresa || empresa.propietario_id !== acceso.perfil.id) {
        seleccionarOtraEmpresa();
        return;
    }
    document.getElementById('nombre-empresa-activa').textContent = empresa.nombre;
    document.getElementById('usuario-empresarial').textContent = acceso.perfil.nombre_usuario;
    document.querySelectorAll('[data-estadisticas-empresa]').forEach(enlace => {
        enlace.href = './paginas/estadisticas.html?empresa=' + encodeURIComponent(String(empresa.id));
    });
    prepararEncabezadoEmpresarial(document.querySelector('.cabecera-empresarial'), {
        cerrarSesion: async () => {
            const boton = document.getElementById('cerrar-sesion');
            if (boton.disabled) return;
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
    mensajeria = montarMensajeria({ anfitrion: contenido, empresa, perfil: acceso.perfil,
        contextoVigente: () => !redirigiendo && sessionStorage.getItem('movanza_empresa_activa') === idEmpresa });
    window.addEventListener('pagehide', () => { mensajeria?.destruir(); contenido.hidden = true; });
    window.addEventListener('pageshow', evento => { if (evento.persisted) window.location.reload(); });
    estado.hidden = true;
    contenido.hidden = false;
}
