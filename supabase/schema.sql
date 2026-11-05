-- =====================================================================
-- MiDT · Esquema para Supabase (Postgres)
-- Multi-academia · roles: director, entrenador, padre/tutor
-- Seguridad por fila (RLS) en TODAS las tablas.
--
-- Cómo usarlo: Supabase → SQL Editor → pegar todo → Run (una sola vez).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) TABLAS
--    Las llaves compuestas (id, academia_id) impiden que un registro de
--    una academia apunte a datos de otra (aislamiento entre academias).
-- ---------------------------------------------------------------------

create table public.academias (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null check (length(trim(nombre)) between 2 and 120),
  creada_en  timestamptz not null default now(),
  creada_por uuid not null default auth.uid()
);

create table public.miembros (
  academia_id uuid not null references public.academias(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  rol         text not null check (rol in ('director','entrenador')),
  nombre      text,
  creado_en   timestamptz not null default now(),
  primary key (academia_id, user_id)
);

create table public.equipos (
  id              uuid primary key default gen_random_uuid(),
  academia_id     uuid not null references public.academias(id) on delete cascade,
  nombre          text not null check (length(trim(nombre)) between 1 and 120),
  contacto_nombre text,            -- firma de los mensajes de WhatsApp
  contacto_tel    text,
  uniformes       text[] not null default '{}',
  creado_en       timestamptz not null default now(),
  unique (id, academia_id)
);

-- Qué entrenadores ven cada equipo (el director ve todos)
create table public.equipo_entrenadores (
  equipo_id   uuid not null,
  user_id     uuid not null,
  academia_id uuid not null,
  primary key (equipo_id, user_id),
  foreign key (equipo_id, academia_id) references public.equipos(id, academia_id) on delete cascade,
  foreign key (academia_id, user_id)   references public.miembros(academia_id, user_id) on delete cascade
);

create table public.jugadores (
  id              uuid primary key default gen_random_uuid(),
  academia_id     uuid not null references public.academias(id) on delete cascade,
  equipo_id       uuid,
  nombre          text not null check (length(trim(nombre)) between 1 and 120),
  anio_nacimiento int check (anio_nacimiento between 1990 and 2100),
  posicion        text,
  dia_cumple      int check (dia_cumple between 1 and 31),
  mes_cumple      int check (mes_cumple between 1 and 12),
  tel_tutor       text,
  estado          text not null default 'activo' check (estado in ('activo','baja')),
  baja_fecha      date,
  baja_motivo     text,
  legacy_id       bigint,          -- id que tenía en la versión local (migración)
  creado_en       timestamptz not null default now(),
  unique (id, academia_id),
  foreign key (equipo_id, academia_id) references public.equipos(id, academia_id)
    on delete set null (equipo_id)
);

-- Padre/tutor ↔ jugador (solo se crea al canjear una invitación)
create table public.tutores (
  user_id     uuid not null references auth.users(id) on delete cascade,
  jugador_id  uuid not null,
  academia_id uuid not null,
  creado_en   timestamptz not null default now(),
  primary key (user_id, jugador_id),
  foreign key (jugador_id, academia_id) references public.jugadores(id, academia_id) on delete cascade
);

-- Evidencia del consentimiento del tutor para tratar datos del menor
create table public.consentimientos (
  id            uuid primary key default gen_random_uuid(),
  academia_id   uuid not null,
  jugador_id    uuid not null,
  tutor_nombre  text not null check (length(trim(tutor_nombre)) > 1),
  version_aviso text not null,
  via           text not null default 'presencial' check (via in ('presencial','enlace')),
  aceptado_en   timestamptz not null default now(),
  registrado_por uuid default auth.uid(),
  foreign key (jugador_id, academia_id) references public.jugadores(id, academia_id) on delete cascade
);

create table public.partidos (
  id             uuid primary key default gen_random_uuid(),
  academia_id    uuid not null,
  equipo_id      uuid not null,
  fecha          date not null,
  rival          text not null default '',
  favor          int  not null default 0 check (favor  >= 0),
  contra         int  not null default 0 check (contra >= 0),
  minutos_contra int[] not null default '{}',
  legacy_id      bigint,
  creado_en      timestamptz not null default now(),
  unique (id, academia_id),
  foreign key (equipo_id, academia_id) references public.equipos(id, academia_id) on delete cascade
);

create table public.partido_stats (
  id            uuid primary key default gen_random_uuid(),
  academia_id   uuid not null,
  partido_id    uuid not null,
  jugador_id    uuid not null,
  jugo          boolean not null default true,
  goles         int not null default 0 check (goles    >= 0),
  minutos_goles int[] not null default '{}',
  asist         int not null default 0 check (asist    >= 0),
  minutos       int not null default 0 check (minutos between 0 and 130),
  duelos        int not null default 0 check (duelos   >= 0),
  amarilla      int not null default 0 check (amarilla >= 0),
  roja          int not null default 0 check (roja     >= 0),
  unique (partido_id, jugador_id),
  foreign key (partido_id, academia_id) references public.partidos(id, academia_id)  on delete cascade,
  foreign key (jugador_id, academia_id) references public.jugadores(id, academia_id) on delete cascade
);

create table public.entrenos (
  id           uuid primary key default gen_random_uuid(),
  academia_id  uuid not null,
  equipo_id    uuid not null,
  fecha        date not null,
  hora         time not null,
  lugar        text not null default '',
  notas        text,
  recordatorio boolean not null default false,
  creado_en    timestamptz not null default now(),
  foreign key (equipo_id, academia_id) references public.equipos(id, academia_id) on delete cascade
);

create table public.ejercicios (
  id          uuid primary key default gen_random_uuid(),
  academia_id uuid not null,
  equipo_id   uuid not null,
  nombre      text not null,
  tipo        text not null default 'personalizado'
              check (tipo in ('repeticiones','vueltas','tiempo','distancia','personalizado')),
  unidad      text not null default '',
  descripcion text,
  creado_en   timestamptz not null default now(),
  unique (id, academia_id),
  foreign key (equipo_id, academia_id) references public.equipos(id, academia_id) on delete cascade
);

create table public.evaluaciones (
  id           uuid primary key default gen_random_uuid(),
  academia_id  uuid not null,
  equipo_id    uuid not null,
  ejercicio_id uuid not null,
  fecha        date not null,
  creado_en    timestamptz not null default now(),
  unique (id, academia_id),
  foreign key (equipo_id, academia_id)    references public.equipos(id, academia_id)    on delete cascade,
  foreign key (ejercicio_id, academia_id) references public.ejercicios(id, academia_id) on delete cascade
);

create table public.evaluacion_resultados (
  id            uuid primary key default gen_random_uuid(),
  academia_id   uuid not null,
  evaluacion_id uuid not null,
  jugador_id    uuid not null,
  valor         numeric not null,
  unique (evaluacion_id, jugador_id),
  foreign key (evaluacion_id, academia_id) references public.evaluaciones(id, academia_id) on delete cascade,
  foreign key (jugador_id, academia_id)    references public.jugadores(id, academia_id)     on delete cascade
);

-- Códigos de invitación (de un solo uso, caducan a los 7 días)
create table public.invitaciones (
  codigo      text primary key,
  academia_id uuid not null references public.academias(id) on delete cascade,
  tipo        text not null check (tipo in ('entrenador','padre')),
  equipo_id   uuid,
  jugador_id  uuid,
  creada_por  uuid not null default auth.uid(),
  creada_en   timestamptz not null default now(),
  expira_en   timestamptz not null default now() + interval '7 days',
  usada_por   uuid,
  usada_en    timestamptz,
  check (tipo <> 'padre' or jugador_id is not null),
  foreign key (equipo_id, academia_id)  references public.equipos(id, academia_id)   on delete cascade,
  foreign key (jugador_id, academia_id) references public.jugadores(id, academia_id) on delete cascade
);

-- Bitácora de cambios sobre datos de menores
create table public.audit_log (
  id          bigint generated always as identity primary key,
  academia_id uuid,
  user_id     uuid,
  accion      text not null,
  tabla       text not null,
  registro_id uuid,
  en          timestamptz not null default now()
);

-- Índices (las políticas filtran por estas columnas)
create index on public.miembros(user_id);
create index on public.equipo_entrenadores(user_id);
create index on public.equipos(academia_id);
create index on public.jugadores(academia_id);
create index on public.jugadores(equipo_id);
create index on public.tutores(user_id);
create index on public.tutores(jugador_id);
create index on public.consentimientos(jugador_id);
create index on public.partidos(equipo_id);
create index on public.partido_stats(partido_id);
create index on public.partido_stats(jugador_id);
create index on public.entrenos(equipo_id);
create index on public.ejercicios(equipo_id);
create index on public.evaluaciones(equipo_id);
create index on public.evaluaciones(ejercicio_id);
create index on public.evaluacion_resultados(evaluacion_id);
create index on public.evaluacion_resultados(jugador_id);
create index on public.audit_log(academia_id, en desc);

-- ---------------------------------------------------------------------
-- 2) FUNCIONES AUXILIARES DE PERMISOS
--    security definer: leen las tablas sin pasar por RLS (evita recursión).
-- ---------------------------------------------------------------------

