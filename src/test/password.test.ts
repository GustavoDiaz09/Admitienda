import { describe, expect, it } from 'vitest'
import {
  contrasenaValida,
  esHashMigrable,
  generarSalt,
  hashContrasena,
  ITERACIONES_PBKDF2,
  PREFIJO_PBKDF2,
  verificarContrasena,
} from '../lib/password'

function aHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(material: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material))
  return aHex(new Uint8Array(hash))
}

describe('Contraseñas', () => {
  it('genera hashes PBKDF2 versionados y válidos', async () => {
    const salt = generarSalt()
    const hash = await hashContrasena('clave123', salt)

    expect(hash.startsWith(PREFIJO_PBKDF2)).toBe(true)
    expect(hash.startsWith(`${PREFIJO_PBKDF2}${ITERACIONES_PBKDF2}$`)).toBe(true)
    expect(hash.split('$').length).toBe(3)
    expect(hash.split('$')[2]).toMatch(/^[0-9a-f]{64}$/)
  })

  it('verifica la contraseña correcta y rechaza la incorrecta', async () => {
    const salt = generarSalt()
    const hash = await hashContrasena('clave123', salt)

    expect(await verificarContrasena('clave123', salt, hash)).toBe(true)
    expect(await verificarContrasena('otra clave', salt, hash)).toBe(false)
  })

  it('sigue verificando hashes legacy SHA-256 (compatibilidad con la versión previa)', async () => {
    const salt = generarSalt()
    const legacy = await sha256Hex('Gustavo1234' + salt)

    expect(esHashMigrable(legacy)).toBe(true)
    expect(await verificarContrasena('Gustavo1234', salt, legacy)).toBe(true)
    expect(await verificarContrasena('incorrecta', salt, legacy)).toBe(false)
  })

  it('distingue hashes migrables de los nuevos', async () => {
    const salt = generarSalt()
    expect(esHashMigrable(await hashContrasena('clave123', salt))).toBe(false)
    expect(esHashMigrable(null)).toBe(true)
    expect(esHashMigrable(undefined)).toBe(true)
    expect(esHashMigrable('')).toBe(true)
  })

  it('rechaza hashes PBKDF2 corruptos sin lanzar', async () => {
    const salt = generarSalt()
    expect(await verificarContrasena('clave123', salt, 'pbkdf2$abc$zzz')).toBe(false)
    expect(await verificarContrasena('clave123', salt, 'pbkdf2$0$zzz')).toBe(false)
  })

  it('valida la longitud mínima de contraseña', () => {
    expect(contrasenaValida('1234567')).toBe(true)
    expect(contrasenaValida('12345')).toBe(false)
    expect(contrasenaValida('')).toBe(false)
  })
})