// Genera páginas estáticas sin cambiar el texto del documento fuente.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const raiz = new URL('../', import.meta.url);
const texto = (await readFile(new URL('informacion/Movanza_Politicas_Completas.txt', raiz), 'utf8')).replace(/\r\n/g, '\n');
const documentos = [...texto.matchAll(/^={64}\nDOCUMENTO (\d)\. ([^\n]+)\n={64}\n/gm)];
if (documentos.length !== 6) throw new Error('Se esperaban seis documentos legales separados.');
const inicioAnexos = texto.indexOf('\n================================================================ ANEXO');
if (inicioAnexos < 0) throw new Error('No se encontraron las notas y anexos del original.');
const anexos = texto.slice(inicioAnexos);
const rutas = ['privacidad', 'seguridad', 'terminos', 'servicio', 'garantias', 'cancelaciones'];
const escapar = t => t.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const unirLineas = t => t.replace(/\s+/g, ' ').trim();
const tituloLegible = t => t.charAt(0) + t.slice(1).toLocaleLowerCase('es');

function apartadosDe(contenido, cabecera) {
    return contenido.slice(cabecera.length).trim().split(/\n(?=\d+\.\s)/).map((bloque, indice) => {
        const texto = unirLineas(bloque);
        // El primer término del párrafo puede ser MOVANZA: no forma parte del título.
        const encabezado = texto.match(/^(\d+)\.\s+([A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ ,]*?)(?=\s+(?:MOVANZA\s+)?[A-ZÁÉÍÓÚÜÑ]?[a-záéíóúüñ])/u);
        if (!encabezado || Number(encabezado[1]) !== indice + 1) throw new Error('No se pudo separar el apartado: ' + texto.slice(0, 100));
        return { numero: encabezado[1], titulo: encabezado[2], texto: texto.slice(encabezado[0].length).trim() };
    });
}

function presentarFuentes() {
    const limpio = anexos.replace(/={5,}/g, '').trim();
    const partes = limpio.split(/ANEXO\s+B\. FUENTES NORMATIVAS Y OFICIALES CONSULTADAS/);
    if (partes.length !== 2) throw new Error('Revisar la estructura de los anexos.');
    const fuentesYNota = partes[1].split(/NOTA FINAL:/);
    const fuentes = fuentesYNota[0].trim().split(/\n(?=-\s)/);
    const enlazar = t => escapar(unirLineas(t)).replace(/https:\/\/[^\s<]+/g, url => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
    return `<ul class="fuentes-legales">${fuentes.map(t => `<li>${enlazar(t.replace(/^-\s*/, ''))}</li>`).join('\n')}</ul>`;
}
await mkdir(new URL('politicas/', raiz), { recursive: true });
for (let i = 0; i < documentos.length; i++) {
    const titulo = documentos[i][2];
    const contenido = texto.slice(documentos[i].index, documentos[i + 1]?.index ?? inicioAnexos);
    const apartados = apartadosDe(contenido, documentos[i][0]);
    const indice = `<ol>${apartados.map(a => `<li><a href="#apartado-${a.numero}">${escapar(tituloLegible(a.titulo))}</a></li>`).join('\n')}</ol>`;
    const pagina = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex">
    <title>${escapar(titulo)} | MOVANZA</title>
    <link rel="stylesheet" href="../estilos/general.css">
    <link rel="stylesheet" href="../estilos/alertas.css" data-estilo-alertas>
    <script type="module" src="../scripts/alertas.js"></script>
    <link rel="stylesheet" href="../estilos/index.css">
    <link rel="stylesheet" href="../estilos/politicas.css">
</head>
<body class="pagina-publica pagina-legal">
    <a class="saltar-contenido" href="#documento">Saltar al documento</a>
    <header class="cabecera-legal"><a href="../index.html" class="marca-pie">MOVANZA</a><a href="../index.html#politicas">← Volver a Políticas</a></header>
    <main id="documento" class="lectura-legal">
        <aside class="indice-escritorio"><nav class="indice-legal" aria-label="Índice del documento"><h2>En este documento</h2>${indice}<a class="indice-regreso" href="../index.html#politicas">← Todas las políticas</a></nav></aside>
        <article class="documento-legal">
            <div class="introduccion-legal">
                <p class="antetitulo">POLÍTICAS MOVANZA · DOCUMENTO ${i + 1}</p>
                <h1>${escapar(tituloLegible(titulo))}</h1>
            </div>
            <details class="indice-movil"><summary>En este documento</summary><nav aria-label="Índice del documento en móvil">${indice}</nav></details>
            <div class="texto-legal">
${apartados.map(a => `                <section class="apartado-legal" id="apartado-${a.numero}" aria-labelledby="titulo-apartado-${a.numero}">
                    <h2 id="titulo-apartado-${a.numero}"><span class="numero-apartado">${a.numero}.</span> ${escapar(a.titulo)}</h2>
                    <p>${escapar(a.texto)}</p>
                </section>`).join('\n')}
            </div>
            <div class="notas-documento">
                <details class="notas-originales"><summary>Referencias normativas</summary><div class="referencias-legales">${presentarFuentes()}</div></details>
            </div>
            <nav class="navegacion-legal" aria-label="Navegación del documento"><a href="../index.html#politicas">← Volver a Políticas</a><a href="#documento">Volver al comienzo ↑</a></nav>
        </article>
    </main>
    <footer class="pie-legal">© 2026 MOVANZA. Todos los derechos reservados.</footer>
</body>
</html>
`;
    await writeFile(new URL(`politicas/${rutas[i]}.html`, raiz), pagina);
}
console.log('Se generaron las seis páginas de políticas con el contenido original íntegro.');