create function public.es_miembro(aid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.miembros m
                 where m.academia_id = aid and m.user_id = auth.uid());
$$;

create function public.es_director(aid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.miembros m
                 where m.academia_id = aid and m.user_id = auth.uid() and m.rol = 'director');
$$;

-- Director de la academia del equipo, o entrenador asignado a ese equipo
create function public.puede_equipo(eid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.equipos e
    where e.id = eid
      and ( public.es_director(e.academia_id)
            or exists (select 1 from public.equipo_entrenadores x
                       where x.equipo_id = e.id and x.user_id = auth.uid()) )
  );
$$;

create function public.es_tutor_de(jid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tutores t
                 where t.jugador_id = jid and t.user_id = auth.uid());
$$;

create function public.es_tutor_en(aid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tutores t
                 where t.academia_id = aid and t.user_id = auth.uid());
$$;

-- El padre ve el equipo de su hijo (solo mientras el hijo esté activo)
create function public.tutor_de_equipo(eid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tutores t
                 join public.jugadores j on j.id = t.jugador_id
                 where t.user_id = auth.uid() and j.equipo_id = eid and j.estado = 'activo');
$$;

-- Personal (director o entrenador del equipo) con acceso a este jugador
create function public.puede_jugador(jid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.jugadores j
                 where j.id = jid
                   and ( public.es_director(j.academia_id)
                         or (j.equipo_id is not null and public.puede_equipo(j.equipo_id)) ));
