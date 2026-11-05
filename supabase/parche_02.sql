-- PARCHE 02 — la creación de academias ahora exige un código de alta emitido por el administrador de MiDT.
-- Ejecutar UNA vez (después del parche 01). Las academias que ya existen no cambian.

-- 1) Códigos de alta: nadie los puede leer ni escribir desde la app (RLS activo y sin políticas)
create table if not exists public.codigos_alta (
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

-- 2) Emitir un código: solo desde el SQL Editor del administrador (la app no puede llamarla)
create or replace function public.nuevo_codigo_alta(p_nota text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  v := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  insert into public.codigos_alta (codigo, nota) values (v, p_nota);
  return v;
end $$;
revoke execute on function public.nuevo_codigo_alta(text) from public, anon, authenticated;

-- 3) Crear academia: reemplaza la versión sin código (que se elimina para que no sirva de atajo)
drop function if exists public.crear_academia(text);

create or replace function public.crear_academia(p_nombre text, p_codigo text) returns uuid
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
revoke execute on function public.crear_academia(text, text) from public, anon;
grant  execute on function public.crear_academia(text, text) to authenticated;

-- Para emitir un código (ejemplo, ejecútalo tú en el SQL Editor):
--   select public.nuevo_codigo_alta('Academia Águilas');
