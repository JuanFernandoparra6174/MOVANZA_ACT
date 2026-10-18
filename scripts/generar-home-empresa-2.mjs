import { readFile, writeFile } from 'node:fs/promises';
import { encabezadoEmpresarial } from './encabezado-empresarial.js';

const raiz = new URL('../', import.meta.url);
const index = await readFile(new URL('index.html', raiz), 'utf8');
const footer = index.match(/<footer class="pie-publico">[\s\S]*?<\/footer>/)?.[0];
if (!footer) throw new Error('No se encontró el pie de página del Index.');
const cards = [
    ['equipo', 'team', 'Equipo', 'Gestiona los integrantes de tu empresa, consulta sus perfiles y organiza tu equipo de trabajo.'],
    ['trabajos', 'trabajos', 'Trabajos', 'Organiza, asigna y consulta los trabajos de tu empresa para mantener el control de tus operaciones.'],
    ['estadisticas', 'estadisticas', 'Estadísticas', 'Consulta información sobre las actividades, los tiempos de ejecución y el desempeño operativo de tu empresa.']
];
await writeFile(new URL('home_empresa_2.html', raiz), `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex">
    <title>Administración empresarial | MOVANZA</title>
    <link rel="stylesheet" href="./estilos/general.css">
    <link rel="stylesheet" href="./estilos/alertas.css" data-estilo-alertas>
    <script type="module" src="./scripts/alertas.js"></script>
    <link rel="stylesheet" href="./estilos/index.css">
    <link rel="stylesheet" href="./recursos/efecto_fondo/fondo.css">
    <link rel="stylesheet" href="./estilos/componentes-publicos.css">
    <link rel="stylesheet" href="./estilos/home-empresa.css">
    <link rel="stylesheet" href="./estilos/encabezado-empresarial.css">
    <link rel="stylesheet" href="./estilos/home-empresa-2.css">
    <link rel="stylesheet" href="./estilos/cuenta.css">
    <link rel="stylesheet" href="./estilos/mensajeria.css">
    <script src="./scripts/componentes-publicos.js" defer></script>
    <script src="./scripts/home-empresa-2-carga.js" defer></script>
</head>
<body class="pagina-publica home-empresa-2">
    <div class="container fondo-exterior" aria-hidden="true" inert><div id="stars"></div><div id="stars2"></div><div id="stars3"></div><div></div></div>
    <section id="estado-acceso" class="estado-acceso"><p id="mensaje-home" role="status" aria-live="polite">Comprobando tu empresa…</p><a href="./paginas/seleccionar_empresa.html">Seleccionar empresa</a></section>
    <div class="sitio-publico" id="contenido-empresa" hidden>
        <a class="saltar-contenido" href="#contenido">Saltar al contenido</a>
        ${encabezadoEmpresarial()}
        <main id="contenido" class="administracion-principal">
            <section class="bienvenida-administracion" aria-labelledby="titulo-bienvenida">
                <p class="antetitulo">ADMINISTRACIÓN EMPRESARIAL</p>
                <h1 id="titulo-bienvenida">Bienvenido al espacio de tu empresa</h1>
                <p>Administra tu equipo, organiza los trabajos y consulta la información de tus operaciones desde un solo lugar.</p>
                <p class="empresa-identificada"><span>Empresa</span><strong id="nombre-empresa-activa"></strong></p>
            </section>
            <section class="modulos-empresariales" aria-label="Módulos de tu empresa"><div class="mosaico mosaico-administracion">
${cards.map(([ruta, imagen, titulo, descripcion], i) => `                <article class="card-principal efecto-card">
                    <span class="efecto-card-borde" aria-hidden="true"></span>
                    <span class="card-imagen" aria-hidden="true"><img src="./Carpeta_Imagenes/home_empresa_2/${imagen}.avif" width="900" height="600" alt=""></span>
                    <div class="card-contenido"><p class="card-categoria"><span>0${i + 1}</span> MI EMPRESA</p><h2>${titulo}</h2><p>${descripcion}</p><a class="card-accion" href="./paginas/${ruta}.html"${ruta === 'estadisticas' ? ' data-estadisticas-empresa' : ''}>Abrir ${titulo.toLocaleLowerCase('es')}<span aria-hidden="true">↗</span></a></div>
                </article>`).join('\n')}
            </div></section>
        </main>
        ${footer.replace(/href="#([^"]+)"/g, 'href="./index.html#$1"')}
    </div>
    <noscript><p class="aviso-noscript">Activa JavaScript para verificar tu sesión y acceder a tu empresa.</p></noscript>
</body>
</html>
`);
console.log('Home Empresa 2 generada con el encabezado empresarial compartido y el footer del Index.');