$$;

create function public.puede_partido(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.partidos p
                 where p.id = pid and public.puede_equipo(p.equipo_id));
$$;

create function public.puede_evaluacion(evid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.evaluaciones e
                 where e.id = evid and public.puede_equipo(e.equipo_id));
$$;

-- ---------------------------------------------------------------------
-- 3) SEGURIDAD POR FILA (RLS)
-- ---------------------------------------------------------------------

alter table public.academias             enable row level security;
alter table public.miembros              enable row level security;
alter table public.equipos               enable row level security;
alter table public.equipo_entrenadores   enable row level security;
alter table public.jugadores             enable row level security;
alter table public.tutores               enable row level security;
alter table public.consentimientos       enable row level security;
alter table public.partidos              enable row level security;
alter table public.partido_stats         enable row level security;
alter table public.entrenos              enable row level security;
alter table public.ejercicios            enable row level security;
alter table public.evaluaciones          enable row level security;
alter table public.evaluacion_resultados enable row level security;
alter table public.invitaciones          enable row level security;
alter table public.audit_log             enable row level security;

-- Academias: se crean con crear_academia(); solo el director las edita
create policy academias_select on public.academias for select to authenticated
  using (public.es_miembro(id) or public.es_tutor_en(id));
create policy academias_update on public.academias for update to authenticated
  using (public.es_director(id)) with check (public.es_director(id));

-- Miembros: los ve el personal de la academia; los administra el director
create policy miembros_select on public.miembros for select to authenticated
  using (public.es_miembro(academia_id));
create policy miembros_insert on public.miembros for insert to authenticated
  with check (public.es_director(academia_id));
create policy miembros_update on public.miembros for update to authenticated
  using (public.es_director(academia_id)) with check (public.es_director(academia_id));
