-- Fixture aislado: esquema público inspeccionado mediante MCP el 2026-10-16.
-- Auth se simula solo para probar permisos SQL. Nunca aplicar este archivo a Supabase.
SET check_function_bodies = off;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE SCHEMA privado;
REVOKE ALL ON SCHEMA privado FROM PUBLIC;
GRANT USAGE ON SCHEMA privado TO authenticated;
GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}'::jsonb);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE TABLE public.perfiles (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    usuario_auth_id uuid NOT NULL,
    nombre_usuario text NOT NULL,
    nombre_completo text,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.empresas (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    propietario_id bigint NOT NULL,
    nombre text NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.membresias (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    empresa_id bigint NOT NULL,
    trabajador_id bigint NOT NULL,
    alias_interno text,
    estado text DEFAULT 'activa'::text NOT NULL,
    fecha_ingreso timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.invitaciones (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    empresa_id bigint NOT NULL,
    trabajador_id bigint NOT NULL,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    creada_en timestamp with time zone DEFAULT now() NOT NULL,
    respondida_en timestamp with time zone
);

CREATE TABLE public.trabajos (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    empresa_id bigint NOT NULL,
    nombre text NOT NULL,
    latitud double precision NOT NULL,
    longitud double precision NOT NULL,
    radio_metros integer NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.asignaciones (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    trabajo_id bigint NOT NULL,
    trabajador_id bigint NOT NULL,
    titulo text NOT NULL,
    objetivo text NOT NULL,
    programada_para timestamp with time zone NOT NULL,
    minutos_estimados integer NOT NULL,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    motivo_rechazo text,
    inicio_en timestamp with time zone,
    fin_en timestamp with time zone,
    objetivo_cumplido boolean,
    nota_finalizacion text,
    inicio_latitud double precision,
    inicio_longitud double precision,
    inicio_precision_metros double precision,
    fin_latitud double precision,
    fin_longitud double precision,
    fin_precision_metros double precision,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.mensajes (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    asignacion_id bigint NOT NULL,
    remitente_id bigint NOT NULL,
    contenido text NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.asignaciones ADD CONSTRAINT asignaciones_estado_check CHECK ((estado = ANY (ARRAY['pendiente'::text, 'aceptada'::text, 'en_curso'::text, 'finalizada'::text, 'rechazada'::text, 'cancelada'::text])));
ALTER TABLE public.asignaciones ADD CONSTRAINT asignaciones_fin_completa CHECK (((estado <> 'finalizada'::text) OR ((inicio_en IS NOT NULL) AND (fin_en IS NOT NULL) AND (objetivo_cumplido IS NOT NULL))));
ALTER TABLE public.asignaciones ADD CONSTRAINT asignaciones_minutos_estimados_check CHECK (((minutos_estimados >= 1) AND (minutos_estimados <= 10080)));
ALTER TABLE public.asignaciones ADD CONSTRAINT asignaciones_motivo_incumplimiento CHECK (((objetivo_cumplido IS DISTINCT FROM false) OR (length(btrim(COALESCE(nota_finalizacion, ''::text))) > 0)));
ALTER TABLE public.asignaciones ADD CONSTRAINT asignaciones_motivo_rechazo CHECK (((estado <> 'rechazada'::text) OR (length(btrim(COALESCE(motivo_rechazo, ''::text))) > 0)));
ALTER TABLE public.asignaciones ADD CONSTRAINT asignaciones_objetivo_check CHECK (((length(btrim(objetivo)) >= 2) AND (length(btrim(objetivo)) <= 2000)));
ALTER TABLE public.asignaciones ADD CONSTRAINT asignaciones_orden_temporal CHECK (((fin_en IS NULL) OR ((inicio_en IS NOT NULL) AND (fin_en >= inicio_en))));
ALTER TABLE public.asignaciones ADD CONSTRAINT asignaciones_pkey PRIMARY KEY (id);
ALTER TABLE public.asignaciones ADD CONSTRAINT asignaciones_titulo_check CHECK (((length(btrim(titulo)) >= 2) AND (length(btrim(titulo)) <= 160)));
ALTER TABLE public.empresas ADD CONSTRAINT empresas_nombre_check CHECK (((length(btrim(nombre)) >= 2) AND (length(btrim(nombre)) <= 120)));
ALTER TABLE public.empresas ADD CONSTRAINT empresas_pkey PRIMARY KEY (id);
ALTER TABLE public.invitaciones ADD CONSTRAINT invitaciones_estado_check CHECK ((estado = ANY (ARRAY['pendiente'::text, 'aceptada'::text, 'rechazada'::text, 'cancelada'::text])));
ALTER TABLE public.invitaciones ADD CONSTRAINT invitaciones_pkey PRIMARY KEY (id);
ALTER TABLE public.membresias ADD CONSTRAINT membresias_empresa_id_trabajador_id_key UNIQUE (empresa_id, trabajador_id);
ALTER TABLE public.membresias ADD CONSTRAINT membresias_estado_check CHECK ((estado = ANY (ARRAY['activa'::text, 'retirada'::text])));
ALTER TABLE public.membresias ADD CONSTRAINT membresias_id_empresa_id_trabajador_id_key UNIQUE (id, empresa_id, trabajador_id);
ALTER TABLE public.membresias ADD CONSTRAINT membresias_pkey PRIMARY KEY (id);
ALTER TABLE public.mensajes ADD CONSTRAINT mensajes_contenido_check CHECK (((length(btrim(contenido)) >= 1) AND (length(btrim(contenido)) <= 4000)));
ALTER TABLE public.mensajes ADD CONSTRAINT mensajes_pkey PRIMARY KEY (id);
ALTER TABLE public.perfiles ADD CONSTRAINT perfiles_nombre_usuario_formato CHECK ((nombre_usuario ~ '^[a-z0-9_]{3,30}$'::text));
ALTER TABLE public.perfiles ADD CONSTRAINT perfiles_nombre_usuario_key UNIQUE (nombre_usuario);
ALTER TABLE public.perfiles ADD CONSTRAINT perfiles_pkey PRIMARY KEY (id);
ALTER TABLE public.perfiles ADD CONSTRAINT perfiles_usuario_auth_id_key UNIQUE (usuario_auth_id);
ALTER TABLE public.trabajos ADD CONSTRAINT trabajos_id_empresa_id_key UNIQUE (id, empresa_id);
ALTER TABLE public.trabajos ADD CONSTRAINT trabajos_latitud_check CHECK (((latitud >= ('-90'::integer)::double precision) AND (latitud <= (90)::double precision)));
ALTER TABLE public.trabajos ADD CONSTRAINT trabajos_longitud_check CHECK (((longitud >= ('-180'::integer)::double precision) AND (longitud <= (180)::double precision)));
ALTER TABLE public.trabajos ADD CONSTRAINT trabajos_nombre_check CHECK (((length(btrim(nombre)) >= 2) AND (length(btrim(nombre)) <= 160)));
ALTER TABLE public.trabajos ADD CONSTRAINT trabajos_pkey PRIMARY KEY (id);
ALTER TABLE public.trabajos ADD CONSTRAINT trabajos_radio_metros_check CHECK (((radio_metros >= 10) AND (radio_metros <= 1000)));
ALTER TABLE public.asignaciones ADD CONSTRAINT asignaciones_trabajador_id_fkey FOREIGN KEY (trabajador_id) REFERENCES perfiles(id);
ALTER TABLE public.asignaciones ADD CONSTRAINT asignaciones_trabajo_id_fkey FOREIGN KEY (trabajo_id) REFERENCES trabajos(id);
ALTER TABLE public.empresas ADD CONSTRAINT empresas_propietario_id_fkey FOREIGN KEY (propietario_id) REFERENCES perfiles(id);
ALTER TABLE public.invitaciones ADD CONSTRAINT invitaciones_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id);
ALTER TABLE public.invitaciones ADD CONSTRAINT invitaciones_trabajador_id_fkey FOREIGN KEY (trabajador_id) REFERENCES perfiles(id);
ALTER TABLE public.membresias ADD CONSTRAINT membresias_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id);
ALTER TABLE public.membresias ADD CONSTRAINT membresias_trabajador_id_fkey FOREIGN KEY (trabajador_id) REFERENCES perfiles(id);
ALTER TABLE public.mensajes ADD CONSTRAINT mensajes_asignacion_id_fkey FOREIGN KEY (asignacion_id) REFERENCES asignaciones(id);
ALTER TABLE public.mensajes ADD CONSTRAINT mensajes_remitente_id_fkey FOREIGN KEY (remitente_id) REFERENCES perfiles(id);
ALTER TABLE public.perfiles ADD CONSTRAINT perfiles_usuario_auth_id_fkey FOREIGN KEY (usuario_auth_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.trabajos ADD CONSTRAINT trabajos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id);

CREATE OR REPLACE FUNCTION privado.actualizar_mi_perfil(p_nombre_usuario text, p_nombre_completo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF p_nombre_usuario IS NULL OR lower(btrim(p_nombre_usuario)) !~ '^[a-z0-9_]{3,30}$' THEN RAISE EXCEPTION 'Nombre de usuario inválido'; END IF;
 UPDATE public.perfiles SET nombre_usuario=lower(btrim(p_nombre_usuario)),nombre_completo=nullif(btrim(p_nombre_completo),'') WHERE id=privado.mi_perfil_id();
 IF NOT FOUND THEN RAISE EXCEPTION 'Perfil no encontrado'; END IF;
END $function$;

CREATE OR REPLACE FUNCTION privado.buscar_trabajador(p_nombre_usuario text)
 RETURNS TABLE(id bigint, nombre_usuario text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT p.id,p.nombre_usuario FROM public.perfiles p WHERE p.nombre_usuario=lower(btrim(p_nombre_usuario)) AND auth.uid() IS NOT NULL LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION privado.cambiar_alias(p_empresa bigint, p_trabajador bigint, p_alias text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF NOT privado.es_propietario(p_empresa) THEN RAISE EXCEPTION 'No autorizado'; END IF;
 UPDATE public.membresias SET alias_interno=nullif(left(btrim(p_alias),100),'') WHERE empresa_id=p_empresa AND trabajador_id=p_trabajador AND estado='activa';
 IF NOT FOUND THEN RAISE EXCEPTION 'Miembro no encontrado'; END IF;
END $function$;

CREATE OR REPLACE FUNCTION privado.cancelar_asignacion(p_asignacion bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_estado text;v_empresa bigint;
BEGIN
 SELECT a.estado,t.empresa_id INTO v_estado,v_empresa FROM public.asignaciones a JOIN public.trabajos t ON t.id=a.trabajo_id WHERE a.id=p_asignacion FOR UPDATE OF a;
 IF NOT FOUND OR NOT privado.es_propietario(v_empresa) THEN RAISE EXCEPTION 'Asignación no autorizada'; END IF;
 IF v_estado NOT IN ('pendiente','aceptada') THEN RAISE EXCEPTION 'Solo se cancelan asignaciones no iniciadas'; END IF;
 UPDATE public.asignaciones SET estado='cancelada' WHERE id=p_asignacion;
END $function$;

CREATE OR REPLACE FUNCTION privado.cancelar_trabajo(p_trabajo bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_empresa bigint;
BEGIN
 SELECT empresa_id INTO v_empresa FROM public.trabajos WHERE id=p_trabajo FOR UPDATE;
 IF NOT FOUND OR NOT privado.es_propietario(v_empresa) THEN RAISE EXCEPTION 'Trabajo no autorizado'; END IF;
 IF EXISTS(SELECT 1 FROM public.asignaciones WHERE trabajo_id=p_trabajo AND estado='en_curso') THEN
  RAISE EXCEPTION 'Trabajo con asignaciones en curso: no se puede cancelar'; END IF;
 UPDATE public.asignaciones SET estado='cancelada' WHERE trabajo_id=p_trabajo AND estado IN ('pendiente','aceptada');
END $function$;

CREATE OR REPLACE FUNCTION privado.crear_asignacion(p_trabajo bigint, p_trabajador bigint, p_titulo text, p_objetivo text, p_programada_para timestamp with time zone, p_minutos_estimados integer)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_trabajo public.trabajos%ROWTYPE;v_id bigint;
BEGIN
 SELECT * INTO v_trabajo FROM public.trabajos WHERE id=p_trabajo FOR UPDATE;
 IF NOT FOUND OR NOT privado.es_propietario(v_trabajo.empresa_id) THEN RAISE EXCEPTION 'Trabajo no autorizado'; END IF;
 IF EXISTS(SELECT 1 FROM public.asignaciones WHERE trabajo_id=p_trabajo AND estado='en_curso') THEN RAISE EXCEPTION 'No se puede modificar un trabajo en ejecución'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.membresias WHERE empresa_id=v_trabajo.empresa_id AND trabajador_id=p_trabajador AND estado='activa') THEN
   RAISE EXCEPTION 'El trabajador no pertenece al equipo activo'; END IF;
 INSERT INTO public.asignaciones(trabajo_id,trabajador_id,titulo,objetivo,programada_para,minutos_estimados)
 VALUES(p_trabajo,p_trabajador,p_titulo,p_objetivo,p_programada_para,p_minutos_estimados) RETURNING id INTO v_id;
 RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION privado.crear_empresa(p_nombre text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_id bigint;
BEGIN
 IF privado.mi_perfil_id() IS NULL THEN RAISE EXCEPTION 'Inicia sesión'; END IF;
 INSERT INTO public.empresas(propietario_id,nombre) VALUES (privado.mi_perfil_id(),p_nombre) RETURNING id INTO v_id;
 RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION privado.crear_perfil_al_registrarse()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_id bigint;
BEGIN
 INSERT INTO public.perfiles(usuario_auth_id,nombre_usuario) VALUES (NEW.id,'tmp_' || left(replace(NEW.id::text,'-',''),24)) RETURNING id INTO v_id;
 UPDATE public.perfiles SET nombre_usuario='usuario_'||v_id WHERE id=v_id;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION privado.crear_trabajo(p_empresa bigint, p_nombre text, p_latitud double precision, p_longitud double precision, p_radio_metros integer)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_id bigint;
BEGIN
 IF NOT privado.es_propietario(p_empresa) THEN RAISE EXCEPTION 'No autorizado'; END IF;
 INSERT INTO public.trabajos(empresa_id,nombre,latitud,longitud,radio_metros)
 VALUES(p_empresa,p_nombre,p_latitud,p_longitud,p_radio_metros) RETURNING id INTO v_id;
 RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION privado.distancia_metros(p_lat1 double precision, p_lon1 double precision, p_lat2 double precision, p_lon2 double precision)
 RETURNS double precision
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 SELECT 6371000.0 * 2 * asin(least(1.0, sqrt(
   power(sin(radians((p_lat2-p_lat1)/2)),2) + cos(radians(p_lat1))*cos(radians(p_lat2))*power(sin(radians((p_lon2-p_lon1)/2)),2))))
$function$;

CREATE OR REPLACE FUNCTION privado.editar_asignacion(p_asignacion bigint, p_titulo text, p_objetivo text, p_programada_para timestamp with time zone, p_minutos_estimados integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_estado text;v_empresa bigint;
BEGIN
 SELECT a.estado,t.empresa_id INTO v_estado,v_empresa FROM public.asignaciones a JOIN public.trabajos t ON t.id=a.trabajo_id
 WHERE a.id=p_asignacion FOR UPDATE OF a;
 IF NOT FOUND OR NOT privado.es_propietario(v_empresa) THEN RAISE EXCEPTION 'Asignación no autorizada'; END IF;
 IF v_estado NOT IN ('pendiente','aceptada') THEN RAISE EXCEPTION 'Solo se editan asignaciones sin iniciar'; END IF;
 UPDATE public.asignaciones SET titulo=p_titulo,objetivo=p_objetivo,programada_para=p_programada_para,minutos_estimados=p_minutos_estimados WHERE id=p_asignacion;
END $function$;

CREATE OR REPLACE FUNCTION privado.editar_trabajo(p_trabajo bigint, p_nombre text, p_latitud double precision, p_longitud double precision, p_radio_metros integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_empresa bigint;
BEGIN
 SELECT empresa_id INTO v_empresa FROM public.trabajos WHERE id=p_trabajo FOR UPDATE;
 IF NOT FOUND OR NOT privado.es_propietario(v_empresa) THEN RAISE EXCEPTION 'Trabajo no autorizado'; END IF;
 IF EXISTS(SELECT 1 FROM public.asignaciones WHERE trabajo_id=p_trabajo AND inicio_en IS NOT NULL) THEN
  RAISE EXCEPTION 'La ubicación de un trabajo iniciado es inmutable'; END IF;
 UPDATE public.trabajos SET nombre=p_nombre,latitud=p_latitud,longitud=p_longitud,radio_metros=p_radio_metros WHERE id=p_trabajo;
END $function$;

CREATE OR REPLACE FUNCTION privado.enviar_invitacion(p_empresa bigint, p_trabajador bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_id bigint;
BEGIN
 IF NOT privado.es_propietario(p_empresa) THEN RAISE EXCEPTION 'No autorizado'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.perfiles WHERE id=p_trabajador) THEN RAISE EXCEPTION 'Trabajador inexistente'; END IF;
 IF EXISTS(SELECT 1 FROM public.membresias WHERE empresa_id=p_empresa AND trabajador_id=p_trabajador AND estado='activa') THEN RAISE EXCEPTION 'Ya pertenece a esta empresa'; END IF;
 INSERT INTO public.invitaciones(empresa_id,trabajador_id) VALUES(p_empresa,p_trabajador) RETURNING id INTO v_id;
 RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION privado.enviar_mensaje(p_asignacion bigint, p_contenido text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_id bigint;
BEGIN
 IF NOT privado.puede_ver_asignacion(p_asignacion) THEN RAISE EXCEPTION 'No autorizado'; END IF;
 INSERT INTO public.mensajes(asignacion_id,remitente_id,contenido) VALUES(p_asignacion,privado.mi_perfil_id(),p_contenido) RETURNING id INTO v_id;
 RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION privado.es_miembro(p_empresa bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT EXISTS(SELECT 1 FROM public.membresias WHERE empresa_id=p_empresa AND trabajador_id=privado.mi_perfil_id() AND estado='activa')
$function$;

CREATE OR REPLACE FUNCTION privado.es_propietario(p_empresa bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT EXISTS(SELECT 1 FROM public.empresas WHERE id=p_empresa AND propietario_id=privado.mi_perfil_id())
$function$;

CREATE OR REPLACE FUNCTION privado.finalizar_asignacion(p_asignacion bigint, p_latitud double precision, p_longitud double precision, p_precision_metros double precision, p_objetivo_cumplido boolean, p_nota text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_asig public.asignaciones%ROWTYPE;v_trabajo public.trabajos%ROWTYPE;
BEGIN
 SELECT * INTO v_asig FROM public.asignaciones WHERE id=p_asignacion FOR UPDATE;
 IF NOT FOUND OR v_asig.trabajador_id IS DISTINCT FROM privado.mi_perfil_id() OR v_asig.estado<>'en_curso' THEN RAISE EXCEPTION 'La tarea no está en curso o no te corresponde'; END IF;
 SELECT * INTO v_trabajo FROM public.trabajos WHERE id=v_asig.trabajo_id;
 IF NOT privado.es_miembro(v_trabajo.empresa_id) THEN RAISE EXCEPTION 'No perteneces a esta empresa'; END IF;
 IF p_objetivo_cumplido IS NULL THEN RAISE EXCEPTION 'Indica el cumplimiento del objetivo'; END IF;
 IF NOT p_objetivo_cumplido AND nullif(btrim(p_nota),'') IS NULL THEN RAISE EXCEPTION 'Debes explicar por qué no se cumplió'; END IF;
 PERFORM privado.validar_ubicacion(p_latitud,p_longitud,p_precision_metros,v_trabajo.latitud,v_trabajo.longitud,v_trabajo.radio_metros);
 UPDATE public.asignaciones SET estado='finalizada',fin_en=clock_timestamp(),objetivo_cumplido=p_objetivo_cumplido,
 nota_finalizacion=nullif(btrim(p_nota),''),fin_latitud=p_latitud,fin_longitud=p_longitud,fin_precision_metros=p_precision_metros WHERE id=p_asignacion;
END $function$;

CREATE OR REPLACE FUNCTION privado.iniciar_asignacion(p_asignacion bigint, p_latitud double precision, p_longitud double precision, p_precision_metros double precision)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_asig public.asignaciones%ROWTYPE;v_trabajo public.trabajos%ROWTYPE;
BEGIN
 SELECT * INTO v_asig FROM public.asignaciones WHERE id=p_asignacion FOR UPDATE;
 IF NOT FOUND OR v_asig.trabajador_id IS DISTINCT FROM privado.mi_perfil_id() OR v_asig.estado<>'aceptada' THEN RAISE EXCEPTION 'La tarea no está aceptada o no te corresponde'; END IF;
 SELECT * INTO v_trabajo FROM public.trabajos WHERE id=v_asig.trabajo_id;
 IF NOT privado.es_miembro(v_trabajo.empresa_id) THEN RAISE EXCEPTION 'No perteneces a esta empresa'; END IF;
 PERFORM privado.validar_ubicacion(p_latitud,p_longitud,p_precision_metros,v_trabajo.latitud,v_trabajo.longitud,v_trabajo.radio_metros);
 UPDATE public.asignaciones SET estado='en_curso',inicio_en=clock_timestamp(),inicio_latitud=p_latitud,inicio_longitud=p_longitud,inicio_precision_metros=p_precision_metros WHERE id=p_asignacion;
END $function$;

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
        i.trabajador_id = privado.mi_perfil_id()
        OR privado.es_propietario(i.empresa_id)
$function$;

CREATE OR REPLACE FUNCTION privado.mi_perfil_id()
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT id FROM public.perfiles WHERE usuario_auth_id = (SELECT auth.uid()) LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION privado.puede_ver_asignacion(p_asignacion bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT EXISTS(SELECT 1 FROM public.asignaciones a JOIN public.trabajos t ON t.id=a.trabajo_id
  WHERE a.id=p_asignacion AND (a.trabajador_id=privado.mi_perfil_id() OR privado.es_propietario(t.empresa_id)))
$function$;

CREATE OR REPLACE FUNCTION privado.puede_ver_perfil(p_perfil bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT p_perfil=privado.mi_perfil_id() OR EXISTS(
   SELECT 1 FROM public.membresias m JOIN public.empresas e ON e.id=m.empresa_id
   WHERE m.trabajador_id=p_perfil AND e.propietario_id=privado.mi_perfil_id()
 )
$function$;

CREATE OR REPLACE FUNCTION privado.responder_asignacion(p_asignacion bigint, p_aceptar boolean, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_asig public.asignaciones%ROWTYPE;v_empresa bigint;
BEGIN
 SELECT * INTO v_asig FROM public.asignaciones WHERE id=p_asignacion FOR UPDATE;
 IF NOT FOUND OR v_asig.trabajador_id IS DISTINCT FROM privado.mi_perfil_id() OR v_asig.estado<>'pendiente' THEN RAISE EXCEPTION 'Asignación no disponible'; END IF;
 SELECT empresa_id INTO v_empresa FROM public.trabajos WHERE id=v_asig.trabajo_id;
 IF NOT privado.es_miembro(v_empresa) THEN RAISE EXCEPTION 'No perteneces a esta empresa'; END IF;
 IF p_aceptar IS NULL THEN RAISE EXCEPTION 'Respuesta inválida'; END IF;
 IF NOT p_aceptar AND nullif(btrim(p_motivo),'') IS NULL THEN RAISE EXCEPTION 'Explica el rechazo'; END IF;
 UPDATE public.asignaciones SET estado=CASE WHEN p_aceptar THEN 'aceptada' ELSE 'rechazada' END,
 motivo_rechazo=CASE WHEN p_aceptar THEN NULL ELSE btrim(p_motivo) END WHERE id=p_asignacion;
END $function$;

CREATE OR REPLACE FUNCTION privado.responder_invitacion(p_invitacion bigint, p_aceptar boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_inv public.invitaciones%ROWTYPE;
BEGIN
 SELECT * INTO v_inv FROM public.invitaciones WHERE id=p_invitacion FOR UPDATE;
 IF NOT FOUND OR v_inv.trabajador_id IS DISTINCT FROM privado.mi_perfil_id() OR v_inv.estado<>'pendiente' THEN RAISE EXCEPTION 'Invitación no disponible'; END IF;
 IF p_aceptar IS NULL THEN RAISE EXCEPTION 'Respuesta inválida'; END IF;
 IF p_aceptar THEN
   INSERT INTO public.membresias(empresa_id,trabajador_id) VALUES(v_inv.empresa_id,v_inv.trabajador_id)
   ON CONFLICT (empresa_id,trabajador_id) DO UPDATE SET estado='activa',fecha_ingreso=now();
 END IF;
 UPDATE public.invitaciones SET estado=CASE WHEN p_aceptar THEN 'aceptada' ELSE 'rechazada' END, respondida_en=now() WHERE id=p_invitacion;
END $function$;

CREATE OR REPLACE FUNCTION privado.retirar_trabajador(p_empresa bigint, p_trabajador bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF NOT privado.es_propietario(p_empresa) THEN RAISE EXCEPTION 'No autorizado'; END IF;
 IF EXISTS(SELECT 1 FROM public.asignaciones a JOIN public.trabajos t ON t.id=a.trabajo_id
           WHERE t.empresa_id=p_empresa AND a.trabajador_id=p_trabajador AND a.estado='en_curso') THEN
   RAISE EXCEPTION 'No puedes retirar un trabajador con asignaciones en curso';
 END IF;
 UPDATE public.membresias SET estado='retirada' WHERE empresa_id=p_empresa AND trabajador_id=p_trabajador AND estado='activa';
 IF NOT FOUND THEN RAISE EXCEPTION 'Miembro no encontrado'; END IF;
END $function$;

CREATE OR REPLACE FUNCTION privado.validar_ubicacion(p_lat double precision, p_lon double precision, p_precision double precision, p_centro_lat double precision, p_centro_lon double precision, p_radio integer)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN

    -- 1. Comprobar datos ausentes
    IF p_lat IS NULL
       OR p_lon IS NULL
       OR p_precision IS NULL
    THEN
        RAISE EXCEPTION
            'No se recibieron los datos completos del GPS';
    END IF;

    -- 2. Comprobar coordenadas válidas
    IF p_lat NOT BETWEEN -90 AND 90
       OR p_lon NOT BETWEEN -180 AND 180
       OR p_precision < 0
    THEN
        RAISE EXCEPTION
            'Coordenadas o precisión GPS inválidas';
    END IF;

    -- 3. Comprobar precisión
    IF p_precision > LEAST(
        p_radio::double precision,
        50.0
    ) THEN
        RAISE EXCEPTION
            'Precisión GPS insuficiente: % metros. Máximo permitido: % metros',
            ROUND(p_precision::numeric, 2),
            LEAST(p_radio, 50);
    END IF;

    -- 4. Comprobar distancia al trabajo
    IF privado.distancia_metros(
        p_lat,
        p_lon,
        p_centro_lat,
        p_centro_lon
    ) + p_precision > p_radio
    THEN
        RAISE EXCEPTION
            'Fuera del radio autorizado';
    END IF;

END;
$function$;

CREATE OR REPLACE FUNCTION public.actualizar_mi_perfil(nombre_usuario text, nombre_completo text)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$ SELECT privado.actualizar_mi_perfil(nombre_usuario,nombre_completo) $function$;

CREATE OR REPLACE FUNCTION public.buscar_trabajador(p_nombre_usuario text)
 RETURNS TABLE(id bigint, nombre_usuario text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ SELECT * FROM privado.buscar_trabajador(p_nombre_usuario) $function$;

CREATE OR REPLACE FUNCTION public.cambiar_alias(empresa_id bigint, trabajador_id bigint, alias_interno text)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$ SELECT privado.cambiar_alias(empresa_id,trabajador_id,alias_interno) $function$;

CREATE OR REPLACE FUNCTION public.cancelar_asignacion(asignacion_id bigint)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$ SELECT privado.cancelar_asignacion(asignacion_id) $function$;

CREATE OR REPLACE FUNCTION public.cancelar_trabajo(trabajo_id bigint)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$ SELECT privado.cancelar_trabajo(trabajo_id) $function$;

CREATE OR REPLACE FUNCTION public.crear_asignacion(trabajo_id bigint, trabajador_id bigint, titulo text, objetivo text, programada_para timestamp with time zone, minutos_estimados integer)
 RETURNS bigint
 LANGUAGE sql
 SET search_path TO ''
AS $function$ SELECT privado.crear_asignacion(trabajo_id,trabajador_id,titulo,objetivo,programada_para,minutos_estimados) $function$;

CREATE OR REPLACE FUNCTION public.crear_empresa(nombre text)
 RETURNS bigint
 LANGUAGE sql
 SET search_path TO ''
AS $function$ SELECT privado.crear_empresa(nombre) $function$;

CREATE OR REPLACE FUNCTION public.crear_trabajo(empresa_id bigint, nombre text, latitud double precision, longitud double precision, radio_metros integer)
 RETURNS bigint
 LANGUAGE sql
 SET search_path TO ''
AS $function$ SELECT privado.crear_trabajo(empresa_id,nombre,latitud,longitud,radio_metros) $function$;

CREATE OR REPLACE FUNCTION public.editar_asignacion(asignacion_id bigint, titulo text, objetivo text, programada_para timestamp with time zone, minutos_estimados integer)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$ SELECT privado.editar_asignacion(asignacion_id,titulo,objetivo,programada_para,minutos_estimados) $function$;

CREATE OR REPLACE FUNCTION public.editar_trabajo(trabajo_id bigint, nombre text, latitud double precision, longitud double precision, radio_metros integer)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$ SELECT privado.editar_trabajo(trabajo_id,nombre,latitud,longitud,radio_metros) $function$;

CREATE OR REPLACE FUNCTION public.enviar_invitacion(empresa_id bigint, trabajador_id bigint)
 RETURNS bigint
 LANGUAGE sql
 SET search_path TO ''
AS $function$ SELECT privado.enviar_invitacion(empresa_id,trabajador_id) $function$;

CREATE OR REPLACE FUNCTION public.enviar_mensaje(asignacion_id bigint, contenido text)
 RETURNS bigint
 LANGUAGE sql
 SET search_path TO ''
AS $function$ SELECT privado.enviar_mensaje(asignacion_id,contenido) $function$;

CREATE OR REPLACE FUNCTION public.finalizar_asignacion(asignacion_id bigint, latitud double precision, longitud double precision, precision_metros double precision, objetivo_cumplido boolean, nota_finalizacion text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$ SELECT privado.finalizar_asignacion(asignacion_id,latitud,longitud,precision_metros,objetivo_cumplido,nota_finalizacion) $function$;

CREATE OR REPLACE FUNCTION public.iniciar_asignacion(asignacion_id bigint, latitud double precision, longitud double precision, precision_metros double precision)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$ SELECT privado.iniciar_asignacion(asignacion_id,latitud,longitud,precision_metros) $function$;

CREATE OR REPLACE FUNCTION public.listar_invitaciones_visibles()
 RETURNS TABLE(id bigint, empresa_id bigint, nombre_empresa text, trabajador_id bigint, nombre_usuario text, estado text, creada_en timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
    SELECT * FROM privado.listar_invitaciones_visibles()
$function$;

CREATE OR REPLACE FUNCTION public.responder_asignacion(asignacion_id bigint, aceptar boolean, motivo_rechazo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$ SELECT privado.responder_asignacion(asignacion_id,aceptar,motivo_rechazo) $function$;

CREATE OR REPLACE FUNCTION public.responder_invitacion(invitacion_id bigint, aceptar boolean)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$ SELECT privado.responder_invitacion(invitacion_id,aceptar) $function$;

CREATE OR REPLACE FUNCTION public.retirar_trabajador(empresa_id bigint, trabajador_id bigint)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$ SELECT privado.retirar_trabajador(empresa_id,trabajador_id) $function$;

SET check_function_bodies = on;
CREATE TRIGGER al_registrar_usuario AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION privado.crear_perfil_al_registrarse();
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membresias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trabajos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asignaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensajes ENABLE ROW LEVEL SECURITY;
CREATE POLICY perfiles_lectura ON public.perfiles FOR SELECT TO authenticated USING (privado.puede_ver_perfil(id));
CREATE POLICY empresas_lectura ON public.empresas FOR SELECT TO authenticated USING ((privado.es_propietario(id) OR privado.es_miembro(id)));
CREATE POLICY membresias_lectura ON public.membresias FOR SELECT TO authenticated USING ((privado.es_propietario(empresa_id) OR (trabajador_id = privado.mi_perfil_id())));
CREATE POLICY invitaciones_lectura ON public.invitaciones FOR SELECT TO authenticated USING ((privado.es_propietario(empresa_id) OR (trabajador_id = privado.mi_perfil_id())));
CREATE POLICY trabajos_lectura ON public.trabajos FOR SELECT TO authenticated USING ((privado.es_propietario(empresa_id) OR (EXISTS ( SELECT 1
   FROM asignaciones a
  WHERE ((a.trabajo_id = trabajos.id) AND (a.trabajador_id = privado.mi_perfil_id()))))));
CREATE POLICY asignaciones_lectura ON public.asignaciones FOR SELECT TO authenticated USING (privado.puede_ver_asignacion(id));
CREATE POLICY mensajes_lectura ON public.mensajes FOR SELECT TO authenticated USING (privado.puede_ver_asignacion(asignacion_id));

