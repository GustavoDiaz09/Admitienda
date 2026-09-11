import type { Table } from 'dexie'
import { supabaseDisponible } from '../lib/supabase'
import { descargarRemoto, subirRemoto } from '../lib/remoto'
import { db } from '../lib/db'
import { useSyncStore, refrescarPendientes, sincronizarAhora } from './syncEngine'
import { contarPendientes, idOutbox } from './outbox'
import type { RegistroBase, TablaSync, Usuario } from '../model/types'

export const TABLAS: TablaSync[] = [
  'usuarios',
  'productos',
  'movimientos',
  'solicitudes_admin',
  'deudores',
  'deudas',
  'pagos_deuda',
]

interface ResultadoPull {
  recibidos: number
  actualizados: number
  conflictos: number
  tablas: number
  dispositivos: Set<string>
}

/** Clave del metadato que guarda la marca desde la que se bajó la nube. */
const CLAVE_CURSOR = 'ultima_descarga'

/** Clave del metadato que guarda cuándo toca un rescaneo completo. */
const CLAVE_RESCAN = 'proxima_descarga_completa'

/** Tamaño de lote para descargas y para subir la base completa. */
const TAMANO_LOTE = 1000

/**
 * Columna con índice único (además del id) de cada tabla. Si una fila remota
 * choca con otra local al aplicarla (mismo nombre de usuario o deudor, id
 * distinto), se resuelve con LWW comparando contra el ocupante local.
 */
const CLAVE_UNICA: Partial<Record<TablaSync, string>> = {
  usuarios: 'nombre_usuario',
  deudores: 'nombre_normalizado',
}

/**
 * Margen de seguridad del cursor incremental. El cursor se ancla al reloj del
 * servidor (no al local) menos este margen: así toda fila escrita durante la
 * bajada qaeda por encima del cursor y se repite en el ciclo siguiente (la
 * fusión LWW es idempotente), y un reloj local adelantado ya no puede dejar
 * la bajada congelada para siempre.
 */
const MARGEN_CURSOR_MS = 5 * 60 * 1000

/**
 * Cadencia del rescaneo completo de seguridad. Las filas escritas por un
 * dispositivo con reloj atrasado quedan con `actualizado_en` antiguo y el
 * filtro incremental nunca las vuelve a ver; cada 24 h se fuerza una baja
 * completa que las recupera de manera eventual.
 */
const INTERVALO_RESCAN_MS = 24 * 60 * 60 * 1000

/**
 * Marca de tiempo (epoch ms) de la última descarga exitosa. Se usa como
 * cursor incremental: solo se vuelve a bajar lo modificado después de él.
 */
export async function obtenerCursorDescarga(): Promise<number> {
  const fila = await db.metadatos.get(CLAVE_CURSOR)
  return fila ? Number(fila.valor) || 0 : 0
}

/** Persiste el cursor de descarga tras una bajada exitosa. */
export async function guardarCursorDescarga(marcaTiempo: number): Promise<void> {
  await db.metadatos.put({ clave: CLAVE_CURSOR, valor: String(marcaTiempo) })
}

/** Epoch ms de cuándo toca un rescaneo completo (0 si aún nunca se corrió). */
export async function obtenerProximaDescargaCompleta(): Promise<number> {
  const fila = await db.metadatos.get(CLAVE_RESCAN)
  return fila ? Number(fila.valor) || 0 : 0
}

/** Programa el próximo rescaneo completo de seguridad. */
export async function programarProximaDescargaCompleta(marcaTiempo: number): Promise<void> {
  await db.metadatos.put({ clave: CLAVE_RESCAN, valor: String(marcaTiempo) })
}

/** Convierte una fila de la nube (nombres con guion bajo) a registro local. */
export function filaLocal(fila: Record<string, unknown>): RegistroBase {
  const base = {
    id: String(fila.id),
    creadoEn: Number(fila.creado_en ?? 0),
    actualizadoEn: Number(fila.actualizado_en ?? 0),
    version: Number(fila.version ?? 0),
    eliminado: Boolean(fila.eliminado ?? false),
    dispositivo: String(fila.dispositivo ?? ''),
  }
  const extra: Record<string, unknown> = { ...fila }
  delete extra.id
  delete extra.creado_en
  delete extra.actualizado_en
  delete extra.version
  delete extra.eliminado
  delete extra.dispositivo
  return { ...base, ...extra } as unknown as RegistroBase
}

