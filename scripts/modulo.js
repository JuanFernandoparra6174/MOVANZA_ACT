import { supabase } from '../configuracion/supabase.js';
import { consultarAcceso, crearNavegacion, puedeAbrirModulo } from './acceso.js';
import { crearCuentaElemento } from './cuenta-interfaz.js';

const principal = document.querySelector('main');
const modulo = document.body.dataset.modulo;

function mostrarError(texto) {
    const tarjeta = document.createElement('section');
    tarjeta.className = 'tarjeta';
    const titulo = document.createElement('h1');
    titulo.textContent = 'Acceso no disponible';
    const mensaje = document.createElement('p');
    mensaje.textContent = texto;
    mensaje.setAttribute('role', 'alert');
    const volver = document.createElement('a');
    volver.href = '../index.html';
    volver.textContent = 'Volver a mi cuenta';
    tarjeta.append(titulo, mensaje, volver);
    principal.replaceChildren(tarjeta);
    principal.hidden = false;
}

try {
    const acceso = await consultarAcceso();
    if (!acceso) {
        location.replace('../index.html');
    } else if (!puedeAbrirModulo(acceso.perfil.rol, modulo)) {
        mostrarError('Este módulo no está habilitado para tu tipo de cuenta.');
    } else {
        const navegacion = crearNavegacion(acceso.perfil.rol, './', modulo);
        principal.querySelector('header').after(navegacion);
        const estilosCuenta = document.createElement('link');
        estilosCuenta.rel = 'stylesheet';
        estilosCuenta.href = '../estilos/cuenta.css';
        document.head.append(estilosCuenta);
        const cabecera = principal.querySelector('header');
        cabecera.classList.add('cabecera-con-cuenta');
        const cuenta = crearCuentaElemento({ raiz: '../' }, async () => {
            const boton = cuenta.querySelector('#cerrar-sesion');
            if (boton.disabled) return;
            boton.disabled = true;
            boton.textContent = 'Cerrando sesión…';
            let estado = cabecera.querySelector('.estado-cuenta');
            if (!estado) {
                estado = document.createElement('p');
                estado.className = 'estado-cuenta';
                estado.setAttribute('role', 'alert');
                cabecera.append(estado);
            }
            estado.textContent = '';
            try {
                const { error } = await supabase.auth.signOut();
                if (error) throw error;
                if (!principal.hidden) {
                    principal.hidden = true;
                    sessionStorage.removeItem('movanza_empresa_activa');
                    location.replace('../index.html');
                }
            } catch {
                estado.textContent = 'No se pudo cerrar la sesión. Vuelve a intentarlo.';
            } finally {
                boton.disabled = false;
                boton.textContent = 'Cerrar sesión';
            }
        });
        cabecera.append(cuenta);

        // Se carga el código del módulo solo después de comprobar el acceso.
        if (modulo === 'administracion') {
            document.getElementById('usuario-actual').textContent =
                '@' + acceso.perfil.nombre_usuario;
        } else {
            await import(`./${modulo}.js`);
        }
        principal.hidden = false;

        supabase.auth.onAuthStateChange((evento, sesion) => {
            if (evento === 'SIGNED_OUT' ||
                (sesion && sesion.user.id !== acceso.usuario.id)) {
                principal.hidden = true;
                sessionStorage.removeItem('movanza_empresa_activa');
                location.replace('../index.html');
            }
        });
    }
} catch (error) {
    mostrarError('No se pudo verificar el acceso. ' + error.message);
    console.error(error);
}