create policy miembros_delete on public.miembros for delete to authenticated
  using (public.es_director(academia_id));

-- Equipos
-- (es_director(academia_id) va primero para que un equipo recién creado sea visible en el mismo INSERT ... RETURNING)
create policy equipos_select on public.equipos for select to authenticated
  using (public.es_director(academia_id) or public.puede_equipo(id) or public.tutor_de_equipo(id));
create policy equipos_insert on public.equipos for insert to authenticated
  with check (public.es_director(academia_id));
create policy equipos_update on public.equipos for update to authenticated
  using (public.puede_equipo(id)) with check (public.puede_equipo(id));
create policy equipos_delete on public.equipos for delete to authenticated
  using (public.es_director(academia_id));

create policy eqent_select on public.equipo_entrenadores for select to authenticated
  using (public.es_director(academia_id) or user_id = auth.uid());
create policy eqent_insert on public.equipo_entrenadores for insert to authenticated
  with check (public.es_director(academia_id));
create policy eqent_delete on public.equipo_entrenadores for delete to authenticated
  using (public.es_director(academia_id));

-- Jugadores: personal con acceso al equipo (o director) y el tutor de ese jugador
create policy jugadores_select on public.jugadores for select to authenticated
  using ( public.es_director(academia_id)
          or (equipo_id is not null and public.puede_equipo(equipo_id))
          or public.es_tutor_de(id) );
create policy jugadores_insert on public.jugadores for insert to authenticated
  with check ( public.es_director(academia_id)
               or (equipo_id is not null and public.puede_equipo(equipo_id)) );
create policy jugadores_update on public.jugadores for update to authenticated
  using ( public.es_director(academia_id)
          or (equipo_id is not null and public.puede_equipo(equipo_id)) )
  with check ( public.es_director(academia_id)
               or (equipo_id is not null and public.puede_equipo(equipo_id)) );
create policy jugadores_delete on public.jugadores for delete to authenticated
  using (public.es_director(academia_id));

-- Tutores y consentimientos
create policy tutores_select on public.tutores for select to authenticated
  using (user_id = auth.uid() or public.puede_jugador(jugador_id));
create policy tutores_delete on public.tutores for delete to authenticated
  using (public.es_director(academia_id));

create policy consent_select on public.consentimientos for select to authenticated
  using (public.puede_jugador(jugador_id) or public.es_tutor_de(jugador_id));
create policy consent_insert on public.consentimientos for insert to authenticated
  with check (public.puede_jugador(jugador_id));

-- Partidos y estadísticas
create policy partidos_select on public.partidos for select to authenticated
  using (public.puede_equipo(equipo_id) or public.tutor_de_equipo(equipo_id));
create policy partidos_insert on public.partidos for insert to authenticated
  with check (public.puede_equipo(equipo_id));
create policy partidos_update on public.partidos for update to authenticated
  using (public.puede_equipo(equipo_id)) with check (public.puede_equipo(equipo_id));
create policy partidos_delete on public.partidos for delete to authenticated
  using (public.puede_equipo(equipo_id));

create policy pstats_select on public.partido_stats for select to authenticated
  using (public.puede_partido(partido_id) or public.es_tutor_de(jugador_id));
create policy pstats_insert on public.partido_stats for insert to authenticated
  with check (public.puede_partido(partido_id));
create policy pstats_update on public.partido_stats for update to authenticated
  using (public.puede_partido(partido_id)) with check (public.puede_partido(partido_id));
create policy pstats_delete on public.partido_stats for delete to authenticated
  using (public.puede_partido(partido_id));

-- Entrenamientos
create policy entrenos_select on public.entrenos for select to authenticated
  using (public.puede_equipo(equipo_id) or public.tutor_de_equipo(equipo_id));
create policy entrenos_insert on public.entrenos for insert to authenticated
  with check (public.puede_equipo(equipo_id));
create policy entrenos_update on public.entrenos for update to authenticated
  using (public.puede_equipo(equipo_id)) with check (public.puede_equipo(equipo_id));
create policy entrenos_delete on public.entrenos for delete to authenticated
  using (public.puede_equipo(equipo_id));

