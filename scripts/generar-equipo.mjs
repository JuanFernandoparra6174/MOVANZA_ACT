import { readFile, writeFile } from 'node:fs/promises';
import { encabezadoEmpresarial } from './encabezado-empresarial.js';
const raiz = new URL('../', import.meta.url);
const index = await readFile(new URL('index.html', raiz), 'utf8');
const footer = index.match(/<footer class="pie-publico">[\s\S]*?<\/footer>/)?.[0];
if (!footer) throw new Error('No se encontró el footer del Index.');
await writeFile(new URL('paginas/equipo.html', raiz), `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex">
    <title>Equipo de trabajo | MOVANZA</title>
    <link rel="stylesheet" href="../estilos/general.css">
    <link rel="stylesheet" href="../estilos/alertas.css" data-estilo-alertas>
    <script type="module" src="../scripts/alertas.js"></script>
    <link rel="stylesheet" href="../estilos/index.css">
    <link rel="stylesheet" href="../recursos/efecto_fondo/fondo.css">
    <link rel="stylesheet" href="../estilos/componentes-publicos.css">
    <link rel="stylesheet" href="../estilos/home-empresa.css">
    <link rel="stylesheet" href="../estilos/home-empresa-2.css">
    <link rel="stylesheet" href="../estilos/encabezado-empresarial.css">
    <link rel="stylesheet" href="../estilos/cuenta.css">
    <link rel="stylesheet" href="../estilos/seleccionar-empresa.css">
    <link rel="stylesheet" href="../estilos/equipo.css">
    <script src="../scripts/componentes-publicos.js" defer></script>
    <script src="../scripts/equipo-carga.js" defer></script>
</head>
<body class="pagina-publica pagina-equipo" data-modulo="equipo">
    <div class="container fondo-exterior" aria-hidden="true" inert><div id="stars"></div><div id="stars2"></div><div id="stars3"></div><div></div></div>
    <section id="estado-acceso" class="estado-acceso"><p id="mensaje-acceso" role="status" aria-live="polite">Comprobando el acceso a tu equipo…</p><a href="./seleccionar_empresa.html">Seleccionar empresa</a></section>
    <div id="sitio-equipo" class="sitio-publico" hidden>
        <a class="saltar-contenido" href="#contenido">Saltar al contenido</a>
        ${encabezadoEmpresarial({ raiz: '../', actual: 'equipo' })}
        <main id="contenido" class="administracion-principal equipo-principal" hidden>
            <section class="bienvenida-administracion" aria-labelledby="titulo-equipo">
                <p class="antetitulo">EQUIPO DE TRABAJO</p>
                <h1 id="titulo-equipo">Gestiona tu equipo de trabajo</h1>
                <p>Administra los integrantes de tu empresa, consulta su información y mantén organizado tu equipo desde un solo lugar.</p>
                <p class="empresa-identificada"><span>Empresa</span><strong id="titulo-empresa">Cargando empresa…</strong></p>
            </section>
            <div class="equipo-estado"><p id="mensaje" role="status" aria-live="polite"></p></div>
            <section class="panel-invitacion" aria-labelledby="titulo-invitar">
                <div><p class="antetitulo">CONECTA CON TU EQUIPO</p><h2 id="titulo-invitar">Invitar trabajador</h2></div>
                <form id="formulario-busqueda">
                    <div class="campo-busqueda"><label for="nombre-buscado">Nombre de usuario</label><input id="nombre-buscado" class="movanza-input" type="text" placeholder="Ej: juan_parra21" minlength="3" maxlength="30" required aria-describedby="ayuda-busqueda"><small id="ayuda-busqueda" class="texto-ayuda">Escribe el nombre de usuario exacto de la persona que deseas invitar.</small></div>
                    <button type="submit" class="boton-relleno">Buscar usuario <span aria-hidden="true">↗</span></button>
                </form>
                <div id="resultado-busqueda" class="tabla-empresas tabla-equipo tabla-resultados" aria-label="Resultado de la búsqueda"></div>
            </section>
            <section class="seccion-equipo" aria-labelledby="titulo-integrantes">
                <div class="cabecera-listado"><p class="antetitulo">PERSONAS DE TU EMPRESA</p><h2 id="titulo-integrantes">Integrantes del equipo</h2><p>Los alias son nombres internos que puedes utilizar para identificar a tus trabajadores.</p></div>
                <div id="lista-integrantes" class="tabla-empresas tabla-equipo"><p>Cargando integrantes…</p></div>
            </section>
            <section class="seccion-equipo" aria-labelledby="titulo-pendientes">
                <div class="cabecera-listado"><p class="antetitulo">VINCULACIONES EN PROCESO</p><h2 id="titulo-pendientes">Invitaciones pendientes</h2></div>
                <div id="lista-pendientes" class="tabla-empresas tabla-equipo tabla-pendientes"><p>Cargando invitaciones…</p></div>
            </section>
        </main>
        ${footer.replace(/href="#([^"]+)"/g, 'href="../index.html#$1"')}
    </div>
    <noscript><p class="aviso-noscript">Activa JavaScript para verificar tu sesión y acceder al equipo de tu empresa.</p></noscript>
</body>
</html>
`);
console.log('Equipo actualizado con el encabezado empresarial y el footer del Index.');
