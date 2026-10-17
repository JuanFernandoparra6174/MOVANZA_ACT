
import { supabase } from '../configuracion/supabase.js';

// ELEMENTOS DE LA INTERFAZ
const formulario = document.getElementById('formulario-empresa');
const nombreEmpresa = document.getElementById('nombre-empresa');
const listaEmpresas = document.getElementById('lista-empresas');
const mensaje = document.getElementById('mensaje');

const usuarioActual = document.getElementById('usuario-actual');
const perfilActual = document.getElementById('perfil-actual');

const seccionActiva = document.getElementById(
    'seccion-empresa-activa'
);

const empresaActivaNombre = document.getElementById(
    'empresa-activa-nombre'
);

const empresaActivaId = document.getElementById(
    'empresa-activa-id'
);

// VARIABLES
let perfil = null;
let empresas = [];

// MENSAJES
function mostrarMensaje(texto, tipo = '') {
    mensaje.textContent = texto;
    mensaje.className = tipo;
}

// CARGAR USUARIO Y PERFIL
async function cargarUsuario() {

    const { data, error } = await supabase.auth.getUser();

    if (error) throw error;

    if (!data.user) {
        window.location.replace('../index.html');
        return false;
    }

    const { data: datosPerfil, error: errorPerfil } =
        await supabase
            .from('perfiles')
            .select('id, nombre_usuario')
            .eq('usuario_auth_id', data.user.id)
            .single();

    if (errorPerfil) throw errorPerfil;

    perfil = datosPerfil;

    usuarioActual.textContent = perfil.nombre_usuario;
    perfilActual.textContent = perfil.id;

    return true;
}

// CONSULTAR EMPRESAS PROPIAS
async function cargarEmpresas() {

    const { data, error } = await supabase
        .from('empresas')
        .select('id, nombre, propietario_id, creado_en')
        .eq('propietario_id', perfil.id)
        .order('creado_en', { ascending: false });

    if (error) throw error;

    empresas = data || [];

    mostrarEmpresas();
    recuperarEmpresaSeleccionada();
}

// MOSTRAR LISTADO
function mostrarEmpresas() {

    listaEmpresas.replaceChildren();

    if (empresas.length === 0) {
        const texto = document.createElement('p');
        texto.textContent = 'Todavía no tienes empresas registradas.';
        listaEmpresas.appendChild(texto);
        return;
    }

    empresas.forEach(empresa => {

        const tarjeta = document.createElement('div');
        tarjeta.className = 'elemento-empresa';

        const nombre = document.createElement('h3');
        nombre.textContent = empresa.nombre;

        const identificador = document.createElement('p');
        identificador.textContent = `ID: ${empresa.id}`;

        const fecha = document.createElement('p');
        fecha.textContent = 'Creada: ' +
            new Date(empresa.creado_en).toLocaleDateString('es-CO');

        const boton = document.createElement('button');
        boton.type = 'button';
        boton.textContent = 'Seleccionar empresa';

        boton.addEventListener('click', () => {
            seleccionarEmpresa(empresa.id);
        });

        tarjeta.append(nombre, identificador, fecha, boton);
        listaEmpresas.appendChild(tarjeta);
    });
}

// SELECCIONAR ESPACIO DE TRABAJO
function seleccionarEmpresa(id) {

    // Solo se pueden seleccionar empresas de la lista
    // que Supabase devuelve para el propietario.
    const empresa = empresas.find(item => item.id === id);

    if (!empresa) {
        mostrarMensaje('Empresa no disponible.', 'error');
        return;
    }

    // Guardamos la selección en esta pestaña.
    // No es un permiso de seguridad.
    sessionStorage.setItem(
        'movanza_empresa_activa',
        String(empresa.id)
    );

    empresaActivaNombre.textContent = empresa.nombre;
    empresaActivaId.textContent = empresa.id;

    seccionActiva.classList.remove('oculto');

    mostrarMensaje(
        `Empresa "${empresa.nombre}" seleccionada correctamente.`,
        'exito'
    );
}

// RECUPERAR EMPRESA SELECCIONADA
function recuperarEmpresaSeleccionada() {

    const idGuardado = sessionStorage.getItem(
        'movanza_empresa_activa'
    );

    if (!idGuardado) {
        seccionActiva.classList.add('oculto');
        return;
    }

    const empresa = empresas.find(
        item => String(item.id) === idGuardado
    );

    if (empresa) {
        seleccionarEmpresa(empresa.id);
    } else {
        sessionStorage.removeItem('movanza_empresa_activa');
        seccionActiva.classList.add('oculto');
    }
}

// CREAR EMPRESA
formulario.addEventListener('submit', async (evento) => {

    evento.preventDefault();

    const nombre = nombreEmpresa.value.trim();

    if (nombre.length < 2 || nombre.length > 120) {
        mostrarMensaje(
            'El nombre debe tener entre 2 y 120 caracteres.',
            'error'
        );
        return;
    }

    const boton = document.getElementById('boton-crear');

    boton.disabled = true;
    mostrarMensaje('Creando empresa...');

    try {

        // Función segura creada en la migración SQL
        const { data: idEmpresa, error } = await supabase.rpc(
            'crear_empresa',
            { nombre: nombre }
        );

        if (error) throw error;

        formulario.reset();

        await cargarEmpresas();

        // Seleccionamos automáticamente la nueva empresa
        seleccionarEmpresa(idEmpresa);

        mostrarMensaje(
            'Empresa creada y asociada a tu cuenta correctamente.',
            'exito'
        );

    } catch (error) {

        mostrarMensaje(
            'Error al crear empresa: ' + error.message,
            'error'
        );

        console.error(error);

    } finally {
        boton.disabled = false;
    }
});

// INICIAR MÓDULO
async function iniciarModulo() {

    try {

        const autenticado = await cargarUsuario();

        if (!autenticado) return;

        await cargarEmpresas();

    } catch (error) {

        mostrarMensaje(
            'Error al cargar el módulo: ' + error.message,
            'error'
        );

        console.error(error);
    }
}

iniciarModulo();
