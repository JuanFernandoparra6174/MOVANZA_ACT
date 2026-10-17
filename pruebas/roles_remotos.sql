-- Prueba de integración SQL contra la migración ya aplicada.
-- Ejecutar como postgres. Todas las filas de prueba se revierten al terminar.
-- Comprueba triggers y permisos reales; no envía correos ni prueba el servicio HTTP de Auth.
BEGIN;
DO $$
DECLARE
    u_empresa uuid := gen_random_uuid();
    u_otra_empresa uuid := gen_random_uuid();
    u_trabajador uuid := gen_random_uuid();
    u_otro_trabajador uuid := gen_random_uuid();
    u_admin uuid := gen_random_uuid();
    p_empresa bigint;
    p_otra_empresa bigint;
    p_trabajador bigint;
    p_otro_trabajador bigint;
    e_empresa bigint;
    e_otra_empresa bigint;
    invitacion bigint;
    trabajo bigint;
    otro_trabajo bigint;
    asignacion bigint;
    otra_asignacion bigint;
    bloqueado boolean;
BEGIN
    INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES
        (u_empresa, u_empresa::text || '@example.invalid', '{"rol":"empresa"}'),
        (u_otra_empresa, u_otra_empresa::text || '@example.invalid', '{"rol":"empresa"}'),
        (u_trabajador, u_trabajador::text || '@example.invalid', '{"rol":"trabajador"}'),
        (u_otro_trabajador, u_otro_trabajador::text || '@example.invalid', '{"rol":"trabajador"}'),
        (u_admin, u_admin::text || '@example.invalid', '{}');
    SELECT id INTO STRICT p_empresa FROM public.perfiles WHERE usuario_auth_id=u_empresa;
    SELECT id INTO STRICT p_otra_empresa FROM public.perfiles WHERE usuario_auth_id=u_otra_empresa;
    SELECT id INTO STRICT p_trabajador FROM public.perfiles WHERE usuario_auth_id=u_trabajador;
    SELECT id INTO STRICT p_otro_trabajador FROM public.perfiles WHERE usuario_auth_id=u_otro_trabajador;
    IF (SELECT rol FROM public.perfiles WHERE id=p_empresa) <> 'empresa'
       OR (SELECT rol FROM public.perfiles WHERE id=p_trabajador) <> 'trabajador' THEN
        RAISE EXCEPTION 'El trigger no conserva el rol del registro';
    END IF;
    bloqueado := false;
    BEGIN
        INSERT INTO auth.users(id, raw_user_meta_data) VALUES (gen_random_uuid(), '{"rol":"administrador"}');
    EXCEPTION WHEN insufficient_privilege THEN bloqueado := true;
    END;
    IF NOT bloqueado THEN RAISE EXCEPTION 'Se permitió el registro público de administrador'; END IF;
    PERFORM privado.habilitar_administrador(u_admin);

    -- Empresa: las llamadas se ejecutan con el rol real del cliente.
    PERFORM set_config('request.jwt.claim.sub', u_empresa::text, true);
    PERFORM set_config('role', 'authenticated', true);
    e_empresa := public.crear_empresa('Prueba temporal Empresa Alfa');
    invitacion := public.enviar_invitacion(e_empresa,p_trabajador);
    bloqueado := false;
    BEGIN
        PERFORM public.enviar_invitacion(e_empresa,p_otra_empresa);
    EXCEPTION WHEN raise_exception THEN bloqueado := true;
    END;
    IF NOT bloqueado THEN RAISE EXCEPTION 'Se permitió invitar una cuenta Empresa como trabajador'; END IF;

    -- Otra empresa y otro trabajador: equipo y asignación ajenos.
    PERFORM set_config('request.jwt.claim.sub', u_otra_empresa::text, true);
    e_otra_empresa := public.crear_empresa('Prueba temporal Empresa Beta');
    PERFORM public.enviar_invitacion(e_otra_empresa,p_otro_trabajador);
    PERFORM set_config('request.jwt.claim.sub', u_otro_trabajador::text, true);
    PERFORM public.responder_invitacion(i.id,true) FROM public.invitaciones i
        WHERE i.empresa_id=e_otra_empresa AND i.trabajador_id=p_otro_trabajador;
    PERFORM set_config('request.jwt.claim.sub', u_otra_empresa::text, true);
    otro_trabajo := public.crear_trabajo(e_otra_empresa,'Trabajo temporal Beta',4,-74,100);
    otra_asignacion := public.crear_asignacion(otro_trabajo,p_otro_trabajador,
        'Asignación Beta','Objetivo temporal',now()+interval '1 day',30);
    PERFORM public.enviar_mensaje(otra_asignacion,'Conversación privada Beta');

    -- Trabajador: rol inmutable, invitación propia y pertenencia.
    PERFORM set_config('request.jwt.claim.sub', u_trabajador::text, true);
    IF (SELECT count(*) FROM public.perfiles WHERE id IN (p_empresa,p_otra_empresa,p_trabajador,p_otro_trabajador)) <> 1 THEN
        RAISE EXCEPTION 'El trabajador pudo leer perfiles ajenos';
    END IF;
    bloqueado := false;
    BEGIN
        UPDATE public.perfiles SET rol='administrador' WHERE id=p_trabajador;
    EXCEPTION WHEN insufficient_privilege THEN bloqueado := true;
    END;
    IF NOT bloqueado THEN RAISE EXCEPTION 'El cliente pudo modificar su rol'; END IF;
    bloqueado := false;
    BEGIN
        PERFORM privado.habilitar_administrador(u_trabajador);
    EXCEPTION WHEN insufficient_privilege THEN bloqueado := true;
    END;
    IF NOT bloqueado THEN RAISE EXCEPTION 'El cliente pudo concederse permisos administrativos'; END IF;
    bloqueado := false;
    BEGIN
        PERFORM public.crear_empresa('Empresa no permitida');
    EXCEPTION WHEN insufficient_privilege THEN bloqueado := true;
    END;
    IF NOT bloqueado THEN RAISE EXCEPTION 'El trabajador pudo crear una empresa'; END IF;
    IF EXISTS(SELECT 1 FROM public.listar_invitaciones_visibles() i
              WHERE i.empresa_id=e_otra_empresa) THEN
        RAISE EXCEPTION 'El trabajador pudo leer invitaciones ajenas';
    END IF;
    PERFORM public.actualizar_mi_perfil('prueba_' || p_trabajador,'Prueba temporal');
    IF privado.mi_rol() <> 'trabajador' THEN RAISE EXCEPTION 'Editar perfil cambió el rol'; END IF;
    PERFORM public.responder_invitacion(invitacion,true);
    IF NOT EXISTS(SELECT 1 FROM public.membresias WHERE empresa_id=e_empresa AND trabajador_id=p_trabajador AND estado='activa') THEN
        RAISE EXCEPTION 'La invitación no creó la membresía';
    END IF;

    -- Los metadatos mutables de Auth no son la fuente de permisos.
    PERFORM set_config('role','postgres',true);
    UPDATE auth.users SET raw_user_meta_data='{"rol":"administrador"}' WHERE id=u_trabajador;
    PERFORM set_config('role','authenticated',true);
    IF privado.mi_rol() <> 'trabajador' THEN RAISE EXCEPTION 'Los metadatos cambiaron el rol'; END IF;

    PERFORM set_config('request.jwt.claim.sub',u_empresa::text,true);
    trabajo := public.crear_trabajo(e_empresa,'Trabajo temporal Alfa',4,-74,100);
    asignacion := public.crear_asignacion(trabajo,p_trabajador,'Asignación Alfa','Objetivo temporal',now()+interval '1 day',30);
    IF EXISTS(SELECT 1 FROM public.asignaciones WHERE id=otra_asignacion)
       OR EXISTS(SELECT 1 FROM public.empresas WHERE id=e_otra_empresa)
       OR EXISTS(SELECT 1 FROM public.mensajes WHERE asignacion_id=otra_asignacion) THEN
        RAISE EXCEPTION 'La empresa pudo leer datos de otra empresa';
    END IF;
    PERFORM public.enviar_mensaje(asignacion,'Mensaje temporal de la empresa');
    PERFORM set_config('request.jwt.claim.sub',u_trabajador::text,true);
    IF NOT EXISTS(SELECT 1 FROM public.asignaciones WHERE id=asignacion)
       OR NOT EXISTS(SELECT 1 FROM public.trabajos WHERE id=trabajo)
       OR NOT EXISTS(SELECT 1 FROM public.empresas WHERE id=e_empresa)
       OR EXISTS(SELECT 1 FROM public.asignaciones WHERE id=otra_asignacion)
       OR EXISTS(SELECT 1 FROM public.mensajes WHERE asignacion_id=otra_asignacion) THEN
        RAISE EXCEPTION 'El acceso del trabajador no respeta sus asignaciones';
    END IF;
    bloqueado := false;
    BEGIN
        PERFORM public.enviar_mensaje(otra_asignacion,'No permitido');
    EXCEPTION WHEN raise_exception THEN bloqueado := true;
    END;
    IF NOT bloqueado THEN RAISE EXCEPTION 'El trabajador escribió en una conversación ajena'; END IF;
    PERFORM public.responder_asignacion(asignacion,true,null);
    bloqueado := false;
    BEGIN
        PERFORM public.iniciar_asignacion(asignacion,5,-74,5);
    EXCEPTION WHEN raise_exception THEN bloqueado := true;
    END;
    IF NOT bloqueado THEN RAISE EXCEPTION 'Se permitió iniciar fuera del radio GPS'; END IF;
    PERFORM public.iniciar_asignacion(asignacion,4,-74,5);
    PERFORM public.enviar_mensaje(asignacion,'Mensaje temporal del trabajador');
    PERFORM public.finalizar_asignacion(asignacion,4,-74,5,true,null);
    IF (SELECT estado FROM public.asignaciones WHERE id=asignacion) <> 'finalizada' THEN
        RAISE EXCEPTION 'Falló el flujo de ejecución de la asignación';
    END IF;

    PERFORM set_config('request.jwt.claim.sub',u_admin::text,true);
    IF privado.mi_rol() <> 'administrador' THEN RAISE EXCEPTION 'No se habilitó el administrador'; END IF;
    IF EXISTS(SELECT 1 FROM public.empresas WHERE id IN (e_empresa,e_otra_empresa))
       OR EXISTS(SELECT 1 FROM public.asignaciones WHERE id IN (asignacion,otra_asignacion))
       OR EXISTS(SELECT 1 FROM public.mensajes WHERE asignacion_id IN (asignacion,otra_asignacion)) THEN
        RAISE EXCEPTION 'El administrador recibió acceso operativo no solicitado';
    END IF;
    bloqueado := false;
    BEGIN
        PERFORM public.crear_empresa('No permitida para administrador');
    EXCEPTION WHEN insufficient_privilege THEN bloqueado := true;
    END;
    IF NOT bloqueado THEN RAISE EXCEPTION 'El administrador pudo ejecutar funciones de empresa'; END IF;

    PERFORM set_config('role','anon',true);
    bloqueado := false;
    BEGIN
        PERFORM 1 FROM public.perfiles LIMIT 1;
    EXCEPTION WHEN insufficient_privilege THEN bloqueado := true;
    END;
    IF NOT bloqueado THEN RAISE EXCEPTION 'El visitante pudo leer perfiles'; END IF;
    PERFORM set_config('role','postgres',true);
END $$;
ROLLBACK;
SELECT 'Pruebas remotas de roles, RLS y regresión correctas; datos de prueba revertidos' AS resultado;
