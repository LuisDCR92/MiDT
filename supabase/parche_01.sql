-- PARCHE 01 — guarda el correo en "miembros.nombre" para que el director identifique a sus entrenadores.
-- Solo reemplaza dos funciones; no toca datos ni tablas. Se puede ejecutar más de una vez.

create or replace function public.crear_academia(p_nombre text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_mail text;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
  select email into v_mail from auth.users where id = auth.uid();
  insert into public.academias (nombre, creada_por) values (trim(p_nombre), auth.uid())
    returning id into v_id;
  insert into public.miembros (academia_id, user_id, rol, nombre) values (v_id, auth.uid(), 'director', v_mail);
  return v_id;
end $$;

create or replace function public.canjear_invitacion(p_codigo text) returns jsonb
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
