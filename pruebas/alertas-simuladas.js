// Adaptador solo para regresión de datos: conserva las decisiones configuradas por cada fixture.
// La implementación visual real y sus promesas se comprueban en alertas.mjs.
export const confirmarAccion = async opciones => window.confirm(typeof opciones === 'string' ? opciones : opciones.mensaje);
export const mostrarAlerta = async () => true;
export const solicitarTexto = async () => null;
export const observarResultados = () => {};
