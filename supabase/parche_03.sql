-- PARCHE 03 — asistencia a entrenamientos.
-- Ejecutar UNA vez (después de los parches 01 y 02). Se puede repetir sin problema.

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