-- Ejercicios y evaluaciones
create policy ejercicios_select on public.ejercicios for select to authenticated
  using (public.puede_equipo(equipo_id) or public.tutor_de_equipo(equipo_id));
create policy ejercicios_insert on public.ejercicios for insert to authenticated
  with check (public.puede_equipo(equipo_id));
create policy ejercicios_update on public.ejercicios for update to authenticated
  using (public.puede_equipo(equipo_id)) with check (public.puede_equipo(equipo_id));
create policy ejercicios_delete on public.ejercicios for delete to authenticated
  using (public.puede_equipo(equipo_id));

create policy eval_select on public.evaluaciones for select to authenticated
  using (public.puede_equipo(equipo_id) or public.tutor_de_equipo(equipo_id));
create policy eval_insert on public.evaluaciones for insert to authenticated
  with check (public.puede_equipo(equipo_id));
create policy eval_update on public.evaluaciones for update to authenticated
  using (public.puede_equipo(equipo_id)) with check (public.puede_equipo(equipo_id));
create policy eval_delete on public.evaluaciones for delete to authenticated
  using (public.puede_equipo(equipo_id));

create policy evres_select on public.evaluacion_resultados for select to authenticated
  using (public.puede_evaluacion(evaluacion_id) or public.es_tutor_de(jugador_id));
create policy evres_insert on public.evaluacion_resultados for insert to authenticated
  with check (public.puede_evaluacion(evaluacion_id));
create policy evres_update on public.evaluacion_resultados for update to authenticated
  using (public.puede_evaluacion(evaluacion_id)) with check (public.puede_evaluacion(evaluacion_id));
create policy evres_delete on public.evaluacion_resultados for delete to authenticated
  using (public.puede_evaluacion(evaluacion_id));

-- Invitaciones: se crean/canjean solo con las funciones de abajo
create policy invit_select on public.invitaciones for select to authenticated
  using (public.es_director(academia_id) or creada_por = auth.uid());
create policy invit_delete on public.invitaciones for delete to authenticated
  using (public.es_director(academia_id) or creada_por = auth.uid());

-- Bitácora: solo la lee el director; nadie la escribe a mano
create policy audit_select on public.audit_log for select to authenticated
  using (academia_id is not null and public.es_director(academia_id));

-- ---------------------------------------------------------------------
-- 4) FUNCIONES QUE LA APP LLAMA (RPC)
-- ---------------------------------------------------------------------

-- Crear academia: quien la crea queda como director
create table public.codigos_alta (
  codigo      text primary key,
  nota        text,
  creado_en   timestamptz not null default now(),
  expira_en   timestamptz not null default now() + interval '30 days',
  usado_por   uuid,
  usado_en    timestamptz,
  academia_id uuid references public.academias(id) on delete set null
);
alter table public.codigos_alta enable row level security;
revoke all on public.codigos_alta from anon, authenticated;