/** Resuelve la tabla Dexie según el nombre. */
function tablaDexie(tabla: TablaSync) {
  switch (tabla) {
    case 'usuarios':
      return db.usuarios
    case 'productos':
      return db.productos
    case 'movimientos':
      return db.movimientos
    case 'solicitudes_admin':
      return db.solicitudes_admin
    case 'deudores':
      return db.deudores
    case 'deudas':
      return db.deudas
    case 'pagos_deuda':
      return db.pagos_deuda
  }
}

/**
 * Aplica de forma autoritativa la fila del usuario confirmada por la nube en
 * el login híbrido. Como el servidor acaba de verificar las credenciales del
 * propio usuario, la fila remota es la fuente de verdad: cualquier copia
 * local con el mismo `nombre_usuario` pero id distinto (fantasma de una
 * siembra/registro previo) se descarta físicamente de este dispositivo junto
 * con su entrada del outbox (solo local: jamás subiría por el índice único),
 * igual que la resolución LWW de `aplicarRemotos`. Devuelve el usuario local.
 */
export async function sembrarUsuarioDeSesion(fila: Record<string, unknown>): Promise<Usuario> {
  const usuario = filaLocal(fila) as unknown as Usuario
  try {
    await db.usuarios.put(usuario)
  } catch {
    const ocupante = await db.usuarios
      .where('nombre_usuario')
      .equals(usuario.nombre_usuario)
      .first()
    if (ocupante && ocupante.id !== usuario.id) {
      try {
        await db.usuarios.delete(ocupante.id)
        await db.outbox.delete(idOutbox('usuarios', ocupante.id))
      } catch {
        // La remoción del fantasma es best-effort; el `put` siguiente decide.
      }
    } else {
      throw new Error('No se pudo guardar la cuenta localmente.')
    }
    await db.usuarios.put(usuario)
  }
  await db.outbox.delete(idOutbox('usuarios', usuario.id))
  return usuario
}

/**
 * Aplica las filas remotas de una tabla con "último write gana" (LWW):
 * - Si la nube tiene una versión más reciente (misma `actualizadoEn` o
 *   mayor, desempate por `version`), la versión remota reemplaza a la
 *   local y se cancela la edición local pendiente de ese registro.
 * - Si es local la más reciente, se conserva la copia local y su entrada
 *   en la cola de sincronización, para que suba en el siguiente ciclo.
 * - Un registro con la misma marca y versión lo gana la nube (fuente de
 *   verdad en empates).
 * - Si una fila remota choca con una columna única local (mismo nombre de
 *   usuario o deudor con id distinto) y su versión es más reciente que la del
 *   ocupante local, el ocupante se descarta en este dispositivo (solo local:
 *   en la nube jamás podría subir por el índice único) y gana la fila remota.
 *
 * Devuelve el total de filas recibidas, las aplicadas de la nube y los
 * conflictos de unicidad local que no pudieron aplicarse.
 */
