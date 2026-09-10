import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const CLAVE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const TABLAS = [
  'usuarios',
  'productos',
  'movimientos',
  'solicitudes_admin',
  'deudas',
  'pagos_deuda',
]

function aHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function hashDeLlave(llave: string, salt: string, iteraciones: number): Promise<string> {
  const clave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(llave),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: iteraciones,
      salt: new TextEncoder().encode(llave + salt),
    },
    clave,
    256,
  )
  return aHex(new Uint8Array(bits))
}

async function llaveValida(
  supabase: ReturnType<typeof createClient>,
  llave: string,
): Promise<boolean> {
  if (!llave) {
    return false
  }
  const { data, error } = await supabase.from('llaves_sincronizacion').select('llave_salt, llave_hash')
  if (error || !data) {
    return false
  }
  for (const fila of data) {
    const hashGuardado = String(fila.llave_hash ?? '')
    if (!hashGuardado.startsWith('pbkdf2$')) {
      continue
    }
    const [, iterTxt, hashHex] = hashGuardado.split('$')
    const iteraciones = Number(iterTxt)
    if (!Number.isInteger(iteraciones) || iteraciones <= 0 || !hashHex) {
      continue
    }
    const calculado = await hashDeLlave(llave, String(fila.llave_salt ?? ''), iteraciones)
    if (calculado === hashHex.toLowerCase()) {
      return true
    }
  }
  return false
}

function jsonDatos(status: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' },
  })
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return jsonDatos(405, { error: 'Método no permitido.' })
    }

    const supabase = createClient(SUPABASE_URL, CLAVE_SERVICE)
    const llave = req.headers.get('x-llave-sincronizacion') ?? ''
    if (!(await llaveValida(supabase, llave))) {
      return jsonDatos(401, { error: 'Llave de sincronización inválida.' })
    }

    const accion = new URL(req.url).searchParams.get('accion')

    if (accion === 'ping') {
      return jsonDatos(200, { ok: true })
    }

    if (accion === 'hay_admin') {
      const { count, error } = await supabase
        .from('usuarios')
        .select('id', { count: 'exact', head: true })
        .eq('tipo_usuario', 'ADMIN')
      if (error) {
        return jsonDatos(500, { error: `No se pudo consultar: ${error.message}` })
      }
      return jsonDatos(200, { hay: (count ?? 0) > 0 })
    }

    if (accion === 'descargar') {
      const tablas: Record<string, unknown[]> = {}
      for (const tabla of TABLAS) {
        const filas: unknown[] = []
        const TAMANO_LOTE = 1000
        let inicio = 0
        for (;;) {
          const { data, error } = await supabase
            .from(tabla)
            .select('*')
            .order('id', { ascending: true })
            .range(inicio, inicio + TAMANO_LOTE - 1)
          if (error) {
            return jsonDatos(500, { error: `No se pudo descargar ${tabla}: ${error.message}` })
          }
          const lote = data ?? []
          filas.push(...lote)
          if (lote.length < TAMANO_LOTE) {
            break
          }
          inicio += TAMANO_LOTE
        }
        tablas[tabla] = filas
      }
      return jsonDatos(200, tablas)
    }

    if (accion === 'subir') {
      let cuerpo: { tabla?: string; filas?: unknown[] }
      try {
        cuerpo = await req.json()
      } catch {
        return jsonDatos(400, { error: 'Cuerpo inválido.' })
      }
      if (!TABLAS.includes(cuerpo.tabla ?? '')) {
        return jsonDatos(400, { error: 'Tabla desconocida.' })
      }
      if (!Array.isArray(cuerpo.filas) || cuerpo.filas.length === 0) {
        return jsonDatos(400, { error: 'Se requiere al menos una fila.' })
      }
      const { error } = await supabase.from(cuerpo.tabla as string).upsert(cuerpo.filas)
      if (error) {
        return jsonDatos(500, { error: `No se pudo guardar: ${error.message}` })
      }
      return jsonDatos(200, { ok: true, subidas: cuerpo.filas.length })
    }

    return jsonDatos(400, { error: 'Acción desconocida.' })
  } catch (error) {
    return jsonDatos(500, {
      error: 'Excepción interna: ' + (error instanceof Error ? error.message : String(error)),
    })
  }
})