# MiDT en la nube — guía de configuración (Supabase)

Tiempo aproximado: 20–30 minutos. Solo se hace una vez.

## 1. Crear el proyecto

1. Entra a https://supabase.com y crea una cuenta (usa un correo que revises y activa verificación en dos pasos).
2. **New project** → elige tu organización.
3. Datos del proyecto:
   - **Name:** `midt`
   - **Database password:** genera una larga y guárdala en un gestor de contraseñas. **No me la pases.**
   - **Region:** elige la más cercana a México disponible en la lista (normalmente una de EE. UU.). Para tus datos esto es relevante: pregúntale a tu abogado si el aviso de privacidad debe mencionar que los datos se almacenan fuera de México.
4. Espera a que termine de crearse (1–2 min).

## 2. Cargar el esquema

1. Menú izquierdo → **SQL Editor** → **New query**.
2. Abre `supabase/schema.sql`, copia **todo** su contenido, pégalo y pulsa **Run**.
3. Debe terminar con "Success. No rows returned". Si sale un error, mándame el texto completo del error.
4. Verifica en **Table Editor** que aparecen 15 tablas y que todas dicen *RLS enabled*.

> El esquema se ejecuta **una sola vez**. Si necesitas rehacerlo desde cero, dímelo y te paso un script de reinicio.

## 3. Activar el inicio de sesión

1. **Authentication → Providers → Email**: déjalo activo y **mantén "Confirm email" activado** (así nadie se registra con un correo ajeno).
2. **Authentication → URL Configuration**: en *Site URL* pondrás la dirección donde publiques la app (paso 5). Por ahora déjalo y vuelves después.
3. (Recomendado) **Authentication → Providers → Google** si quieres que entren con su cuenta de Google. Requiere crear credenciales en Google Cloud; lo vemos después si lo quieres.

## 4. Copiar los datos que necesito (públicos)

**Project Settings → API**. Pásame solo estos dos:

- **Project URL** (algo como `https://abcdxyz.supabase.co`)
- **anon / publishable key** (la clave *pública*)

**Nunca me pases ni pegues en la app**: la `service_role` (o *secret key*), la contraseña de la base de datos, ni ningún token de acceso. Esas claves se saltan toda la seguridad.
La clave `anon` sí puede ir dentro de la app: no da acceso a nada por sí sola porque cada tabla exige una sesión iniciada y pasa por las reglas de seguridad.

## 5. Dónde publicar la app

Supabase guarda los datos; la página `index.html` va en un hosting estático con HTTPS. Opciones gratuitas: **Cloudflare Pages**, **Netlify** o **GitHub Pages**. Cualquiera funciona; dime cuál prefieres (o si ya usas uno en tus otros sitios) y te indico los pasos exactos.
Cuando tengas el enlace, vuelve al paso 3.2 y ponlo en *Site URL*.

## 6. Antes de capturar datos reales de niños

- [ ] **Plan de pago (Pro)**: el plan gratuito no incluye respaldos diarios y los proyectos inactivos se pausan. Verifica las condiciones actuales en la página de precios de Supabase; para datos de menores yo no trabajaría sin respaldos.
- [ ] Verificación en dos pasos en tu cuenta de Supabase y en la cuenta del director.
- [ ] Aviso de privacidad revisado por un abogado (borrador en `docs/aviso-privacidad-borrador.md`).
- [ ] Probar con datos falsos: una cuenta de director, una de entrenador y una de padre.
- [ ] Descargar un respaldo propio (botón exportar) antes de migrar tus datos actuales.

## 7. Qué sigue (lo hago yo cuando me pases URL y clave)

1. Pantalla de inicio de sesión y selección de academia.
2. La app lee y guarda en Supabase en lugar de `localStorage` (con copia local temporal si se va la señal).
3. Importar tu respaldo JSON actual a la nube.
4. Vista para padres (solo su hijo) y registro con código.
5. Baja y transferencia de ficha entre academias.
