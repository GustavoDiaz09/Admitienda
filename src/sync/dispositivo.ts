import { db } from '../lib/db'

let cache: string | null = null

/**
 * Devuelve (creándolo si no existe) el identificador único de este
 * dispositivo, persistido en la tabla `metadatos`. Se usa para firmar
 * cada registro y resolver empates en "último write gana".
 */
export async function obtenerDispositivoId(): Promise<string> {
  if (cache) {
    return cache
  }
  const fila = await db.metadatos.get('dispositivo_id')
  if (fila) {
    cache = fila.valor
    return fila.valor
  }
  const id = crypto.randomUUID()
  await db.metadatos.put({ clave: 'dispositivo_id', valor: id })
  cache = id
  return id
}