import { createClient } from '@supabase/supabase-js'
import { NOMBRE_SUPERADMIN } from './esquemas.ts'
import { verificarContrasena } from './password.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const CLAVE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const TABLAS = [
  'usuarios',
  'productos',
  'movimientos',
  'solicitudes_admin',
  'deudores',
  'deudas',
  'pagos_deuda',
]

function aHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function aleatorioHex(longitudBytes: number): string {
  const bytes = new Uint8Array(longitudBytes)
  crypto.getRandomValues(bytes)
  return aHex(bytes)
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
    headers: {
      'Content-Type': 'application/json',
      'Connection': 'keep-alive',
      ...CABECERAS_CORS,
    },
  })
}

// Supabase enruta el preflight del navegador (OPTIONS) a la función; sin
// responderlo con CORS el `fetch` del cliente falla "No se pudo conectar".
const CABECERAS_CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'x-llave-sincronizacion, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

// ---------------------------------------------------------------------------
// Validación de la carga útil de `subir`. La nube es la fuente compartida que
// cada dispositivo fusiona (LWW), así que nada basura debe poder escribir.
// Los esquemas y validadores viven en `esquemas.ts` (compartidos con los
// tests de la aplicación); aquí se aplican además los límites de tamaño y
// el conteo máximo de filas por lote.
// ---------------------------------------------------------------------------

const MAX_FILAS = 2000
const MAX_TAMANO_CUERPO = 2_000_000

// Límites de `descargar`: un respaldo completo se acumula en memoria antes de
// responder, así que se acota el número total de filas para no agotar el
// isolate (546 WORKER_RESOURCE_LIMIT) en bases grandes.
const MAX_FILAS_DESCARGAR = 50_000

// Iteraciones de PBKDF2 para las llaves de sincronización (mismas que usa la
// app para las contraseñas y que el explorador de `llaveValida`).
const ITERACIONES_LLAVE = 210_000

// ---------------------------------------------------------------------------
// Protección contra fuerza bruta del login en la nube. Al ser híbrido, el
// `login` verifica credenciales sin exigir llave de dispositivo; el límite se
// aplica por nombre de usuario en memoria. El aislamiento de la Edge Function
// reinicia el contador entre isolates (best-effort): la capa principal es el
// backoff local de `intentos.ts`, esta es una defensa adicional directa.
// ---------------------------------------------------------------------------

const MAX_FALLOS_LOGIN = 5
const ESPERA_INICIAL_LOGIN_MS = 30_000
const ESPERA_MAXIMA_LOGIN_MS = 24 * 60 * 60 * 1000

interface BloqueoLogin {
  fallos: number
  hastaMs: number
}

const intentosLogin = new Map<string, BloqueoLogin>()

function bloqueoLoginDe(nombre: string): BloqueoLogin {
  let actual = intentosLogin.get(nombre)
  const ahora = Date.now()
  if (!actual || actual.hastaMs < ahora) {
    actual = { fallos: 0, hastaMs: 0 }
    intentosLogin.set(nombre, actual)
  }
  return actual
}

function registrarFalloLogin(nombre: string): void {
  const actual = bloqueoLoginDe(nombre)
  actual.fallos++
  if (actual.fallos >= MAX_FALLOS_LOGIN) {
    const pasos = actual.fallos - MAX_FALLOS_LOGIN
    const espera = Math.min(ESPERA_INICIAL_LOGIN_MS * 2 ** pasos, ESPERA_MAXIMA_LOGIN_MS)
    actual.hastaMs = Date.now() + espera
  }
}

function limpiarFalloLogin(nombre: string): void {
  intentosLogin.delete(nombre)
}

function leerNombreDeCuerpo(cuerpo: unknown): string {
  if (cuerpo == null || typeof cuerpo !== 'object') return ''
  const nombre = (cuerpo as Record<string, unknown>).nombre
  return typeof nombre === 'string' ? nombre.trim() : ''
}

/**
 * Crea una llave de sincronización nueva con nombre opcional y devuelve la
 * llave en claro (solo se devuelve una vez; la nube guarda salt + hash).
 * Lo usan `crear_llave` y el auto-enrolamiento del SUPERADMIN en `login`.
 */
