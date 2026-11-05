// Configuración pública de MiDT (la clave "publishable" está pensada para ir en el navegador:
// no da acceso a nada por sí sola; cada tabla exige sesión y pasa por las reglas de seguridad).
// NUNCA pegues aquí la clave "secret" ni "service_role".
const MIDT_CONFIG = {
  SUPABASE_URL: 'https://bhlbqqingkasumrzxxsh.supabase.co',
  SUPABASE_KEY: 'sb_publishable_aFbV8SOrbEQ6e30oN-iJsw_ZT8iipbX',
  // Dirección pública de la app (para los mensajes de invitación). Vacío = la dirección actual.
  APP_URL: '',
  // Versión del aviso de privacidad que se guarda junto al consentimiento del tutor
  AVISO_VERSION: 'v1-borrador'
};
