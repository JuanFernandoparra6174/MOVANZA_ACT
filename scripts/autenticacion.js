
import { supabase } from '../configuracion/supabase.js';
import { consultarAcceso } from './acceso.js';
import { crearCuentaElemento } from './cuenta-interfaz.js';

// Elementos de la interfaz
const seccionAcceso = document.getElementById('seccion-acceso');
const seccionRegistro = document.getElementById('seccion-registro');
const seccionPerfil = document.getElementById('seccion-perfil');
const mensaje = document.getElementById('mensaje');

const formularioAcceso = document.getElementById('formulario-acceso');
const formularioRegistro = document.getElementById('formulario-registro');
let usuarioPerfilId = null;
const vista = document.body.dataset.autenticacion || 'perfil';
let operacionEnCurso = false;
const destinos = Object.freeze({
    empresa: './home_empresa_1.html',
    trabajador: './home_trabajador.html',
    administrador: './paginas/administracion.html'
});

function mostrarSeccion(seccion) {
    [seccionAcceso, seccionRegistro, seccionPerfil].forEach(elemento => elemento?.classList.add('oculto'));

    seccion?.classList.remove('oculto');
    mensaje.textContent = '';
    mensaje.className = '';
    // El encabezado público solo cambia después de verificar el perfil.
    if (vista === 'perfil') {
        const cabecera = document.querySelector('.cabecera-publica');
        if (!cabecera) return;
        const autenticado = seccion === seccionPerfil && usuarioPerfilId !== null;
        let cuenta = cabecera.querySelector('.menu-cuenta');
        if (autenticado && !cuenta) {
            cuenta = crearCuentaElemento({}, () => document.getElementById('boton-salir').click());
            cabecera.append(cuenta);
        }
        if (cuenta) { cuenta.hidden = !autenticado; if (!autenticado) cuenta.open = false; }
        const acceso = cabecera.querySelector('.boton-acceso');
        if (acceso) acceso.hidden = autenticado;
    }
}

function mostrarMensaje(texto, tipo = '') {
    mensaje.textContent = texto;
    mensaje.className = tipo;
}

function bloquearFormulario(formulario, bloquear) {
    formulario.querySelectorAll('button').forEach(boton => {
        boton.disabled = bloquear;
    });
}

// Navegación entre inicio de sesión y registro
document.getElementById('mostrar-registro')
    ?.addEventListener('click', () => {
        mostrarSeccion(seccionRegistro);
    });

document.getElementById('mostrar-acceso')
    ?.addEventListener('click', () => {
        mostrarSeccion(seccionAcceso);
    });

// REGISTRAR USUARIO
formularioRegistro?.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (operacionEnCurso || !formularioRegistro.reportValidity()) return;

    const correo = document.getElementById('correo-registro')
        .value.trim();

    const clave = document.getElementById('clave-registro').value;
    const rol = document.getElementById('rol-registro').value;

    if (!['empresa', 'trabajador'].includes(rol)) {
        mostrarMensaje('Selecciona Empresa o Trabajador.', 'error');
        return;
    }

    const confirmarClave = document.getElementById('confirmar-clave')
        .value;

    if (clave !== confirmarClave) {
        mostrarMensaje('Las contraseñas no coinciden.', 'error');
        return;
    }

    operacionEnCurso = true;
    bloquearFormulario(formularioRegistro, true);
    mostrarMensaje('Creando cuenta...');

    try {
        const { data, error } = await supabase.auth.signUp({
            email: correo,
            password: clave,
            options: { data: { rol } }
        });

        if (error) throw error;

        if (data.session) {
            sessionStorage.removeItem('movanza_empresa_activa');
            await cargarPerfil();
        } else {
            if (vista === 'signup') {
                location.replace('./login.html?registro=confirmar' + (document.body.dataset.presentacion === 'modal' ? '&presentacion=modal' : ''));
                return;
            }
            mostrarSeccion(seccionAcceso);
            mostrarMensaje(
                'Registro solicitado. Revisa tu correo si la confirmación está activada. Si la cuenta ya existe, intenta iniciar sesión.',
                'exito'
            );
        }

    } catch (error) {
        mostrarMensaje(error.message, 'error');
        console.error('Error de registro:', error);
    } finally {
        operacionEnCurso = false;
        bloquearFormulario(formularioRegistro, false);
    }
});

