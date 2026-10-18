// Cálculos de presentación. No consulta ni modifica datos empresariales.
export const ZONA_INFORME = 'America/Bogota';
const formatoDia = new Intl.DateTimeFormat('en', { timeZone: ZONA_INFORME, year: 'numeric', month: '2-digit', day: '2-digit' });
export const ESTADOS = [
    ['pendiente', 'Pendientes', '#92620A'], ['aceptada', 'Aceptadas', '#5F4D93'],
    ['en_curso', 'En curso', '#216B99'], ['finalizada', 'Finalizadas', '#24784D'],
    ['rechazada', 'Rechazadas', '#AB3547'], ['cancelada', 'Canceladas', '#626262']
];
export function unicosPorId(registros) {
    return [...new Map(registros.map(r => [String(r.id), r])).values()];
}
export function duracionReal(a) {
    if (a.estado !== 'finalizada' || !a.inicio_en || !a.fin_en) return null;
    const segundos = (new Date(a.fin_en).getTime() - new Date(a.inicio_en).getTime()) / 1000;
    return Number.isFinite(segundos) && segundos >= 0 ? segundos : null;
}
export function calcularIndicadores(entrada) {
    const registros = unicosPorId(entrada);
    const conteos = Object.fromEntries(ESTADOS.map(([estado]) => [estado, 0]));
    let cumplidas = 0, incumplidas = 0, segundos = 0, muestrasTiempo = 0, otros = 0;
    for (const a of registros) {
        if (Object.hasOwn(conteos, a.estado)) conteos[a.estado]++; else otros++;
        if (a.estado === 'finalizada') {
            if (a.objetivo_cumplido === true) cumplidas++;
            if (a.objetivo_cumplido === false) incumplidas++;
        }
        const tiempo = duracionReal(a);
        if (tiempo !== null) { segundos += tiempo; muestrasTiempo++; }
    }
    return { total: registros.length, conteos, cumplidas, incumplidas, otros, muestrasTiempo,
        cumplimiento: cumplidas + incumplidas ? cumplidas / (cumplidas + incumplidas) * 100 : null,
        tiempoTotal: muestrasTiempo ? segundos : null, tiempoPromedio: muestrasTiempo ? segundos / muestrasTiempo : null };
}
export function fechaInforme(valor) {
    const fecha = new Date(valor);
    if (!valor || !Number.isFinite(fecha.getTime())) return null;
    const partes = formatoDia.formatToParts(fecha);
    const obtener = tipo => partes.find(p => p.type === tipo).value;
    return `${obtener('year')}-${obtener('month')}-${obtener('day')}`;
}
export function fechaLocalDesdeCampo(valor, finDelDia = false) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
    const fecha = new Date(`${valor}T${finDelDia ? '23:59:59.999' : '00:00:00.000'}-05:00`);
    return Number.isFinite(fecha.getTime()) && fechaInforme(fecha) === valor ? fecha : null;
}
export function limitesPeriodo(periodo, inicio, fin, ahora = new Date()) {
    if (periodo === 'todo') return { desde: null, hasta: null };
    if (periodo === 'personalizado') {
        if (!inicio || !fin) throw new Error('Selecciona las fechas de inicio y fin.');
        const desde = fechaLocalDesdeCampo(inicio), hasta = fechaLocalDesdeCampo(fin, true);
        if (!desde || !hasta || desde > hasta) throw new Error('El período personalizado no es válido.');
        return { desde, hasta };
    }
    const dias = Number(periodo);
    if (![7, 30, 90].includes(dias)) throw new Error('Selecciona un período válido.');
    const desde = fechaLocalDesdeCampo(fechaInforme(ahora));
    desde.setUTCDate(desde.getUTCDate() - (dias - 1));
    return { desde, hasta: ahora };
}
export function serieEvolucion(registros) {
    const validos = unicosPorId(registros).map(a => ({ a, dia: fechaInforme(a.programada_para) })).filter(r => r.dia);
    if (!validos.length) return { filas: [], mensual: false, sinFecha: registros.length };
    const dias = validos.map(r => r.dia).sort();
    const mensual = (new Date(dias.at(-1)) - new Date(dias[0])) / 86400000 > 120;
    const agrupados = new Map();
    for (const { a, dia } of validos) {
        const clave = mensual ? dia.slice(0, 7) : dia;
        if (!agrupados.has(clave)) agrupados.set(clave, { fecha: clave, total: 0, finalizadas: 0 });
        const fila = agrupados.get(clave); fila.total++; if (a.estado === 'finalizada') fila.finalizadas++;
    }
    const cursor = new Date(`${mensual ? dias[0].slice(0, 7) + '-01' : dias[0]}T12:00:00Z`);
    const ultimo = mensual ? dias.at(-1).slice(0, 7) : dias.at(-1);
    const filas = [];
    while (true) {
        const clave = cursor.toISOString().slice(0, mensual ? 7 : 10);
        if (clave > ultimo) break;
        filas.push(agrupados.get(clave) || { fecha: clave, total: 0, finalizadas: 0 });
        if (mensual) cursor.setUTCMonth(cursor.getUTCMonth() + 1); else cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return { filas, mensual, sinFecha: registros.length - validos.length };
}