export async function aplicarRemotos(
  tabla: TablaSync,
  remotos: Array<Record<string, unknown>>,
): Promise<{ recibidos: number; actualizados: number; conflictos: number }> {
  const tablaLocal = tablaDexie(tabla)
  let recibidos = 0
  let actualizados = 0
  let conflictos = 0
  for (const fila of remotos) {
    const remoto = filaLocal(fila)
    recibidos++
    const local = await tablaLocal.get(remoto.id)
    const ganaRemoto =
      !local ||
      remoto.actualizadoEn > local.actualizadoEn ||
      (remoto.actualizadoEn === local.actualizadoEn && remoto.version >= local.version)
    if (!ganaRemoto) {
      continue
    }
    try {
      await tablaLocal.put(remoto as never)
    } catch {
      // Choque con una restricción local: dos registros con el mismo valor en
      // una columna única (nombre de usuario o deudor) pero ids distintos.
      // El choque no lo causa el id (si fuese el mismo, el `put` reemplazaría),
      // sino que este dispositivo quedó con una copia antigua de otra cuenta
      // con el mismo nombre (p. ej. siembras/registros previos al SUPERADMIN).
      const columnaClaveUnica = CLAVE_UNICA[tabla]
      const valor = columnaClaveUnica
        ? (remoto as unknown as Record<string, unknown>)[columnaClaveUnica]
        : undefined
      const ocupante =
        columnaClaveUnica && typeof valor === 'string' && valor !== ''
          ? await (tablaLocal as unknown as Table<Record<string, unknown>, string>)
              .where(columnaClaveUnica)
              .equals(valor)
              .first()
          : undefined
      // El ocupante local puede nunca sincronizarse: la nube tiene el mismo
      // nombre con un id distinto (índice único lower(...)), así que subirlo
      // daría siempre 409. Si la nube tiene la versión más reciente, la fila
      // remota debe ganar: el ocupante se descarta en este dispositivo (junto
      // con su entrada de la cola) y se aplica el registro de la nube.
      const remotoGana =
        !!ocupante &&
        (remoto.actualizadoEn > Number(ocupante.actualizadoEn) ||
          (remoto.actualizadoEn === Number(ocupante.actualizadoEn) &&
            remoto.version >= Number(ocupante.version)))
      if (!remotoGana) {
        conflictos++
        continue
      }
      await tablaLocal.delete(String(ocupante.id))
      await db.outbox.delete(idOutbox(tabla, String(ocupante.id)))
      try {
        await tablaLocal.put(remoto as never)
      } catch {
        conflictos++
        continue
      }
    }
    await db.outbox.delete(idOutbox(tabla, remoto.id))
    actualizados++
  }
  return { recibidos, actualizados, conflictos }
}

/**
 * Baja las filas de la nube y las fusiona con la copia local (LWW) para
 * este dispositivo. No descarta datos locales: lo que esté más reciente
 * (nube o dispositivo) se conserva, y los cambios locales pendientes que
 * sigan ganando se re-intentan al terminar.
 *
 * Por defecto es **incremental**: solo trae lo modificado después del
 * último cursor guardado. Con `{ completo: true }` se baja la base completa
 * (acción manual "Descargar todo" de un administrador).
 */
export async function traerDatosDelServidor(
  opciones: { completo?: boolean } = {},
): Promise<ResultadoPull> {
  const resultado: ResultadoPull = {
    recibidos: 0,
    actualizados: 0,
    conflictos: 0,
    tablas: 0,
    dispositivos: new Set(),
  }
  if (!supabaseDisponible()) {
    throw new Error('Supabase no está configurado. Revise las variables de entorno.')
  }
  const store = useSyncStore.getState()
  store.setError(null)

  const cursor = await obtenerCursorDescarga()
  const proximaCompleta = await obtenerProximaDescargaCompleta()
  const tocaRescan = proximaCompleta > 0 && proximaCompleta <= Date.now()
  const desde = opciones.completo || cursor === 0 || tocaRescan ? undefined : cursor
  const descarga = await descargarRemoto(desde)
  const tablas = descarga.tablas
  for (const tabla of TABLAS) {
    const remotos = (tablas[tabla] ?? []) as Array<Record<string, unknown>>
    const aplicados = await aplicarRemotos(tabla, remotos)
    resultado.recibidos += aplicados.recibidos
    resultado.actualizados += aplicados.actualizados
    resultado.conflictos += aplicados.conflictos
    for (const fila of remotos) {
      resultado.dispositivos.add(String(fila.dispositivo ?? ''))
    }
    resultado.tablas++
  }
  // El cursor se deriva del reloj del servidor (`ahora` del sobre, con un
  // margen de seguridad), no del reloj local: un reloj local adelantado ya
  // no puede dejar la bajada congelada para siempre, y uno atrasado deja de
  // re-descargar casi toda la base en cada ciclo. Restar el margen hace que
  // toda fila escrita durante la bajada quede por encima del cursor y se
  // repita en el siguiente ciclo (la fusión LWW es idempotente).
  const baseDeReloj = descarga.ahora > 0 ? descarga.ahora : Date.now()
  await guardarCursorDescarga(Math.max(baseDeReloj - MARGEN_CURSOR_MS, 0))
  // Tras toda bajada completa (primera vez, manual o rescaneo de seguridad
  // vencido) se programa el siguiente rescaneo desde el reloj del servidor.
  // Recupera eventualmente las filas escritas por dispositivos con reloj
  // atrasado, que el filtro incremental nunca volvería a ver.
  if (cursor === 0 || tocaRescan || opciones.completo) {
    await programarProximaDescargaCompleta(baseDeReloj + INTERVALO_RESCAN_MS)
  }
  await refrescarPendientes()
  const pendientes = await contarPendientes()
  if (pendientes > 0) {
    void sincronizarAhora()
  }
  store.setUltimaSync(Date.now())
  return resultado
}

