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

// ---------------------------------------------------------------------------
// Validación de la carga útil de `subir`. La nube es la fuente compartida que
// cada dispositivo fusiona (LWW), así que nada basura debe poder escribir.
// Espejo de las reglas de negocio del cliente: tipos, rangos, enumerados y
// formato de fechas; además solo se aceptan las columnas conocidas de cada
// tabla (allow-list) y lotes de tamaño acotado.
// ---------------------------------------------------------------------------

const MAX_FILAS = 2000
const MAX_TAMANO_CUERPO = 2_000_000

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/
const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

function esUuid(v: unknown): boolean {
  return typeof v === 'string' && UUID_REGEX.test(v)
}

function esNumeroFinito(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v)
}

function esTexto(v: unknown, max: number): boolean {
  return typeof v === 'string' && v.length > 0 && v.length <= max
}

/** Decimales <= 2 en montos (evita 0.1+0.2 y valores absurdos). */
function esMonto(v: unknown): boolean {
  return esNumeroFinito(v) && v >= 0 && Number.isInteger(Math.round(v * 100))
}

const ESQUEMAS: Record<string, Record<string, (v: unknown) => boolean>> = {
  usuarios: {
    nombre_usuario: (v) => esTexto(v, 50),
    tipo_usuario: (v) => v === 'ADMIN' || v === 'REGISTRADO',
    contrasena_hash: (v) => esTexto(v, 200),
    salt: (v) => esTexto(v, 64),
    indicio_usuario: (v) => esTexto(v, 100),
    fecha_registro: (v) => esTexto(v, 19) && FECHA_REGEX.test(String(v)),
  },
  productos: {
    tipo_producto: (v) => esTexto(v, 100),
    nombre_producto: (v) => esTexto(v, 100),
    precio_neto: esMonto,
    ganancia: esMonto,
    precio_venta: esMonto,
    cantidad_stock: (v) => esNumeroFinito(v) && Number.isInteger(v) && v >= 0,
    stock_minimo: (v) => esNumeroFinito(v) && Number.isInteger(v) && v >= 0,
  },
  movimientos: {
    tipo_movimiento: (v) => v === 'INGRESO' || v === 'EGRESO',
    monto: esMonto,
    descripcion: (v) => esTexto(v, 400),
    fecha: (v) => esTexto(v, 19) && FECHA_REGEX.test(String(v)),
  },
  solicitudes_admin: {
    usuario_id: esUuid,
    estado: (v) => v === 'PENDIENTE' || v === 'APROBADA' || v === 'RECHAZADA',
    fecha_solicitud: (v) => esTexto(v, 19) && FECHA_REGEX.test(String(v)),
  },
  deudas: {
    cliente_nombre: (v) => esTexto(v, 100),
    monto: esMonto,
    descripcion: (v) => esTexto(v, 400),
    fecha: (v) => esTexto(v, 19) && FECHA_REGEX.test(String(v)),
  },
  pagos_deuda: {
    deuda_id: esUuid,
    monto: esMonto,
    descripcion: (v) => esTexto(v, 400),
    fecha: (v) => esTexto(v, 19) && FECHA_REGEX.test(String(v)),
  },
}

/** Devuelve el primer campo inválido de una fila, o null si es válida. */
function primerCampoInvalido(tabla: string, fila: Record<string, unknown>): string | null {
  const validador = ESQUEMAS[tabla]
  if (!validador) {
    return '(tabla desconocida)'
  }
  const camposPorDefecto = [
    ['id', esUuid],
    ['creado_en', esNumeroFinito],
    ['actualizado_en', esNumeroFinito],
    ['version', (v: unknown) => esNumeroFinito(v) && Number.isInteger(v) && v >= 1],
    ['eliminado', (v: unknown) => v === true || v === false],
    ['dispositivo', (v: unknown) => esTexto(v, 64)],
  ] as const
  const permitidos = new Set(['id', 'creado_en', 'actualizado_en', 'version', 'eliminado', 'dispositivo', ...Object.keys(validador)])
  for (const campo of Object.keys(fila)) {
    if (!permitidos.has(campo)) {
      return `columna no permitida '${campo}'`
    }
  }
  for (const [campo, comprobar] of camposPorDefecto) {
    if (!comprobar(fila[campo])) {
      return campo
    }
  }
  // Campos de negocio. Las tumbas también los conservan (las columnas son
  // NOT NULL), así que se validan igual que las filas activas.
  for (const [campo, comprobar] of Object.entries(validador)) {
    if (!comprobar(fila[campo])) {
      return campo
    }
  }
  return null
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
      // Filtro incremental: si viene `desde` (epoch ms), se devuelven solo
      // las filas modificadas después de esa marca (actualizado_en > desde).
      // Sin `desde` se devuelve la tabla completa (restauración).
      const desdeTexto = new URL(req.url).searchParams.get('desde')
      const desde = Number(desdeTexto)
      const usarDesde = Number.isFinite(desde) && desde > 0
      const tablas: Record<string, unknown[]> = {}
      for (const tabla of TABLAS) {
        const filas: unknown[] = []
        const TAMANO_LOTE = 1000
        let inicio = 0
        for (;;) {
          let consulta = supabase.from(tabla).select('*')
          if (usarDesde) {
            consulta = consulta.gt('actualizado_en', desde)
          }
          const { data, error } = await consulta
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
      if (cuerpo.filas.length > MAX_FILAS) {
        return jsonDatos(413, {
          error: `Demasiadas filas en un lote (máximo ${MAX_FILAS}).`,
        })
      }
      const texto = JSON.stringify(cuerpo.filas)
      if (texto.length > MAX_TAMANO_CUERPO) {
        return jsonDatos(413, { error: 'Lote demasiado grande.' })
      }
      for (const fila of cuerpo.filas) {
        if (typeof fila !== 'object' || fila === null) {
          return jsonDatos(400, { error: 'Una de las filas no es un objeto válido.' })
        }
        const invalido = primerCampoInvalido(cuerpo.tabla as string, fila as Record<string, unknown>)
        if (invalido !== null) {
          const idMostrado = (fila as Record<string, unknown>).id ?? '(sin id)'
          return jsonDatos(400, {
            error: `Rechazada la fila ${String(idMostrado)} de ${cuerpo.tabla}: ${invalido}.`,
          })
        }
      }
      const { error } = await supabase.from(cuerpo.tabla as string).upsert(cuerpo.filas)
      if (error) {
        // 23505 = violación de unicidad (p. ej. nombre_usuario ya existe
        // en la nube desde otro dispositivo). Se responde 409 para que el
        // cliente lo distinga de un fallo transitorio del servidor.
        const esConflicto =
          typeof error.code === 'string' &&
          (error.code === '23505' || error.code.startsWith('23P'))
        return jsonDatos(esConflicto ? 409 : 500, {
          error: esConflicto
            ? 'Ya existe un registro con el mismo nombre en la nube (conflicto de unicidad).'
            : `No se pudo guardar: ${error.message}`,
        })
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