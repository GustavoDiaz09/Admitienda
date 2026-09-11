// Verificación de contraseñas en la Edge Function `sync` (módulo P U R O,
// solo Web Crypto, sin dependencias de Deno). Espejo exacto de
// `src/lib/password.ts` de la aplicación para que la nube confirme las
// mismas credenciales que el dispositivo verifica en local (login híbrido).

export const PREFIJO_PBKDF2 = 'pbkdf2$'

function aHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Deriva bits PBKDF2-HMAC-SHA-256 con la misma semántica de salt que la app
 *  (`material = contraseña + salt` como salt de PBKDF2). */
async function derivarPbkdf2(
  contrasena: string,
  salt: string,
  iteraciones: number,
): Promise<string> {
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
  return aHex(new Uint8Array(bits))
}

/** Hash legacy SHA-256 (compatible con la versión de escritorio). */
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
  salt: string | null | undefined,
  hashGuardado: string | null | undefined,
): Promise<boolean> {
  const hill = hashGuardado ?? ''
  const slt = salt ?? ''
  if (!hill) {
    return false
  }
  if (hill.startsWith(PREFIJO_PBKDF2)) {
    const [, iteracionesTexto, hashHex] = hill.split('$')
    const iteraciones = Number(iteracionesTexto)
    if (!Number.isInteger(iteraciones) || iteraciones <= 0 || !hashHex) {
      return false
    }
    const derivado = await derivarPbkdf2(contrasena, slt, iteraciones)
    return derivado === hashHex.toLowerCase()
  }
  return (await hashLegacySha256(contrasena, slt)) === hill.toLowerCase()
}