/**
 * Sube la base local completa a la nube (respaldar "a mano" al primer uso
 * en un dispositivo nuevo, para que el resto pueda descargarla). La base
 * local es limpia: no contiene registros "semilla".
 */
export async function respaldarTodoEnServidor(): Promise<{ subidos: number }> {
  if (!supabaseDisponible()) {
    throw new Error('Supabase no está configurado. Revise las variables de entorno.')
  }
  let subidos = 0
  for (const tabla of TABLAS) {
    const tablaLocal = tablaDexie(tabla)
    const registros = await tablaLocal.toArray()
    if (registros.length === 0) {
      continue
    }
    const filas = registros.map((r) => ({
      id: r.id,
      creado_en: r.creadoEn,
      actualizado_en: r.actualizadoEn,
      version: r.version,
      eliminado: r.eliminado,
      dispositivo: r.dispositivo,
      ...filaExtra(tabla, r),
    }))
    for (let i = 0; i < filas.length; i += TAMANO_LOTE) {
      await subirRemoto(tabla, filas.slice(i, i + TAMANO_LOTE))
    }
    subidos += registros.length
  }
  return { subidos }
}

/** Columnas propias de cada tabla al subir (mismo mapeo del motor). */
function filaExtra(tabla: TablaSync, r: RegistroBase): Record<string, unknown> {
  const registro = r as unknown as Record<string, unknown>
  switch (tabla) {
    case 'usuarios':
      return {
        nombre_usuario: registro.nombre_usuario,
        tipo_usuario: registro.tipo_usuario,
        contrasena_hash: registro.contrasena_hash,
        salt: registro.salt,
        indicio_usuario: registro.indicio_usuario,
        fecha_registro: registro.fecha_registro,
      }
    case 'productos':
      return {
        tipo_producto: registro.tipo_producto,
        nombre_producto: registro.nombre_producto,
        precio_neto: registro.precio_neto,
        ganancia: registro.ganancia,
        precio_venta: registro.precio_venta,
        cantidad_stock: registro.cantidad_stock,
        stock_minimo: registro.stock_minimo,
      }
    case 'movimientos':
      return {
        tipo_movimiento: registro.tipo_movimiento,
        monto: registro.monto,
        descripcion: registro.descripcion,
        fecha: registro.fecha,
      }
    case 'solicitudes_admin':
      return {
        usuario_id: registro.usuario_id,
        estado: registro.estado,
        fecha_solicitud: registro.fecha_solicitud,
      }
    case 'deudores':
      return {
        nombre_deudor: registro.nombre_deudor,
        nombre_normalizado: registro.nombre_normalizado,
      }
    case 'deudas':
      return {
        deudor_id: registro.deudor_id,
        cliente_nombre: registro.cliente_nombre,
        monto: registro.monto,
        saldo: registro.saldo,
        descripcion: registro.descripcion,
        fecha: registro.fecha,
      }
    case 'pagos_deuda':
      return {
        deuda_id: registro.deuda_id,
        monto: registro.monto,
        descripcion: registro.descripcion,
        fecha: registro.fecha,
      }
  }
}