async function crearLlaveEnServidor(
  supabase: ReturnType<typeof createClient>,
  nombre?: string,
): Promise<string> {
  const llaveNueva = aleatorioHex(24)
  const salt = aleatorioHex(32)
  const hash = await hashDeLlave(llaveNueva, salt, ITERACIONES_LLAVE)
  const fila: Record<string, string> = {
    llave_salt: salt,
    llave_hash: `pbkdf2$${ITERACIONES_LLAVE}$${hash}`,
  }
  if (nombre) {
    fila.nombre = nombre
  }
  const { error } = await supabase.from('llaves_sincronizacion').insert(fila)
  if (error) {
    throw new Error(error.message)
  }
  return llaveNueva
}

/**
 * Crea una llave de sincronización nueva. Sin ninguna llave guardada en la
 * nube actúa como "arranque" (el primer dispositivo la genera sin necesidad
 * de otra); en cualquier otro caso exige una llave vigente (solo quien ya
 * posee una puede habilitar otro dispositivo). La llave en claro se devuelve
 * una única vez en la respuesta y nunca se guarda.
 */
async function manejarCrearLlave(
  supabase: ReturnType<typeof createClient>,
  req: Request,
): Promise<Response> {
  const { count, error: errorConteo } = await supabase
    .from('llaves_sincronizacion')
    .select('id', { count: 'exact', head: true })
  if (errorConteo) {
    console.error('crear_llave:', errorConteo.message)
    return jsonDatos(500, { error: 'No se pudo consultar las llaves existentes.' })
  }
  const totalLlaves = count ?? 0
  if (totalLlaves > 0) {
    const llaveActual = req.headers.get('x-llave-sincronizacion') ?? ''
    if (!(await llaveValida(supabase, llaveActual))) {
      return jsonDatos(401, { error: 'Llave de sincronización inválida.' })
    }
  }

  let nombre = ''
  if (req.method === 'POST') {
    try {
      nombre = leerNombreDeCuerpo(await req.json())
    } catch {
      // Sin cuerpo: se usa el nombre por defecto de la columna.
    }
  }

  try {
    const llaveNueva = await crearLlaveEnServidor(supabase, nombre)
    return jsonDatos(200, { llave: llaveNueva, inicial: totalLlaves === 0 })
  } catch (error) {
    console.error('crear_llave:', error instanceof Error ? error.message : String(error))
    return jsonDatos(500, { error: 'No se pudo crear la llave de sincronización.' })
  }
}

/**
 * Login híbrido: verifica las credenciales contra la nube (sin exigir llave
 * de dispositivo) y devuelve la fila del usuario para sembrarla localmente.
 * Cuando es la cuenta del dueño (SUPERADMIN) y el dispositivo no trae una
 * llave válida, se auto-enrola una llave nueva (se devuelve una sola vez);
 * cualquier otro usuario puede entrar sin llave y la obtiene después desde
 * una sesión ya iniciada (flujo de distribución del dueño). Ante
 * credenciales incorrectas se responde 400 `credencialesIncorrectas:true`
 * (mensaje único, sin enumerar usuarios) y se aplica el límite de fuerza
 * bruta; un 429 indica esperar antes de reintentar.
 */