create function public.nuevo_codigo_alta(p_nota text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  v := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  insert into public.codigos_alta (codigo, nota) values (v, p_nota);
  return v;
end $$;

create function public.crear_academia(p_nombre text, p_codigo text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_mail text; v_cod public.codigos_alta%rowtype;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
  select * into v_cod from public.codigos_alta
    where codigo = upper(trim(coalesce(p_codigo, ''))) and usado_en is null and expira_en > now()
    for update;
  if not found then raise exception 'Código de alta inválido o vencido'; end if;
  select email into v_mail from auth.users where id = auth.uid();
  insert into public.academias (nombre, creada_por) values (trim(p_nombre), auth.uid())
    returning id into v_id;
  insert into public.miembros (academia_id, user_id, rol, nombre) values (v_id, auth.uid(), 'director', v_mail);
  update public.codigos_alta set usado_por = auth.uid(), usado_en = now(), academia_id = v_id
    where codigo = v_cod.codigo;
  return v_id;
end $$;

-- Invitar a un entrenador (director) o a un padre ligado a un jugador (personal con acceso)
create function public.crear_invitacion(
  p_tipo text, p_academia uuid default null, p_equipo uuid default null, p_jugador uuid default null
) returns text
language plpgsql security definer set search_path = '' as $$
declare v_codigo text; v_aid uuid;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
  if p_tipo = 'entrenador' then
    v_aid := p_academia;
    if v_aid is null or not public.es_director(v_aid) then
      raise exception 'Solo el director puede invitar entrenadores';
    end if;
    if p_equipo is not null and not exists
       (select 1 from public.equipos where id = p_equipo and academia_id = v_aid) then
      raise exception 'Equipo inválido';
    end if;
  elsif p_tipo = 'padre' then
    if p_jugador is null or not public.puede_jugador(p_jugador) then
      raise exception 'No tienes acceso a ese jugador';
    end if;
    select academia_id into v_aid from public.jugadores where id = p_jugador;
    p_equipo := null;
  else
    raise exception 'Tipo de invitación inválido';
  end if;
  v_codigo := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  insert into public.invitaciones (codigo, academia_id, tipo, equipo_id, jugador_id, creada_por)
    values (v_codigo, v_aid, p_tipo, p_equipo, p_jugador, auth.uid());
  return v_codigo;
end $$;

-- Canjear el código recibido (entrenador o padre)
create function public.canjear_invitacion(p_codigo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.invitaciones%rowtype; v_mail text;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
  select * into v from public.invitaciones
    where codigo = upper(trim(p_codigo)) and usada_en is null and expira_en > now()
    for update;
  if not found then raise exception 'Código inválido o vencido'; end if;
  select email into v_mail from auth.users where id = auth.uid();

  if v.tipo = 'entrenador' then
    insert into public.miembros (academia_id, user_id, rol, nombre)
      values (v.academia_id, auth.uid(), 'entrenador', v_mail) on conflict do nothing;
    if v.equipo_id is not null then
      insert into public.equipo_entrenadores (equipo_id, user_id, academia_id)
        values (v.equipo_id, auth.uid(), v.academia_id) on conflict do nothing;
    end if;
  else
    insert into public.tutores (user_id, jugador_id, academia_id)
      values (auth.uid(), v.jugador_id, v.academia_id) on conflict do nothing;
  end if;

  update public.invitaciones set usada_por = auth.uid(), usada_en = now() where codigo = v.codigo;
  return jsonb_build_object('tipo', v.tipo, 'academia_id', v.academia_id);
end $$;

-- Ficha completa de un jugador (derecho de acceso / cambio de academia)
create function public.exportar_ficha(p_jugador uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  if not (public.puede_jugador(p_jugador) or public.es_tutor_de(p_jugador)) then
    raise exception 'Sin acceso a este jugador';
  end if;
  select jsonb_build_object(
    'app', 'MiDT', 'tipo', 'ficha_jugador', 'version', 1, 'exportada_en', now(),
    'academia', (select a.nombre from public.academias a where a.id = j.academia_id),
    'jugador', jsonb_build_object('nombre', j.nombre, 'anio_nacimiento', j.anio_nacimiento,
                                  'posicion', j.posicion, 'estado', j.estado),
    'partidos', coalesce((
      select jsonb_agg(jsonb_build_object('fecha', p.fecha, 'rival', p.rival,
               'favor', p.favor, 'contra', p.contra, 'jugo', s.jugo, 'goles', s.goles,
               'minutos_goles', s.minutos_goles, 'asist', s.asist, 'minutos', s.minutos,
               'duelos', s.duelos, 'amarilla', s.amarilla, 'roja', s.roja) order by p.fecha)
      from public.partido_stats s join public.partidos p on p.id = s.partido_id
      where s.jugador_id = j.id), '[]'::jsonb),
    'evaluaciones', coalesce((
      select jsonb_agg(jsonb_build_object('fecha', e.fecha, 'ejercicio', x.nombre,
               'tipo', x.tipo, 'unidad', x.unidad, 'valor', r2.valor) order by e.fecha)
      from public.evaluacion_resultados r2
      join public.evaluaciones e on e.id = r2.evaluacion_id
      join public.ejercicios x on x.id = e.ejercicio_id
      where r2.jugador_id = j.id), '[]'::jsonb)
  ) into r
  from public.jugadores j where j.id = p_jugador;
  return r;
end $$;

-- El padre puede corregir el teléfono de contacto de su hijo
create function public.actualizar_contacto_tutor(p_jugador uuid, p_tel text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_tutor_de(p_jugador) then raise exception 'Sin acceso a este jugador'; end if;
  update public.jugadores set tel_tutor = regexp_replace(coalesce(p_tel, ''), '\D', '', 'g')
    where id = p_jugador;
end $$;

-- Borrado de datos personales conservando las estadísticas del equipo (anonimizar)
create function public.anonimizar_jugador(p_jugador uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_aid uuid;
begin
  select academia_id into v_aid from public.jugadores where id = p_jugador;
  if v_aid is null or not public.es_director(v_aid) then
    raise exception 'Solo el director puede anonimizar';
  end if;
  update public.jugadores set
    nombre = 'Jugador ' || left(id::text, 6), tel_tutor = null, anio_nacimiento = null,
    dia_cumple = null, mes_cumple = null, estado = 'baja',
    baja_fecha = coalesce(baja_fecha, current_date),
    baja_motivo = coalesce(baja_motivo, 'Datos personales eliminados')
  where id = p_jugador;
  delete from public.tutores where jugador_id = p_jugador;
  delete from public.consentimientos where jugador_id = p_jugador;
  insert into public.audit_log (academia_id, user_id, accion, tabla, registro_id)
    values (v_aid, auth.uid(), 'ANONIMIZAR', 'jugadores', p_jugador);
end $$;

-- ---------------------------------------------------------------------
-- 5) TRIGGERS: bitácora y protección del último director
-- ---------------------------------------------------------------------

create function public.registrar_auditoria() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_row jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_log (academia_id, user_id, accion, tabla, registro_id)
    values ((v_row->>'academia_id')::uuid, auth.uid(), tg_op, tg_table_name,
            (v_row->>'id')::uuid);
  return coalesce(new, old);
end $$;

create trigger auditar_jugadores after insert or update or delete on public.jugadores
  for each row execute function public.registrar_auditoria();
create trigger auditar_consentimientos after insert or delete on public.consentimientos
  for each row execute function public.registrar_auditoria();

create function public.proteger_ultimo_director() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.rol = 'director'
     and (tg_op = 'DELETE' or new.rol <> 'director')
     and not exists (select 1 from public.miembros m
                     where m.academia_id = old.academia_id and m.rol = 'director'
                       and m.user_id <> old.user_id)
     and exists (select 1 from public.academias a where a.id = old.academia_id) then
    raise exception 'La academia debe conservar al menos un director';
  end if;
  return coalesce(new, old);
end $$;

create trigger proteger_director before update or delete on public.miembros
  for each row execute function public.proteger_ultimo_director();

-- 1) Los entrenos necesitan la llave compuesta (id, academia_id), como el resto de las tablas
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'entrenos_id_academia_key') then
    alter table public.entrenos add constraint entrenos_id_academia_key unique (id, academia_id);
  end if;
end $$;

-- 2) Tabla de asistencia: una fila por jugador y entreno
create table if not exists public.asistencias (
  id          uuid primary key default gen_random_uuid(),
  academia_id uuid not null,
  entreno_id  uuid not null,
  jugador_id  uuid not null,
  asistio     boolean not null default true,
  unique (entreno_id, jugador_id),
  foreign key (entreno_id, academia_id) references public.entrenos(id, academia_id)  on delete cascade,
  foreign key (jugador_id, academia_id) references public.jugadores(id, academia_id) on delete cascade
);
create index if not exists asistencias_jugador_idx on public.asistencias(jugador_id);
create index if not exists asistencias_entreno_idx on public.asistencias(entreno_id);
alter table public.asistencias enable row level security;
revoke all on public.asistencias from anon;
grant select, insert, update, delete on public.asistencias to authenticated;

-- 3) Funciones de apoyo para las reglas de seguridad
create or replace function public.puede_entreno(eid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.entrenos e where e.id = eid and public.puede_equipo(e.equipo_id));
$$;

-- el jugador debe ser del mismo equipo que el entreno
create or replace function public.jugador_en_entreno(eid uuid, jid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.entrenos e join public.jugadores j on j.equipo_id = e.equipo_id
                 where e.id = eid and j.id = jid);
$$;
revoke execute on function public.puede_entreno(uuid) from public, anon;
revoke execute on function public.jugador_en_entreno(uuid, uuid) from public, anon;
grant  execute on function public.puede_entreno(uuid) to authenticated;
grant  execute on function public.jugador_en_entreno(uuid, uuid) to authenticated;

-- 4) Reglas: el personal del equipo escribe y lee; cada padre lee solo la asistencia de su hijo
drop policy if exists asist_select on public.asistencias;
drop policy if exists asist_insert on public.asistencias;
drop policy if exists asist_update on public.asistencias;
drop policy if exists asist_delete on public.asistencias;
create policy asist_select on public.asistencias for select to authenticated
  using (public.puede_entreno(entreno_id) or public.es_tutor_de(jugador_id));
