# Publicar MiDT con la nube — pasos

## 1. Una vez, en Supabase (SQL Editor)
1. Pega y ejecuta **`supabase/parche_01.sql`** (Run). Debe decir "Success".
2. **Authentication → URL Configuration**: pon en *Site URL* la dirección donde publiques la app (paso 2) y agrégala también en *Redirect URLs*.

## 2. Publicar los archivos
Sube **la carpeta `MiDT`** completa (index.html, config.js, cloud.js, sw.js, manifest.json, aviso-privacidad.html, icons/) a un hosting estático con HTTPS:
- **Cloudflare Pages** → *Create project → Direct upload* → arrastra la carpeta. (Recomendado: gratis, rápido, sin configuración.)
- Netlify (*Deploy manually*, arrastrar carpeta) o GitHub Pages también sirven.
No hay nada secreto en esos archivos: la clave de `config.js` es la pública y solo funciona junto con las reglas de seguridad ya cargadas.

Opcional: en `config.js` escribe tu dirección en `APP_URL` (con `/` al final) para que los enlaces de los correos vuelvan a la app.

## 3. Primera prueba (con datos FALSOS)
1. Abre la dirección → "Probar conexión" (debe decir que la base responde y está protegida).
2. Crea cuenta de director (con tu correo, confirma el correo) → crea la academia → crea un equipo → agrega un jugador de prueba.
3. Con otro correo: invita a un entrenador desde Ajustes y canjea el código. Debe ver solo su equipo y no poder crear equipos.
4. Con un tercer correo: invita a una familia con 👪 y canjea el código. Debe ver solo a ese jugador.
5. Apaga el internet del teléfono, registra un dato, vuelve a prender: debe subir solo.

## 4. Antes de capturar niños reales
- [ ] Aviso de privacidad revisado por un abogado y completado (`aviso-privacidad.html`; cambia `AVISO_VERSION` en `config.js` al publicar la versión final).
- [ ] Plan Pro de Supabase (respaldos diarios; el gratuito pausa proyectos inactivos y no respalda).
- [ ] Verificación en dos pasos en tu cuenta de Supabase y en las de los directores.
- [ ] Descargar un respaldo propio antes de migrar tus datos viejos.
- [ ] Ojo: hoy **cualquier persona con cuenta puede crear su propia academia vacía**. No ve datos de otros, pero si quieres cerrar eso antes de abrir al público, avísame y lo limitamos.

---
## Actualización 9.1 (cuadros propios, códigos de alta, asistencia)
1. En Supabase → SQL Editor, ejecuta **`parche_02.sql`** y después **`parche_03.sql`** (uno por uno, Run). Se pueden repetir sin problema.
2. Vuelve a subir `MiDT_publicar.zip` a Cloudflare (mismo proyecto).
3. Para **dar de alta una academia nueva** necesitas un código: en el SQL Editor ejecuta `select public.nuevo_codigo_alta('Nombre de la academia');` y manda el código que devuelve (vence en 30 días y sirve una sola vez). El director lo escribe al crear su cuenta, en "Soy director".
4. Después de actualizar, recarga la app dos veces (la primera instala la versión nueva).
