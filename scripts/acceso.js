import { supabase } from '../configuracion/supabase.js';

export const NOMBRES_ROL = Object.freeze({
    empresa: 'Empresa',
    trabajador: 'Trabajador',
    administrador: 'Administrador'
});

export const MODULOS = Object.freeze({
    trabajos: { nombre: 'Trabajos', roles: ['empresa'] },
    mis_asignaciones: { nombre: 'Mis asignaciones', roles: ['trabajador'] },
    mis_invitaciones: { nombre: 'Mis invitaciones', roles: ['trabajador'] },
    mensajes: { nombre: 'Mensajes', roles: ['empresa', 'trabajador'] },
    estadisticas: { nombre: 'Estadísticas', roles: ['empresa'] },
    equipo: { nombre: 'Equipo', roles: ['empresa'] },
    empresas: { nombre: 'Empresas', roles: ['empresa'] },
    administracion: { nombre: 'Panel administrativo', roles: ['administrador'] }
});

export function puedeAbrirModulo(rol, modulo) {
    return Object.hasOwn(MODULOS, modulo) && MODULOS[modulo].roles.includes(rol);
}

export async function consultarAcceso() {
    const { data, error } = await supabase.auth.getUser();
    if (error && error.name !== 'AuthSessionMissingError') throw error;
    if (!data?.user) return null;

    const resultado = await supabase.from('perfiles')
        .select('id, nombre_usuario, nombre_completo, rol')
        .eq('usuario_auth_id', data.user.id)
        .single();

    if (resultado.error) throw resultado.error;
    if (!Object.hasOwn(NOMBRES_ROL, resultado.data.rol)) {
        throw new Error('Tu cuenta no tiene un rol válido. Contacta al administrador.');
    }

    return { usuario: data.user, perfil: resultado.data };
}

export function crearNavegacion(rol, prefijo = './', actual = '') {
    const navegacion = document.createElement('nav');
    navegacion.setAttribute('aria-label', 'Módulos de MOVANZA');
    navegacion.className = 'navegacion-modulos';

    for (const [modulo, datos] of Object.entries(MODULOS)) {
        if (!puedeAbrirModulo(rol, modulo)) continue;
        const enlace = document.createElement('a');
        enlace.href = `${prefijo}${modulo}.html`;
        enlace.textContent = datos.nombre;
        if (modulo === actual) enlace.setAttribute('aria-current', 'page');
        navegacion.appendChild(enlace);
    }

    return navegacion;
}