create policy asist_insert on public.asistencias for insert to authenticated
  with check (public.puede_entreno(entreno_id) and public.jugador_en_entreno(entreno_id, jugador_id));
create policy asist_update on public.asistencias for update to authenticated
  using (public.puede_entreno(entreno_id))
  with check (public.puede_entreno(entreno_id) and public.jugador_en_entreno(entreno_id, jugador_id));
create policy asist_delete on public.asistencias for delete to authenticated
  using (public.puede_entreno(entreno_id));

-- 5) La ficha descargable ahora incluye la asistencia
create or replace function public.exportar_ficha(p_jugador uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  if not (public.puede_jugador(p_jugador) or public.es_tutor_de(p_jugador)) then
    raise exception 'Sin acceso a este jugador';
  end if;
  select jsonb_build_object(
    'app', 'MiDT', 'tipo', 'ficha_jugador', 'version', 1, 'exportada_en', now(),
    'academia', (select a.nombre from public.academias a where a.id = j.academia_id),
    'jugador', jsonb_build_object('nombre', j.nombre, 'anio_nacimiento', j.anio_nacimiento,
                                  'posicion', j.posicion, 'estado', j.estado),
    'partidos', coalesce((
      select jsonb_agg(jsonb_build_object('fecha', p.fecha, 'rival', p.rival,
               'favor', p.favor, 'contra', p.contra, 'jugo', s.jugo, 'goles', s.goles,
               'minutos_goles', s.minutos_goles, 'asist', s.asist, 'minutos', s.minutos,
               'duelos', s.duelos, 'amarilla', s.amarilla, 'roja', s.roja) order by p.fecha)
      from public.partido_stats s join public.partidos p on p.id = s.partido_id
      where s.jugador_id = j.id), '[]'::jsonb),
    'evaluaciones', coalesce((
      select jsonb_agg(jsonb_build_object('fecha', e.fecha, 'ejercicio', x.nombre,
               'tipo', x.tipo, 'unidad', x.unidad, 'valor', r2.valor) order by e.fecha)
      from public.evaluacion_resultados r2
      join public.evaluaciones e on e.id = r2.evaluacion_id
      join public.ejercicios x on x.id = e.ejercicio_id
      where r2.jugador_id = j.id), '[]'::jsonb),
    'asistencias', coalesce((
      select jsonb_agg(jsonb_build_object('fecha', en.fecha, 'asistio', a.asistio) order by en.fecha)
      from public.asistencias a join public.entrenos en on en.id = a.entreno_id
      where a.jugador_id = j.id), '[]'::jsonb)
  ) into r
  from public.jugadores j where j.id = p_jugador;
  return r;
end $$;

-- ---------------------------------------------------------------------
-- 6) PERMISOS DE LAS FUNCIONES Y DE LOS ROLES DE SUPABASE
--    La clave pública (anon) no puede leer ni ejecutar nada de la app.
-- ---------------------------------------------------------------------

revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon, public;

grant execute on all functions in schema public to authenticated;
-- Los triggers no se llaman desde la app:
revoke execute on function public.registrar_auditoria()      from authenticated;
revoke execute on function public.proteger_ultimo_director() from authenticated;
revoke execute on function public.nuevo_codigo_alta(text)      from authenticated;

-- Lo que se cree después tampoco queda abierto a anon
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on functions from anon;
-- (fin del esquema)
