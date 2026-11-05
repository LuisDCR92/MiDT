# MiDT – cambios de esta revisión

## Corregido
1. **Iconos**: el manifest pedía `icon-32/180/192/512/512-maskable.png` y los archivos se llamaban distinto; la app no podía instalarse con su icono. Se generaron iconos azules (los mismos del logo de la app) con los nombres correctos, incluido el maskable. Los naranjas originales quedaron en `icons/originales-naranja/`.
2. **Seguridad/estabilidad**: nombres, rivales, lugares y notas se insertaban en la pantalla sin escapar (un nombre con `<` o `&` rompía la vista; un respaldo manipulado podía inyectar código). Se añadió `esc()` en 31 puntos.
3. **WhatsApp**: los teléfonos de 10 dígitos no funcionaban con `wa.me` (falta el código de país). Nueva función `telWA()` agrega el 52 de México (cambia `CODIGO_PAIS` si hace falta) y limpia formatos 521…, 0052…, etc.
4. **Service worker (v2)**: antes era "caché primero" sin versión, por lo que las actualizaciones nunca llegaban al usuario. Ahora el HTML va por red primero, guarda las librerías externas (jsPDF, Chart.js, fuentes) para uso sin internet y cachea los iconos.
5. **Atajos del manifest** (`#partido`, `#stats`) no hacían nada; ahora abren esa pestaña.
6. **Fechas**: `toISOString()` (UTC) podía dar el día equivocado en recordatorios, respaldo y PDF; se usa fecha local. Formato de fecha en `es-MX`.
7. **Guardado**: `save()` avisa si el almacenamiento está lleno y se solicita almacenamiento persistente.
8. **Importar respaldo**: valida que cada equipo tenga `id` y `nombre`.

---
# Revisión 2

## Corregido
1. **Jugadores con id único.** Antes los datos de cada partido se ligaban a la *posición* del jugador en la lista (`goles-3`) y a su *nombre*. Si borrabas o reordenabas jugadores, o dos se llamaban igual, las estadísticas podían quedar con la persona equivocada. Ahora cada jugador tiene un `id` que no se reutiliza, y partidos y evaluaciones guardan `jugadorId`.
2. **Migración automática.** Los datos y respaldos anteriores se enlazan por nombre una sola vez al abrir la app o al importar; no hay que hacer nada.
3. **Envío por WhatsApp rehecho.** Ya no se abren todos los chats con temporizador (el navegador bloqueaba casi todos). Ahora aparece un panel con un botón por jugador y "Abrir siguiente"; cada envío queda marcado como enviado. Funciona igual para la convocatoria y para el aviso de entrenamiento, y avisa de teléfonos incompletos.
4. Service worker v3 (para que las instalaciones existentes reciban esta versión).

## Probado
En navegador (Chromium) con datos del formato anterior: migración, estadísticas tras borrar un jugador, edición de un partido viejo, guardado de evaluaciones, panel de envíos de partido y de entrenamiento. Sin errores de JavaScript.

---
# Revisión 3 — versión 9.0: datos en la nube (Supabase)

## Nuevo
1. **Inicio de sesión** (correo y contraseña, con confirmación de correo y "olvidé mi contraseña"). Sin sesión no se ve nada de la app.
2. **Roles**: director, entrenador (solo ve los equipos que se le asignan) y padre/madre (solo ve a su hijo/a). El director invita con un **código de un solo uso que vence en 7 días**; se manda por WhatsApp desde Ajustes (entrenadores) o con el botón 👪 del jugador (familias).
3. **Datos en la nube** en lugar de `localStorage`, con copia en el dispositivo: sin señal se sigue trabajando y los cambios suben solos al volver. Indicador de estado abajo a la derecha (Guardado / Sin conexión / Error).
4. **Una academia hoy, muchas mañana**: cada academia está aislada de las demás.
5. **Consentimiento del tutor** obligatorio al registrar un jugador (nombre, versión del aviso, fecha). Los jugadores migrados quedan marcados "falta consentimiento" con botón 📝 para registrarlo.
6. **Baja de jugadores** (📦) en lugar de borrar: conservan su historial; se pueden reactivar. El director puede además *borrar datos personales* (deja las estadísticas anónimas) o *eliminar todo*.
7. **Vista para padres**: resumen, partidos, próximos entrenos, evaluaciones, descarga de la ficha completa (JSON) y actualización de su teléfono.
8. **Migración**: los datos de la versión anterior guardados en el navegador se ofrecen para subirse a la nube (una sola vez). Importar un respaldo .json ahora *agrega* equipos nuevos; ya no reemplaza nada.
9. **aviso-privacidad.html**: borrador marcado como tal. **No usar con datos reales hasta que lo revise un abogado.**
10. Todos los ids son uuid (texto). Se quitó "Borrar todos los datos" (con la nube era demasiado peligroso).

