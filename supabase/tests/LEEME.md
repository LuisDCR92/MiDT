# Pruebas de seguridad (opcional)

`rls_test.py` ejecuta 119 comprobaciones contra un Postgres local: que cada rol vea solo lo suyo,
que una academia no pueda tocar otra, que la clave pública (anon) no lea nada, etc.
`shim_supabase.sql` imita lo que Supabase ya trae (auth.uid() y los roles anon/authenticated).
Necesita Postgres 15+ instalado localmente y `psql`. No es necesario correrlas para usar la app:
sirven para volver a validar la seguridad cada vez que se cambie el esquema.
