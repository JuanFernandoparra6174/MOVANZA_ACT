
import { supabase } from '../configuracion/supabase.js';
import { consultarAcceso, crearNavegacion, NOMBRES_ROL } from './acceso.js';

// Elementos de la interfaz
const seccionAcceso = document.getElementById('seccion-acceso');
const seccionRegistro = document.getElementById('seccion-registro');
const seccionPerfil = document.getElementById('seccion-perfil');
const mensaje = document.getElementById('mensaje');

const formularioAcceso = document.getElementById('formulario-acceso');
const formularioRegistro = document.getElementById('formulario-registro');
const formularioPerfil = document.getElementById('formulario-perfil');
let usuarioPerfilId = null;

function mostrarSeccion(seccion) {
    seccionAcceso.classList.add('oculto');
    seccionRegistro.classList.add('oculto');
    seccionPerfil.classList.add('oculto');

    seccion.classList.remove('oculto');
    mensaje.textContent = '';
    mensaje.className = '';
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
    .addEventListener('click', () => {
        mostrarSeccion(seccionRegistro);
    });

document.getElementById('mostrar-acceso')
    .addEventListener('click', () => {
        mostrarSeccion(seccionAcceso);
    });

// REGISTRAR USUARIO
formularioRegistro.addEventListener('submit', async (evento) => {
    evento.preventDefault();

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
        bloquearFormulario(formularioRegistro, false);
    }
});

// INICIAR SESIÓN
formularioAcceso.addEventListener('submit', async (evento) => {
    evento.preventDefault();

    const correo = document.getElementById('correo-acceso')
        .value.trim();

    const clave = document.getElementById('clave-acceso').value;

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
        mostrarMensaje(error.message, 'error');
        console.error('Error al iniciar sesión:', error);
    } finally {
        bloquearFormulario(formularioAcceso, false);
    }
});

// CONSULTAR EL PERFIL AUTENTICADO
async function cargarPerfil() {
    const acceso = await consultarAcceso();
    if (!acceso) {
        mostrarSeccion(seccionAcceso);
        return;
    }
    const { usuario, perfil } = acceso;
    usuarioPerfilId = usuario.id;

    document.getElementById('perfil-id').textContent = perfil.id;

    document.getElementById('perfil-correo').textContent =
        usuario.email || '';

    document.getElementById('nombre-usuario').value =
        perfil.nombre_usuario;

    document.getElementById('nombre-completo').value =
        perfil.nombre_completo || '';

    document.getElementById('perfil-rol').textContent = NOMBRES_ROL[perfil.rol];
    document.querySelectorAll('[data-roles]').forEach(elemento => {
        elemento.classList.toggle(
            'oculto', !elemento.dataset.roles.split(' ').includes(perfil.rol)
        );
    });
    document.getElementById('modulos-cuenta').replaceChildren(
        crearNavegacion(perfil.rol, './paginas/')
    );

    mostrarSeccion(seccionPerfil);
    mostrarMensaje('Perfil cargado correctamente.', 'exito');
}

// ACTUALIZAR PERFIL
formularioPerfil.addEventListener('submit', async (evento) => {
    evento.preventDefault();

    const nombreUsuario = document.getElementById('nombre-usuario')
        .value.trim().toLowerCase();

    const nombreCompleto = document.getElementById('nombre-completo')
        .value.trim();

    bloquearFormulario(formularioPerfil, true);
    mostrarMensaje('Guardando perfil...');

    try {
        // Función SQL creada en nuestra migración
        const { error } = await supabase.rpc('actualizar_mi_perfil', {
            nombre_usuario: nombreUsuario,
            nombre_completo: nombreCompleto
        });

        if (error) throw error;

        await cargarPerfil();
        mostrarMensaje('Perfil actualizado correctamente.', 'exito');

    } catch (error) {
        if (error.code === '23505') {
            mostrarMensaje(
                'Este nombre de usuario ya está ocupado.',
                'error'
            );
        } else {
            mostrarMensaje(error.message, 'error');
        }

        console.error('Error al actualizar perfil:', error);
    } finally {
        bloquearFormulario(formularioPerfil, false);
    }
});

// CERRAR SESIÓN
document.getElementById('boton-salir')
    .addEventListener('click', async () => {
        const boton = document.getElementById('boton-salir');
        boton.disabled = true;

        try {
            const { error } = await supabase.auth.signOut();

            if (error) throw error;

            sessionStorage.removeItem('movanza_empresa_activa');
            formularioAcceso.reset();
            formularioRegistro.reset();
            formularioPerfil.reset();

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
            mostrarSeccion(seccionAcceso);
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
        formularioPerfil.reset();
        mostrarSeccion(seccionAcceso);
    } else if (evento === 'SIGNED_IN' && sesion?.user.id !== usuarioPerfilId) {
        sessionStorage.removeItem('movanza_empresa_activa');
        mostrarSeccion(seccionAcceso);
        // Consultar Auth fuera del callback evita bloquear su actualización de sesión.
        setTimeout(() => cargarPerfil().catch(error => {
            mostrarSeccion(seccionAcceso);
            mostrarMensaje('No se pudo verificar tu cuenta. ' + error.message, 'error');
        }), 0);
    }
});
