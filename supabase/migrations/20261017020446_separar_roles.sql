-- Separación de roles sobre la estructura existente de MOVANZA.
-- Versión registrada por Supabase MCP: 20261017020446.
-- Aplicar antes de publicar el frontend. No elimina tablas ni registros.
BEGIN;

-- No decidir automáticamente el rol de una cuenta con ambos usos previos.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.perfiles p
        WHERE EXISTS (SELECT 1 FROM public.empresas e WHERE e.propietario_id = p.id)
          AND (
              EXISTS (SELECT 1 FROM public.membresias m WHERE m.trabajador_id = p.id)
              OR EXISTS (SELECT 1 FROM public.invitaciones i WHERE i.trabajador_id = p.id)
              OR EXISTS (SELECT 1 FROM public.asignaciones a WHERE a.trabajador_id = p.id)
          )
    ) THEN
        RAISE EXCEPTION 'Hay cuentas con uso de empresa y trabajador. Revisar su clasificación antes de migrar.';
    END IF;
END $$;

ALTER TABLE public.perfiles ADD COLUMN rol text;
UPDATE public.perfiles p SET rol = CASE
    WHEN EXISTS (SELECT 1 FROM public.empresas e WHERE e.propietario_id = p.id)
    THEN 'empresa' ELSE 'trabajador' END;
ALTER TABLE public.perfiles
    ALTER COLUMN rol SET NOT NULL,
    ADD CONSTRAINT perfiles_rol_valido CHECK (rol IN ('empresa', 'trabajador', 'administrador'));

CREATE OR REPLACE FUNCTION privado.mi_rol()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
    SELECT rol FROM public.perfiles WHERE usuario_auth_id = (SELECT auth.uid())
$$;
REVOKE ALL ON FUNCTION privado.mi_rol() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION privado.mi_rol() TO authenticated;

CREATE OR REPLACE FUNCTION privado.exigir_rol(p_rol text)
RETURNS void LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
    IF privado.mi_rol() IS DISTINCT FROM p_rol THEN
        RAISE EXCEPTION 'Operación no autorizada para tu tipo de cuenta' USING ERRCODE = '42501';
    END IF;
