import { supabase } from '../configuracion/supabase.js';

// La misma operación autorizada que utilizaba el formulario original.
export async function actualizarMiPerfil(nombreUsuario, nombreCompleto) {
    const { error } = await supabase.rpc('actualizar_mi_perfil', {
        nombre_usuario: nombreUsuario.trim().toLowerCase(),
        nombre_completo: nombreCompleto.trim()
    });
    if (error) throw error;
}