async function manejarLogin(
  supabase: ReturnType<typeof createClient>,
  req: Request,
): Promise<Response> {
  let cuerpo: { nombre_usuario?: unknown; contrasena?: unknown }
  try {
    cuerpo = (await req.json()) as { nombre_usuario?: unknown; contrasena?: unknown }
  } catch {
    return jsonDatos(400, { credencialesIncorrectas: true })
  }
  const nombre = typeof cuerpo?.nombre_usuario === 'string' ? cuerpo.nombre_usuario.trim() : ''
  const contrasena = typeof cuerpo?.contrasena === 'string' ? cuerpo.contrasena : ''
  if (!nombre || !contrasena) {
    return jsonDatos(400, { credencialesIncorrectas: true })
  }

  const bloqueo = bloqueoLoginDe(nombre.toLowerCase())
  const esperaRestanteMs = bloqueo.hastaMs - Date.now()
  if (esperaRestanteMs > 0) {
    return jsonDatos(429, {
      error: 'Demasiados intentos fallidos. Intente de nuevo más tarde.',
      esperaMs: esperaRestanteMs,
    })
  }

  const { data: usuario, error } = await supabase
    .from('usuarios')
    .select('*')
    .ilike('nombre_usuario', nombre)
    .limit(1)
  if (error) {
    console.error('login:', error.message)
    return jsonDatos(500, { error: 'No se pudo verificar el inicio de sesión.' })
  }
  const fila = (usuario ?? [])[0] as Record<string, unknown> | undefined
  const credencialesValidas = !!fila && (await verificarContrasena(
    contrasena,
    String(fila.salt ?? ''),
    String(fila.contrasena_hash ?? ''),
  ))
  if (!fila || !credencialesValidas) {
    registrarFalloLogin(nombre.toLowerCase())
    return jsonDatos(400, { credencialesIncorrectas: true })
  }
  limpiarFalloLogin(nombre.toLowerCase())

  let llaveNueva: string | undefined
  const llaveRecibida = req.headers.get('x-llave-sincronizacion') ?? ''
  const trajoLlaveValida = llaveRecibida !== '' && (await llaveValida(supabase, llaveRecibida))
  const esSuperadmin =
    String(fila.tipo_usuario ?? '') === 'SUPERADMIN' &&
    String(fila.nombre_usuario ?? '') === NOMBRE_SUPERADMIN
  if (esSuperadmin && !trajoLlaveValida) {
    try {
      llaveNueva = await crearLlaveEnServidor(supabase, 'Auto-enrolamiento (SUPERADMIN)')
    } catch (errorError) {
      console.error(
        'login auto-enrolamiento:',
        errorError instanceof Error ? errorError.message : String(errorError),
      )
      // El login ya es válido: sin llave no se auto-enrola, pero no se
      // rechaza la sesión; el dispositivo podrá configurar la llave después.
    }
  }

  return jsonDatos(200, {
    ok: true,
    usuario: fila,
    ...(llaveNueva !== undefined ? { llave: llaveNueva } : {}),
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CABECERAS_CORS })
  }
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return jsonDatos(405, { error: 'Método no permitido.' })
    }

    const supabase = createClient(SUPABASE_URL, CLAVE_SERVICE)
    const accion = new URL(req.url).searchParams.get('accion')

    if (accion === 'crear_llave') {
      return manejarCrearLlave(supabase, req)
    }

    if (accion === 'login') {
      return manejarLogin(supabase, req)
    }

    const llave = req.headers.get('x-llave-sincronizacion') ?? ''
    if (!(await llaveValida(supabase, llave))) {
      return jsonDatos(401, { error: 'Llave de sincronización inválida.' })
    }

    if (accion === 'ping') {
      return jsonDatos(200, { ok: true })
    }

    if (accion === 'hay_admin') {
      const { count, error } = await supabase
        .from('usuarios')
        .select('id', { count: 'exact', head: true })
        .in('tipo_usuario', ['ADMIN', 'SUPERADMIN'])
      if (error) {
        console.error('hay_admin:', error.message)
        return jsonDatos(500, { error: 'No se pudo consultar el estado de administradores.' })
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
      let totalFilas = 0
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
            console.error(`descargar ${tabla}:`, error.message)
            return jsonDatos(500, { error: 'No se pudo descargar la información desde la nube.' })
          }
          const lote = data ?? []
          totalFilas += lote.length
          if (totalFilas > MAX_FILAS_DESCARGAR) {
            return jsonDatos(413, {
              error:
                `La descarga supera el límite de ${MAX_FILAS_DESCARGAR} filas. ` +
                'Reduzca el volumen de datos en la nube o sincronice de nuevo más tarde.',
            })
          }
          filas.push(...lote)
          if (lote.length < TAMANO_LOTE) {
            break
          }
          inicio += TAMANO_LOTE
        }
        tablas[tabla] = filas
      }
      // El sobre incluye `ahora` (reloj del servidor) para que el cliente
      // calibre su cursor incremental sin depender del reloj local.
      return jsonDatos(200, { ahora: Date.now(), tablas })
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
        if (!esConflicto) {
          console.error(`subir ${cuerpo.tabla}:`, error.message)
        }
        return jsonDatos(esConflicto ? 409 : 500, {
          error: esConflicto
            ? 'Ya existe un registro con el mismo nombre en la nube (conflicto de unicidad).'
            : 'No se pudo guardar en la nube. Intente de nuevo más tarde.',
        })
      }
      return jsonDatos(200, { ok: true, subidas: cuerpo.filas.length })
    }

    return jsonDatos(400, { error: 'Acción desconocida.' })
  } catch (error) {
    console.error('sync:', error instanceof Error ? error.message : String(error))
    return jsonDatos(500, { error: 'Error interno del servicio de sincronización.' })
  }
})