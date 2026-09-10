/**
 * Valor marcador de "dispositivo" de los registros locales que no deben subirse
 * a la nube (p. ej. el administrador sembrado en versiones anteriores). Detecta
 * que el registro es local: no se encola ni se sube, incluso si el administrador
 * usa "Subir todo a la nube".
 */
export const DISPOSITIVO_SEMILLA = 'semilla-local'