// INICIAR SESIÓN
formularioAcceso?.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (operacionEnCurso || !formularioAcceso.reportValidity()) return;

    const correo = document.getElementById('correo-acceso')
        .value.trim();

    const clave = document.getElementById('clave-acceso').value;

    operacionEnCurso = true;
    bloquearFormulario(formularioAcceso, true);
    mostrarMensaje('Iniciando sesión...');

    try {
        const { error } = await supabase.auth.signInWithPassword({
            email: correo,
            password: clave
        });

        if (error) throw error;

        sessionStorage.removeItem('movanza_empresa_activa');
        await cargarPerfil();

    } catch (error) {
        mostrarMensaje(
            error.code === 'invalid_credentials' || error.message === 'Invalid login credentials'
                ? 'El correo o la contraseña no son correctos.' : error.message,
            'error'
        );
        console.error('Error al iniciar sesión:', error);
    } finally {
        operacionEnCurso = false;
        bloquearFormulario(formularioAcceso, false);
    }
});

// CONSULTAR EL PERFIL AUTENTICADO
async function cargarPerfil() {
    const acceso = await consultarAcceso();
    if (!acceso) {
        mostrarSeccion(vista === 'signup' ? seccionRegistro : seccionAcceso);
        return;
    }
    const { usuario, perfil } = acceso;
    usuarioPerfilId = usuario.id;
    if (vista === 'login' || vista === 'signup') {
        if (document.body.dataset.presentacion === 'modal') {
            window.parent.postMessage({ tipo: 'movanza:auth-completa', destino: destinos[perfil.rol] }, window.location.origin);
        } else {
            location.replace(destinos[perfil.rol]);
        }
        return;
    }

    mostrarSeccion(seccionPerfil);
}

// CERRAR SESIÓN
document.getElementById('boton-salir')
    ?.addEventListener('click', async () => {
        const boton = document.getElementById('boton-salir');
        boton.disabled = true;

        try {
            const { error } = await supabase.auth.signOut();

            if (error) throw error;

            sessionStorage.removeItem('movanza_empresa_activa');
            formularioAcceso?.reset();
            formularioRegistro?.reset();

            mostrarSeccion(seccionAcceso);
            mostrarMensaje('Sesión cerrada correctamente.', 'exito');

        } catch (error) {
            mostrarMensaje(error.message, 'error');
        } finally {
            boton.disabled = false;
        }
    });

// RECUPERAR SESIÓN AL ABRIR LA PÁGINA
async function iniciarAplicacion() {
    mostrarMensaje('Comprobando sesión...');

    try {
        const { data, error } = await supabase.auth.getSession();

        if (error) throw error;

        if (data.session) {
            await cargarPerfil();
        } else {
            mostrarSeccion(vista === 'signup' ? seccionRegistro : seccionAcceso);
            if (vista === 'login' && new URLSearchParams(location.search).get('registro') === 'confirmar') {
                mostrarMensaje('Registro solicitado. Revisa tu correo si la confirmación está activada. Si la cuenta ya existe, intenta iniciar sesión.', 'exito');
            }
        }

    } catch (error) {
        mostrarMensaje(
            'No se pudo cargar la sesión: ' + error.message,
            'error'
        );
        console.error(error);
    }
}

iniciarAplicacion();

// Evita conservar la pantalla de otra sesión al salir desde otra pestaña.
supabase.auth.onAuthStateChange((evento, sesion) => {
    if (evento === 'SIGNED_OUT') {
        usuarioPerfilId = null;
        sessionStorage.removeItem('movanza_empresa_activa');
        mostrarSeccion(vista === 'signup' ? seccionRegistro : seccionAcceso);
    } else if (evento === 'SIGNED_IN' && sesion?.user.id !== usuarioPerfilId && !operacionEnCurso) {
        sessionStorage.removeItem('movanza_empresa_activa');
        mostrarSeccion(vista === 'signup' ? seccionRegistro : seccionAcceso);
        // Consultar Auth fuera del callback evita bloquear su actualización de sesión.
        setTimeout(() => cargarPerfil().catch(error => {
            mostrarSeccion(vista === 'signup' ? seccionRegistro : seccionAcceso);
            mostrarMensaje('No se pudo verificar tu cuenta. ' + error.message, 'error');
        }), 0);
    }
});
