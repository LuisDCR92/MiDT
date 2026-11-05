# MiDT

Panel PWA para entrenadores de soccer y academias: convocatorias por WhatsApp, entrenos y asistencia, plantilla, partidos y estadísticas, evaluaciones, gráficos y PDF. Roles: director, entrenador y padre/tutor. Backend en Supabase; hospedaje estático en Cloudflare.

## Estructura
- `app/` — la aplicación (index.html, cloud.js, ui.js, config.js, sw.js, manifest, iconos, aviso de privacidad). Es lo que se publica.
- `supabase/` — `schema.sql` (esquema completo), `parche_01..03.sql` (para bases ya creadas) y `tests/` (pruebas de RLS contra Postgres).
- `pruebas/` — pruebas de interfaz con Playwright y un Supabase simulado (`python3 pruebas/run_tests.py`).
- `docs/` — guía de configuración, publicación y borrador del aviso de privacidad.
- `CAMBIOS.md` — historial de versiones.

## Seguridad
`app/config.js` solo contiene la URL y la clave *publishable* de Supabase (pública por diseño; la protección está en RLS). **Nunca** subas la `service_role` ni la contraseña de la base de datos.

## Publicar
Sube el contenido de `app/` a Cloudflare (ver `docs/PUBLICAR.md`).
