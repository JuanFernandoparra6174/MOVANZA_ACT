import { supabase } from '../configuracion/supabase.js';
import { consultarAcceso, NOMBRES_ROL } from './acceso.js';
import { actualizarMiPerfil } from './perfil-datos.js';
import { confirmarAccion } from './alertas.js';

let instancia;
function crearPerfil() {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = new URL('../estilos/perfil-modal.css', import.meta.url).href;
    document.head.append(css);
    const dialogo = document.createElement('dialog');
    dialogo.id = 'perfil-modal';
    dialogo.className = 'perfil-modal';
    dialogo.setAttribute('aria-labelledby', 'perfil-titulo');
    dialogo.innerHTML = `
        <header class="perfil-cabecera"><div><p class="perfil-antetitulo">MOVANZA · MI CUENTA</p><h2 id="perfil-titulo" tabindex="-1">Tu perfil</h2></div><button type="button" data-cerrar aria-label="Cerrar perfil">Cerrar <span aria-hidden="true">×</span></button></header>
        <p class="perfil-estado" role="status" aria-live="polite"></p>
        <button type="button" data-reintentar hidden>Volver a intentar</button>
        <div class="perfil-contenido" hidden>
            <section class="perfil-identidad" aria-label="Identidad de la cuenta"><span class="perfil-avatar" aria-hidden="true"></span><div><h3 data-nombre></h3><p data-correo></p><span class="perfil-insignia" data-rol></span></div></section>
            <section class="perfil-tarjeta" aria-labelledby="perfil-personal"><div class="perfil-seccion"><div><p class="perfil-antetitulo">DATOS PERSONALES</p><h3 id="perfil-personal">Información personal</h3></div><button type="button" data-editar>Editar perfil <span aria-hidden="true">↗</span></button></div>
                <dl class="perfil-datos"><div><dt>Nombre completo</dt><dd data-completo></dd></div><div><dt>Nombre de usuario</dt><dd data-usuario></dd></div><div class="perfil-ancho"><dt>Correo electrónico</dt><dd data-email></dd></div></dl>
                <form class="perfil-formulario" hidden>
                    <div class="perfil-campos"><div><label for="perfil-nombre-completo">Nombre completo</label><input id="perfil-nombre-completo" name="nombre_completo" maxlength="150" autocomplete="name" aria-describedby="perfil-ayuda-nombre"><small id="perfil-ayuda-nombre">Tu nombre y apellidos para identificarte en MOVANZA.</small></div>
                    <div><label for="perfil-nombre-usuario">Nombre de usuario</label><input id="perfil-nombre-usuario" name="nombre_usuario" required minlength="3" maxlength="30" pattern="[a-z0-9_]{3,30}" autocomplete="username" aria-describedby="perfil-ayuda-usuario"><small id="perfil-ayuda-usuario">De 3 a 30 caracteres: letras minúsculas, números o guion bajo. Debe ser único.</small></div></div>
                    <div class="perfil-acciones"><button type="button" data-cancelar>Cancelar</button><button class="perfil-primario" type="submit">Guardar cambios</button></div>
                </form>
            </section>
            <footer class="perfil-cuenta"><div><h3>Sesión de tu cuenta</h3><p>Cierra tu sesión cuando termines de trabajar.</p></div><button type="button" data-salir>Cerrar sesión</button></footer>
        </div>`;
    document.body.append(dialogo);
    const buscar = selector => dialogo.querySelector(selector);
    const formulario = buscar('form');
    const completo = buscar('[name="nombre_completo"]');
    const usuario = buscar('[name="nombre_usuario"]');
    let acceso, origen, salir, ocupado = false, cerrando = false, version = 0;
    const sucio = () => !formulario.hidden && acceso &&
        (completo.value !== (acceso.perfil.nombre_completo || '') || usuario.value !== acceso.perfil.nombre_usuario);
    const descartar = () => !sucio() || confirmarAccion({ titulo: 'Cambios sin guardar', mensaje: '¿Descartar los cambios del perfil sin guardar?', textoConfirmar: 'Descartar cambios', destructiva: true });
    function mensaje(texto, error = false) {
        buscar('.perfil-estado').textContent = texto;
        buscar('.perfil-estado').classList.toggle('perfil-error', error);
        buscar('.perfil-estado').setAttribute('role', error ? 'alert' : 'status');
    }
    function bloquear(valor) {
        ocupado = valor;
        dialogo.setAttribute('aria-busy', String(valor));
        dialogo.querySelectorAll('button, input').forEach(el => { el.disabled = valor; });
    }
    function presentar() {
        const p = acceso.perfil;
        buscar('[data-nombre]').textContent = p.nombre_completo || p.nombre_usuario;
        buscar('[data-correo]').textContent = acceso.usuario.email || 'Correo no disponible';
        buscar('[data-email]').textContent = acceso.usuario.email || 'No disponible';
        buscar('[data-completo]').textContent = p.nombre_completo || 'Sin completar';
        buscar('[data-usuario]').textContent = '@' + p.nombre_usuario;
        buscar('[data-rol]').textContent = NOMBRES_ROL[p.rol];
        buscar('.perfil-avatar').textContent = (p.nombre_completo || p.nombre_usuario).trim().split(/\s+/).slice(0, 2).map(palabra => palabra[0]).join('').toUpperCase();
        completo.value = p.nombre_completo || '';
        usuario.value = p.nombre_usuario;
        formulario.hidden = true;
        buscar('.perfil-datos').hidden = false;
        buscar('[data-editar]').hidden = false;
        buscar('.perfil-contenido').hidden = false;
    }
    async function cargar() {
        const actual = ++version;
        bloquear(true);
        buscar('[data-reintentar]').hidden = true;
        mensaje('Cargando tu perfil…');
        try {
            const resultado = await consultarAcceso();
            if (actual !== version || !dialogo.open) return;
            if (!resultado) throw new Error('Tu sesión no está disponible. Vuelve a iniciar sesión.');
            acceso = resultado;
            presentar();
            mensaje('');
        } catch (error) {
            if (actual !== version || !dialogo.open) return;
            mensaje(error.message || 'No se pudo cargar el perfil.', true);
            buscar('[data-reintentar]').hidden = false;
        } finally {
            if (actual === version) bloquear(false);
        }
    }
    async function cerrar(forzar = false) {
        if (cerrando || (!forzar && (ocupado || !await descartar()))) return;
        if (!dialogo.open || cerrando || (!forzar && ocupado)) return;
        cerrando = true;
        dialogo.inert = true;
        ++version;
        if (!forzar && dialogo.animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            await dialogo.animate([{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(12px)' }], { duration: 160 }).finished.catch(() => {});
        }
        dialogo.close();
        dialogo.inert = false;
        acceso = null;
        formulario.reset();
        dialogo.querySelectorAll('[data-nombre], [data-correo], [data-email], [data-completo], [data-usuario], [data-rol], .perfil-avatar').forEach(el => { el.textContent = ''; });
        buscar('.perfil-contenido').hidden = true;
        mensaje('');
        bloquear(false);
        cerrando = false;
        if (origen?.isConnected) origen.focus({ preventScroll: true });
    }
    buscar('[data-cerrar]').addEventListener('click', () => cerrar());
    dialogo.addEventListener('cancel', evento => { evento.preventDefault(); cerrar(); });
    buscar('[data-reintentar]').addEventListener('click', cargar);
    buscar('[data-editar]').addEventListener('click', () => {
        formulario.hidden = false;
        buscar('.perfil-datos').hidden = true;
        buscar('[data-editar]').hidden = true;
        mensaje('');
        completo.focus();
    });
    buscar('[data-cancelar]').addEventListener('click', async () => {
        if (!await descartar() || !dialogo.open || ocupado) return;
        presentar(); mensaje(''); buscar('[data-editar]').focus();
    });
    formulario.addEventListener('submit', async evento => {
        evento.preventDefault();
        if (ocupado || !formulario.reportValidity()) return;
        bloquear(true);
        const actual = version;
        mensaje('Guardando cambios…');
        try {
            await actualizarMiPerfil(usuario.value, completo.value);
            if (actual !== version) return;
            const actualizado = await consultarAcceso();
            if (actual !== version) return;
            if (!actualizado || actualizado.usuario.id !== acceso.usuario.id) throw new Error('No se pudo verificar tu cuenta.');
            acceso = actualizado;
            presentar();
            // Actualiza la identificación del encabezado sin reiniciar el módulo.
            document.querySelectorAll('#usuario-empresarial').forEach(el => { el.textContent = acceso.perfil.nombre_usuario; });
            mensaje('Perfil actualizado correctamente.');
            buscar('[data-editar]').focus();
        } catch (error) {
            if (actual === version) mensaje(error.code === '23505' ? 'Este nombre de usuario ya está ocupado.' : (error.message || 'No se pudieron guardar los cambios. Vuelve a intentarlo.'), true);
        } finally {
            if (actual === version) { bloquear(false); if (formulario.hidden) buscar('[data-editar]').focus(); }
        }
    });
    buscar('[data-salir]').addEventListener('click', async () => {
        if (ocupado || !await descartar() || !dialogo.open) return;
        // Delega en el botón y la operación de cierre de sesión de la página actual.
        const control = salir;
        await cerrar(true);
        control?.click();
    });
    window.addEventListener('beforeunload', evento => {
        if (dialogo.open && sucio()) { evento.preventDefault(); evento.returnValue = ''; }
    });
    // Borra los datos si la sesión termina o cambia mientras hay una petición pendiente.
    supabase.auth.onAuthStateChange((evento, sesion) => {
        if (dialogo.open && (evento === 'SIGNED_OUT' || (evento === 'SIGNED_IN' && !acceso) || (acceso && sesion?.user?.id && sesion.user.id !== acceso.usuario.id))) cerrar(true);
    });
    // showModal hace inerte el fondo; este control mantiene también el ciclo de Tab.
    dialogo.addEventListener('keydown', evento => {
        if (evento.key !== 'Tab') return;
        const controles = [...dialogo.querySelectorAll('button, input')].filter(el => !el.disabled && !el.closest('[hidden]'));
        if (!controles.length) { evento.preventDefault(); buscar('#perfil-titulo').focus(); return; }
        const primero = controles[0], ultimo = controles.at(-1);
        if (evento.shiftKey && (document.activeElement === primero || !controles.includes(document.activeElement))) { evento.preventDefault(); ultimo.focus(); }
        else if (!evento.shiftKey && (document.activeElement === ultimo || !controles.includes(document.activeElement))) { evento.preventDefault(); primero.focus(); }
    });
    return async opciones => {
        if (dialogo.open || cerrando) return;
        origen = opciones.origen || document.activeElement;
        salir = opciones.salir;
        buscar('.perfil-contenido').hidden = true;
        dialogo.showModal();
        buscar('#perfil-titulo').focus();
        await cargar();
    };
}

export function abrirPerfil(opciones = {}) {
    instancia ||= crearPerfil();
    return instancia(opciones);
}
