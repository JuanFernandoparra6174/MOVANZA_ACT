// Compartido por el navegador y el Worker; sin dependencias ni credenciales.
export const limitesContacto = { nombre: 150, correo: 254, mensaje: 4000 };
const correoValido = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const controles = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export function validarContacto(entrada) {
    const errores = {}, datos = {};
    for (const [campo, maximo] of Object.entries(limitesContacto)) {
        const valor = entrada?.[campo];
        if (typeof valor !== 'string' || !valor.trim()) {
            errores[campo] = 'Completa este campo.';
        } else if (valor.length > maximo) {
            errores[campo] = `Utiliza como máximo ${maximo} caracteres.`;
        } else if (controles.test(valor) || (campo !== 'mensaje' && /[\r\n\t]/.test(valor))) {
            errores[campo] = 'Revisa los caracteres de este campo.';
        } else {
            datos[campo] = valor.trim();
        }
    }
    if (datos.correo && (!correoValido.test(datos.correo) || datos.correo.split('@')[0].length > 64 || datos.correo.startsWith('.') || datos.correo.includes('..') || datos.correo.includes('.@'))) {
        errores.correo = 'Introduce un correo electrónico válido.';
    }
    return { datos, errores, valido: Object.keys(errores).length === 0 };
}
