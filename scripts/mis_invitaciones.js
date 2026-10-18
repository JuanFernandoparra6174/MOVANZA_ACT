import { confirmarAccion } from './alertas.js';
import { supabase } from '../configuracion/supabase.js';
import { vistaInvitaciones } from './invitaciones-vista.js';

let perfilId = null;
let ocupado = false;
let contextoVigente = () => true;
let datos = { invitaciones: [], membresias: [], empresas: [] };

async function cargarInvitaciones() {
    const { data, error } = await supabase.rpc('listar_invitaciones_visibles');
    if (error) throw error;
    return (data || []).filter(i => i.trabajador_id === perfilId).sort((a, b) => (Date.parse(b.creada_en) || 0) - (Date.parse(a.creada_en) || 0));
}
async function cargarMembresias() {
    const { data, error } = await supabase.from('membresias')
        .select('empresa_id, alias_interno, fecha_ingreso')
        .eq('trabajador_id', perfilId).eq('estado', 'activa');
    if (error) throw error;
    if (!contextoVigente()) return { membresias: [], empresas: [] };
    const membresias = data || [];
    if (!membresias.length) return { membresias, empresas: [] };
    const idsEmpresas = [...new Set(membresias.map(m => m.empresa_id))];
    const { data: empresas, error: errorEmpresas } = await supabase.from('empresas').select('id, nombre').in('id', idsEmpresas);
    if (errorEmpresas) throw errorEmpresas;
    return { membresias, empresas: empresas || [] };
}
async function actualizarListas() {
    const invitaciones = await cargarInvitaciones();
    if (!contextoVigente()) return;
    datos = { ...datos, invitaciones };
    vistaInvitaciones.presentar(datos, { equiposActualizados: false });
    const equipos = await cargarMembresias();
    if (!contextoVigente()) return;
    datos = { invitaciones, ...equipos };
    vistaInvitaciones.presentar(datos);
}
function informar(texto, tipo = '') { if (contextoVigente()) vistaInvitaciones.informar(texto, tipo); }
async function actualizar() {
    if (ocupado || !contextoVigente()) return;
    ocupado = true; vistaInvitaciones.carga(true);
    informar('Actualizando tus invitaciones y equipos...');
    try { await actualizarListas(); informar(''); }
    catch { informar('No se pudo completar la actualización. Comprueba tu conexión y pulsa Actualizar para volver a intentarlo.', 'error'); }
    finally { ocupado = false; if (contextoVigente()) vistaInvitaciones.carga(false); }
}
// Misma RPC, confirmación de rechazo y consecuencias autorizadas en el servidor.
async function responderInvitacion(idInvitacion, aceptar) {
    if (ocupado || !contextoVigente()) return;
    const invitacion = datos.invitaciones.find(i => i.id === idInvitacion && i.estado === 'pendiente');
    if (!invitacion) return;
    if (!aceptar && !await confirmarAccion({ titulo: 'Rechazar invitación', mensaje: '¿Estás seguro de rechazar esta invitación?', textoConfirmar: 'Rechazar invitación', destructiva: true })) return;
    if (ocupado || !contextoVigente()) return;
    ocupado = true;
    vistaInvitaciones.carga(true, { id: idInvitacion, aceptar });
    informar('Procesando respuesta...');
    let confirmada = false;
    try {
        const { error } = await supabase.rpc('responder_invitacion', { invitacion_id: idInvitacion, aceptar });
        if (error) throw error;
        if (!contextoVigente()) return;
        confirmada = true;
        // Solo tras la confirmación: impide repetir la respuesta si falla la lectura posterior.
        datos.invitaciones = datos.invitaciones.map(i => i.id === idInvitacion ? { ...i, estado: aceptar ? 'aceptada' : 'rechazada' } : i);
        vistaInvitaciones.presentar(datos, { equiposActualizados: false });
        vistaInvitaciones.enfocarResultado();
        await actualizarListas();
        informar(aceptar ? 'Invitación aceptada. Ya perteneces al equipo.' : 'Invitación rechazada.', 'exito');
    } catch (error) {
        informar(confirmada
            ? 'Tu respuesta quedó guardada, pero no se pudo actualizar la información. Pulsa Actualizar; no necesitas responder de nuevo.'
            : 'No se pudo responder la invitación. ' + (error.message || 'Comprueba tu conexión y vuelve a intentarlo.'), 'error');
    } finally {
        ocupado = false;
        if (contextoVigente()) vistaInvitaciones.carga(false);
    }
}
export async function iniciarInvitaciones(perfilVerificado, contexto = () => true) {
    perfilId = perfilVerificado.id;
    contextoVigente = contexto;
    vistaInvitaciones.iniciar({ responder: responderInvitacion, actualizar });
    await actualizar();
}
export const invitacionesOcupadas = () => ocupado;