END $$;
REVOKE ALL ON FUNCTION privado.exigir_rol(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION privado.exigir_rol(text) TO authenticated;

CREATE OR REPLACE FUNCTION privado.crear_perfil_al_registrarse()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_id bigint;
    -- Compatibilidad con altas autorizadas de Auth que no envíen metadatos.
    v_rol text := coalesce(NEW.raw_user_meta_data ->> 'rol', 'trabajador');
BEGIN
    IF v_rol NOT IN ('empresa', 'trabajador') THEN
        RAISE EXCEPTION 'El registro público solo permite Empresa o Trabajador'
            USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.perfiles(usuario_auth_id, nombre_usuario, rol)
    VALUES (NEW.id, 'tmp_' || left(replace(NEW.id::text, '-', ''), 24), v_rol)
    RETURNING id INTO v_id;
    UPDATE public.perfiles SET nombre_usuario = 'usuario_' || v_id WHERE id = v_id;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION privado.crear_perfil_al_registrarse() FROM PUBLIC, anon, authenticated;

-- Se conserva la lógica existente y se añade la comprobación de rol.
CREATE OR REPLACE FUNCTION privado.es_propietario(p_empresa bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT privado.mi_rol() = 'empresa' AND EXISTS(SELECT 1 FROM public.empresas WHERE id=p_empresa AND propietario_id=privado.mi_perfil_id())
$function$;

-- Se conserva la lógica existente y se añade la comprobación de rol.
CREATE OR REPLACE FUNCTION privado.es_miembro(p_empresa bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT privado.mi_rol() = 'trabajador' AND EXISTS(SELECT 1 FROM public.membresias WHERE empresa_id=p_empresa AND trabajador_id=privado.mi_perfil_id() AND estado='activa')
$function$;

-- Se conserva la lógica existente y se añade la comprobación de rol.
CREATE OR REPLACE FUNCTION privado.puede_ver_asignacion(p_asignacion bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT EXISTS(SELECT 1 FROM public.asignaciones a JOIN public.trabajos t ON t.id=a.trabajo_id
  WHERE a.id=p_asignacion AND ((privado.mi_rol()='trabajador' AND a.trabajador_id=privado.mi_perfil_id()) OR privado.es_propietario(t.empresa_id)))
$function$;

-- Se conserva la lógica existente y se añade la comprobación de rol.
CREATE OR REPLACE FUNCTION privado.puede_ver_perfil(p_perfil bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT p_perfil=privado.mi_perfil_id() OR (privado.mi_rol()='empresa' AND EXISTS(
   SELECT 1 FROM public.membresias m JOIN public.empresas e ON e.id=m.empresa_id
   WHERE m.trabajador_id=p_perfil AND e.propietario_id=privado.mi_perfil_id()
 ))
$function$;

-- Se conserva la lógica existente y se añade la comprobación de rol.
CREATE OR REPLACE FUNCTION privado.crear_empresa(p_nombre text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_id bigint;
BEGIN
 PERFORM privado.exigir_rol('empresa');
 IF privado.mi_perfil_id() IS NULL THEN RAISE EXCEPTION 'Inicia sesión'; END IF;
 INSERT INTO public.empresas(propietario_id,nombre) VALUES (privado.mi_perfil_id(),p_nombre) RETURNING id INTO v_id;
 RETURN v_id;
END $function$;

-- Se conserva la lógica existente y se añade la comprobación de rol.
CREATE OR REPLACE FUNCTION privado.buscar_trabajador(p_nombre_usuario text)
 RETURNS TABLE(id bigint, nombre_usuario text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT p.id,p.nombre_usuario FROM public.perfiles p WHERE p.nombre_usuario=lower(btrim(p_nombre_usuario)) AND privado.mi_rol()='empresa' AND p.rol='trabajador' LIMIT 1
$function$;

-- Se conserva la lógica existente y se añade la comprobación de rol.
CREATE OR REPLACE FUNCTION privado.enviar_invitacion(p_empresa bigint, p_trabajador bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_id bigint;
BEGIN
 IF NOT privado.es_propietario(p_empresa) THEN RAISE EXCEPTION 'No autorizado'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.perfiles WHERE id=p_trabajador AND rol='trabajador') THEN RAISE EXCEPTION 'Trabajador inexistente'; END IF;
 IF EXISTS(SELECT 1 FROM public.membresias WHERE empresa_id=p_empresa AND trabajador_id=p_trabajador AND estado='activa') THEN RAISE EXCEPTION 'Ya pertenece a esta empresa'; END IF;
 INSERT INTO public.invitaciones(empresa_id,trabajador_id) VALUES(p_empresa,p_trabajador) RETURNING id INTO v_id;
 RETURN v_id;
END $function$;

-- Se conserva la lógica existente y se añade la comprobación de rol.
CREATE OR REPLACE FUNCTION privado.crear_asignacion(p_trabajo bigint, p_trabajador bigint, p_titulo text, p_objetivo text, p_programada_para timestamp with time zone, p_minutos_estimados integer)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_trabajo public.trabajos%ROWTYPE;v_id bigint;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.perfiles WHERE id=p_trabajador AND rol='trabajador') THEN
 RAISE EXCEPTION 'El destinatario debe ser trabajador'; END IF;
 SELECT * INTO v_trabajo FROM public.trabajos WHERE id=p_trabajo FOR UPDATE;
 IF NOT FOUND OR NOT privado.es_propietario(v_trabajo.empresa_id) THEN RAISE EXCEPTION 'Trabajo no autorizado'; END IF;
 IF EXISTS(SELECT 1 FROM public.asignaciones WHERE trabajo_id=p_trabajo AND estado='en_curso') THEN RAISE EXCEPTION 'No se puede modificar un trabajo en ejecución'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.membresias WHERE empresa_id=v_trabajo.empresa_id AND trabajador_id=p_trabajador AND estado='activa') THEN
   RAISE EXCEPTION 'El trabajador no pertenece al equipo activo'; END IF;
 INSERT INTO public.asignaciones(trabajo_id,trabajador_id,titulo,objetivo,programada_para,minutos_estimados)
 VALUES(p_trabajo,p_trabajador,p_titulo,p_objetivo,p_programada_para,p_minutos_estimados) RETURNING id INTO v_id;
 RETURN v_id;
END $function$;

-- Se conserva la lógica existente y se añade la comprobación de rol.
CREATE OR REPLACE FUNCTION privado.responder_invitacion(p_invitacion bigint, p_aceptar boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_inv public.invitaciones%ROWTYPE;
BEGIN
 PERFORM privado.exigir_rol('trabajador');
 SELECT * INTO v_inv FROM public.invitaciones WHERE id=p_invitacion FOR UPDATE;
 IF NOT FOUND OR v_inv.trabajador_id IS DISTINCT FROM privado.mi_perfil_id() OR v_inv.estado<>'pendiente' THEN RAISE EXCEPTION 'Invitación no disponible'; END IF;
 IF p_aceptar IS NULL THEN RAISE EXCEPTION 'Respuesta inválida'; END IF;
 IF p_aceptar THEN
   INSERT INTO public.membresias(empresa_id,trabajador_id) VALUES(v_inv.empresa_id,v_inv.trabajador_id)
   ON CONFLICT (empresa_id,trabajador_id) DO UPDATE SET estado='activa',fecha_ingreso=now();
 END IF;
 UPDATE public.invitaciones SET estado=CASE WHEN p_aceptar THEN 'aceptada' ELSE 'rechazada' END, respondida_en=now() WHERE id=p_invitacion;
END $function$;

-- Se conserva la lógica existente y se añade la comprobación de rol.
CREATE OR REPLACE FUNCTION privado.listar_invitaciones_visibles()
 RETURNS TABLE(id bigint, empresa_id bigint, nombre_empresa text, trabajador_id bigint, nombre_usuario text, estado text, creada_en timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
    SELECT
        i.id,
        i.empresa_id,
        e.nombre,
        i.trabajador_id,
        p.nombre_usuario,
        i.estado,
        i.creada_en
    FROM public.invitaciones i
    JOIN public.empresas e ON e.id = i.empresa_id
    JOIN public.perfiles p ON p.id = i.trabajador_id
    WHERE
        (privado.mi_rol()='trabajador' AND i.trabajador_id = privado.mi_perfil_id())
        OR privado.es_propietario(i.empresa_id)
$function$;

-- Las escrituras siguen pasando exclusivamente por las RPC existentes.
-- El perfil propio permanece legible para los tres roles.
ALTER POLICY membresias_lectura ON public.membresias USING (
    privado.es_propietario(empresa_id)
    OR (privado.mi_rol() = 'trabajador' AND trabajador_id = privado.mi_perfil_id())
);
ALTER POLICY invitaciones_lectura ON public.invitaciones USING (
    privado.es_propietario(empresa_id)
    OR (privado.mi_rol() = 'trabajador' AND trabajador_id = privado.mi_perfil_id())
);
ALTER POLICY trabajos_lectura ON public.trabajos USING (
    privado.es_propietario(empresa_id)
    OR (privado.mi_rol() = 'trabajador' AND EXISTS (
        SELECT 1 FROM public.asignaciones a
        WHERE a.trabajo_id = trabajos.id AND a.trabajador_id = privado.mi_perfil_id()
    ))
);

-- No se concede UPDATE de perfiles: actualizar_mi_perfil solo modifica nombres.
REVOKE INSERT, UPDATE, DELETE ON public.perfiles FROM anon, authenticated;

-- Procedimiento reservado al operador de base de datos; no es una RPC pública.
CREATE OR REPLACE FUNCTION privado.habilitar_administrador(p_usuario_auth_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE v_perfil bigint;
BEGIN
    SELECT id INTO v_perfil FROM public.perfiles
    WHERE usuario_auth_id = p_usuario_auth_id FOR UPDATE;
    IF v_perfil IS NULL THEN
        RAISE EXCEPTION 'La cuenta debe existir primero en Supabase Auth';
    END IF;
    IF EXISTS (SELECT 1 FROM public.empresas WHERE propietario_id = v_perfil)
       OR EXISTS (SELECT 1 FROM public.membresias WHERE trabajador_id = v_perfil AND estado = 'activa')
       OR EXISTS (SELECT 1 FROM public.invitaciones WHERE trabajador_id = v_perfil AND estado = 'pendiente')
       OR EXISTS (SELECT 1 FROM public.asignaciones WHERE trabajador_id = v_perfil AND estado IN ('pendiente', 'aceptada', 'en_curso'))
    THEN
        RAISE EXCEPTION 'Utiliza una cuenta administrativa sin empresas ni actividad operativa pendiente';
    END IF;
    UPDATE public.perfiles SET rol = 'administrador' WHERE id = v_perfil;
END $$;
REVOKE ALL ON FUNCTION privado.habilitar_administrador(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION privado.habilitar_administrador(uuid) TO postgres;

COMMIT;

