/**
 * Utilidades de seguridad para el manejo de contraseñas (port de
 * `tienda.util.PasswordUtils` de Java a Web Crypto API).
 *
 * Nunca se almacena la contraseña en texto plano: se genera un valor
 * aleatorio (salt) por usuario y se guarda el hash SHA-256 de
 * `contraseña + salt`. El algoritmo y el formato hexadecimal son
 * idénticos a los de la versión de escritorio, por lo que los hashes
 * generados en Java y en la web son intercambiables.
 */

/** Longitud mínima aceptada para una contraseña. */
export const LONGITUD_MINIMA_CONTRASENA = 6

/** Convierte un arreglo de bytes a su representación hexadecimal. */
function aHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Genera un salt aleatorio de 16 bytes codificado en hexadecimal. */
export function generarSalt(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return aHex(bytes)
}

/** Calcula el hash SHA-256 en hexadecimal de `contraseña + salt`. */
export async function hashContrasena(contrasena: string, salt: string): Promise<string> {
  const material = (contrasena ?? '') + (salt ?? '')
  const data = new TextEncoder().encode(material)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return aHex(new Uint8Array(hash))
}

/** Verifica si una contraseña en claro coincide con el hash guardado. */
export async function verificarContrasena(
  contrasena: string,
  salt: string,
  hashGuardado: string | undefined | null,
): Promise<boolean> {
  if (!hashGuardado) {
    return false
  }
  const hashCalculado = await hashContrasena(contrasena, salt)
  return hashGuardado === hashCalculado
}

/** Valida la longitud mínima de una contraseña nueva. */
export function contrasenaValida(contrasena: string): boolean {
  return !!contrasena && contrasena.length >= LONGITUD_MINIMA_CONTRASENA
}