## Cambios técnicos
- Archivos nuevos: `config.js` (URL y clave pública), `cloud.js`, `aviso-privacidad.html`. Service worker v4 (corrige que abrir el aviso sobrescribía la copia de `index.html`).
- `supabase/schema.sql` (ya ejecutado en tu proyecto) y **`supabase/parche_01.sql`** (nuevo, ejecutar una vez): guarda el correo de cada miembro para que el director sepa quién es quién.
- Editar un partido conserva los ids de estadísticas y las de jugadores dados de baja.

## Probado
- Base de datos: 89 comprobaciones de seguridad en un Postgres local (cada rol ve solo lo suyo; una academia no toca a otra; la clave pública no lee nada).
- Navegador (Chromium) con un servidor Supabase **simulado**: registro, academia, jugador con y sin consentimiento, sincronización, baja/reactivación, invitación de padre y de entrenador, vista de padre, entrenador sin permisos de equipo, trabajo sin conexión y subida posterior, recarga con sesión, cierre de sesión (26/26) y migración de datos antiguos (7/7).
- **No probado**: la conexión real a tu proyecto de Supabase (mi entorno no alcanza supabase.co). Por eso la pantalla de acceso trae "🔧 Probar conexión".

---
# Revisión 4 — versión 9.1

## Nuevo
1. **Cuadros propios** (`ui.js`) en lugar de los avisos, confirmaciones y preguntas del navegador, que los celulares suelen bloquear. Funcionan con Esc y Enter, los avisos se ponen en cola y nunca interpretan HTML.
2. **Alta de academias con código.** Ya no cualquiera con cuenta puede crear una academia: hace falta un *código de alta* de un solo uso (vence en 30 días) que emite el administrador de MiDT desde el SQL Editor de Supabase: `select public.nuevo_codigo_alta('Academia Águilas');`. Las academias que ya existen no cambian. *(parche_02.sql)*
3. **Asistencia a entrenos.** En Entrenos, botón 📋 Asistencia: se marca quién asistió (por defecto todos). La Plantilla muestra el % de cada jugador, el entreno muestra "asistieron/registrados", la ficha descargable la incluye y el padre ve el % de su hijo. Los jugadores dados de baja conservan su historial. *(parche_03.sql)*

## Orden para actualizar
Se puede hacer en cualquier orden: la app sigue funcionando aunque falte alguno de los parches (sin el 03 solo avisa que falta actualizar la base al abrir la asistencia). Lo único: sin el parche 02 la app nueva no puede crear academias, y con el parche 02 aplicado la app vieja tampoco.

## Probado
- Base de datos: **119 comprobaciones** de seguridad (antes 89), incluyendo códigos de alta (sin código, inventado, reutilizado, vencido, versión antigua eliminada, nadie puede emitirlos ni leerlos) y asistencia (cada rol ve y escribe solo lo suyo). También se probó aplicar los parches 02 y 03, repetidos, sobre una base con el esquema anterior.
- Navegador con servidor simulado: 26 + 7 + 11 + 4 + 14 pruebas (acceso y roles, migración, cuadros propios, códigos de alta, asistencia incluyendo el caso de base sin parche 03).
- Sigue sin probarse contra tu proyecto real de Supabase desde mi entorno.
