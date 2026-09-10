/**
 * Utilidades de seguridad para el manejo de contraseñas (port de
 * `tienda.util.PasswordUtils` de Java a Web Crypto API).
 *
 * Nunca se almacena la contraseña en texto plano: se genera un valor
 * aleatorio (salt) por usuario y se guarda un hash derivado con PBKDF2
 * sobre `contraseña + salt`. El formato es versionado:
 *
 *   `pbkdf2$<iteraciones>$<hashHex>`   (nuevo, PBKDF2-HMAC-SHA-256)
 *
 * Los hashes legacy (64 caracteres hex = SHA-256 de `contraseña + salt`,
 * compatible con la versión de escritorio) se siguen aceptando en la
 * verificación y se re-hashan con PBKDF2 la primera vez que el usuario
 * inicia sesión (mejora progresiva).
 */

/** Longitud mínima aceptada para una contraseña. */
export const LONGITUD_MINIMA_CONTRASENA = 6

/** Iteraciones de PBKDF2 (HMAC-SHA-256) para hashes nuevos. */
export const ITERACIONES_PBKDF2 = 210_000

/** Prefijo que identifica a un hash derivado con PBKDF2. */
export const PREFIJO_PBKDF2 = 'pbkdf2$'

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

/** Deriva `longitudBits` bits PBKDF2-HMAC-SHA-256 con contraseña y salt dados. */
async function derivarPbkdf2(
  contrasena: string,
  salt: string,
  iteraciones: number,
): Promise<Uint8Array> {
  const clave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(contrasena),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const material = (contrasena ?? '') + (salt ?? '')
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: iteraciones,
      salt: new TextEncoder().encode(material),
    },
    clave,
    256,
  )
  return new Uint8Array(bits)
}

/** Calcula un hash de contraseña nuevo (PBKDF2-HMAC-SHA-256). */
export async function hashContrasena(contrasena: string, salt: string): Promise<string> {
  const derivado = await derivarPbkdf2(contrasena, salt, ITERACIONES_PBKDF2)
  return `${PREFIJO_PBKDF2}${ITERACIONES_PBKDF2}$${aHex(derivado)}`
}

/** Calcula el hash legacy SHA-256 (solo para verificar contraseñas antiguas). */
async function hashLegacySha256(contrasena: string, salt: string): Promise<string> {
  const material = (contrasena ?? '') + (salt ?? '')
  const data = new TextEncoder().encode(material)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return aHex(new Uint8Array(hash))
}

/** Indica si el hash guardado aún usa el esquema antiguo (SHA-256 plano). */
export function esHashMigrable(hashGuardado: string | undefined | null): boolean {
  return !hashGuardado || !hashGuardado.startsWith(PREFIJO_PBKDF2)
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
  if (hashGuardado.startsWith(PREFIJO_PBKDF2)) {
    const [, iteracionesTexto, hashHex] = hashGuardado.split('$')
    const iteraciones = Number(iteracionesTexto)
    if (!Number.isInteger(iteraciones) || iteraciones <= 0 || !hashHex) {
      return false
    }
    const derivado = await derivarPbkdf2(contrasena, salt, iteraciones)
    return aHex(derivado) === hashHex.toLowerCase()
  }
  return (await hashLegacySha256(contrasena, salt)) === hashGuardado.toLowerCase()
}

/** Valida la longitud mínima de una contraseña nueva. */
export function contrasenaValida(contrasena: string): boolean {
  return !!contrasena && contrasena.length >= LONGITUD_MINIMA_CONTRASENA
}