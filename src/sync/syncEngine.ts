import { create } from 'zustand'
import { supabaseDisponible } from '../lib/supabase'
import { hayLlaveConfigurada } from '../lib/llave'
import { ErrorRemoto, subirRemoto, verificarRemoto } from '../lib/remoto'
import { avisarError } from '../lib/toast'
import { traerDatosDelServidor } from './pull'
import {
  contarPendientes,
  descartarItem,
  eliminarItemSiSigueIgual,
  listarPendientes,
  marcarIntento,
  reiniciarIntento,
} from './outbox'
import type { RegistroBase, TablaSync } from '../model/types'

/** Máximo de reintentos por entrada antes de dejarla en espera. */
const MAX_INTENTOS = 5

/** Tiempo de espera (ms) antes de volver a intentar una entrada agotada. */
const TIEMPO_REINTENTO_MS = 60_000

/** Separación mínima (ms) entre bajadas automáticas de la nube. */
const INTERVALO_PULL_AUTO_MS = 30_000

/** Última bajada automática (en memoria; el cursor real vive en metadatos). */
let ultimoPullAuto = 0

/** Estado global de la sincronización (visible en la interfaz). */
interface SyncState {
  enLinea: boolean
  pendientes: number
  sincronizando: boolean
  bajando: boolean
  ultimaSync: number | null
  error: string | null
  /** La llave configurada existe pero la nube la rechazó (401). */
  llaveInvalida: boolean
  setEnLinea: (v: boolean) => void
  setPendientes: (v: number) => void
  setSincronizando: (v: boolean) => void
  setBajando: (v: boolean) => void
  setUltimaSync: (v: number | null) => void
  setError: (v: string | null) => void
  setLlaveInvalida: (v: boolean) => void
}

export const useSyncStore = create<SyncState>((set) => ({
  enLinea: navigator.onLine,
  pendientes: 0,
  sincronizando: false,
  bajando: false,
  ultimaSync: null,
  error: null,
  llaveInvalida: false,
  setEnLinea: (enLinea) => set({ enLinea }),
  setPendientes: (pendientes) => set({ pendientes }),
  setSincronizando: (sincronizando) => set({ sincronizando }),
  setBajando: (bajando) => set({ bajando }),
  setUltimaSync: (ultimaSync) => set({ ultimaSync }),
  setError: (error) => set({ error }),
  setLlaveInvalida: (llaveInvalida) => set({ llaveInvalida }),
}))

/** Actualiza el contador de cambios pendientes en el estado global. */
export async function refrescarPendientes(): Promise<void> {
  useSyncStore.getState().setPendientes(await contarPendientes())
}

/**
 * Estado de la conexión con la nube, distinguido por causa. La llave inválida
 * (401) no es lo mismo que estar sin red: se muestra distinto en la interfaz
 * para que el usuario sepa que debe verificar su llave de sincronización.
 */
export type EstadoConexion = 'ok' | 'sin_llave' | 'invalida' | 'sin_red'

export async function verificarConectividad(): Promise<EstadoConexion> {
  if (!supabaseDisponible()) {
    return 'sin_red'
  }
  if (!hayLlaveConfigurada()) {
    return 'sin_llave'
  }
  try {
    await verificarRemoto()
    return 'ok'
  } catch (error) {
    if (error instanceof ErrorRemoto && error.estado === 401) {
      return 'invalida'
    }
    return 'sin_red'
  }
}

/**
 * Baja cambios de la nube de forma incremental y los fusiona (LWW), en
 * segundo plano. Silencioso: nunca lanza errores — solo marca el estado.
 * Lo usan el sondeo periódico y el arranque / vuelta a línea.
 */
export async function sincronizarBajando(): Promise<void> {
  const store = useSyncStore.getState()
  if (
    !supabaseDisponible() ||
    !hayLlaveConfigurada() ||
    !navigator.onLine ||
    store.bajando ||
    store.sincronizando
  ) {
    return
  }
  store.setBajando(true)
  try {
    await traerDatosDelServidor()
  } catch (error) {
    if (error instanceof ErrorRemoto && error.estado === 401) {
      // Conectado, pero la llave de este dispositivo ya no es válida.
      store.setLlaveInvalida(true)
      store.setError(
        'La llave de sincronización no es válida. Verifíquela en el panel de sincronización.',
      )
    } else {
      store.setLlaveInvalida(false)
      store.setEnLinea(false)
    }
  } finally {
    store.setBajando(false)
  }
}

/**
 * Sube los cambios pendientes (outbox) a la nube a través de la Edge
 * Function `sync`. Este lado es unidireccional (solo sube); la bajada
 * automática la hace `sincronizarBajando()` con la misma cadencia del motor.
 * Al descartar cambios rechazados de forma definitiva avisa por toast, para
 * que el silencio de la cola no se confunda con una subida exitosa.
 */
export async function sincronizarAhora(): Promise<{ subidos: number; fallados: number }> {
  const store = useSyncStore.getState()
  if (!supabaseDisponible() || store.sincronizando) {
    return { subidos: 0, fallados: 0 }
  }
  if (!hayLlaveConfigurada()) {
    store.setLlaveInvalida(false)
    store.setEnLinea(false)
    store.setError(null)
    return { subidos: 0, fallados: 0 }
  }
  const estado = await verificarConectividad()
  if (estado === 'invalida') {
    store.setLlaveInvalida(true)
    store.setEnLinea(false)
    store.setError(
      'La llave de sincronización no es válida. Verifíquela en el panel de sincronización.',
    )
    return { subidos: 0, fallados: 0 }
  }
  if (estado === 'sin_red') {
    store.setLlaveInvalida(false)
    store.setEnLinea(false)
    return { subidos: 0, fallados: 0 }
  }
  store.setLlaveInvalida(false)
  store.setEnLinea(true)
  store.setSincronizando(true)
  store.setError(null)

  let subidos = 0
  let fallados = 0
  let descartados = 0
  let motivoDescarte: string | null = null
  try {
    const pendientes = await listarPendientes()
    const pendientesAlInicio = pendientes.length
    for (const item of pendientes) {
      if (item.intentos >= MAX_INTENTOS) {
        if (item.ultimoIntento == null || Date.now() - item.ultimoIntento >= TIEMPO_REINTENTO_MS) {
          await reiniciarIntento(item)
        }
        continue
      }
      try {
        await subirRemoto(item.tabla, [filaParaSupabase(item.tabla, item.registro)])
        await eliminarItemSiSigueIgual(item)
        subidos++
      } catch (error) {
        if (error instanceof ErrorRemoto && error.definitivo) {
          // Rechazo irreversible (400/409/413/422): reenviar jamás tendrá
          // éxito. Se saca de la cola y el mensaje queda visible en el
          // estado de sincronización; el registro local se conserva.
          await descartarItem(item)
          descartados++
          motivoDescarte = error.message
          store.setError(error.message)
        } else {
          await marcarIntento(item)
        }
        fallados++
      }
    }
    await refrescarPendientes()
    store.setUltimaSync(Date.now())
    const restantes = await contarPendientes()
    if (restantes > pendientesAlInicio - subidos && navigator.onLine) {
      window.setTimeout(() => void sincronizarAhora(), 400)
    }
  } finally {
    store.setSincronizando(false)
    void fallados
  }
  if (descartados > 0) {
    avisarError(
      `${descartados} cambio(s) rechazados por la nube y retirados de la cola; el registro se conserva en este dispositivo.${motivoDescarte ? ` Motivo: ${motivoDescarte}` : ''}`,
    )
  }
  return { subidos, fallados }
}

/** Serializa un registro local para la nube (incluye los campos de versión). */
function filaParaSupabase(tabla: TablaSync, registro: RegistroBase): Record<string, unknown> {
  return {
    id: registro.id,
    creado_en: registro.creadoEn,
    actualizado_en: registro.actualizadoEn,
    version: registro.version,
    eliminado: registro.eliminado,
    dispositivo: registro.dispositivo,
    ...columnasExtra(tabla, registro),
  }
}

/** Columnas propias de cada tabla para la carga a la nube. */
function columnasExtra(tabla: TablaSync, r: RegistroBase): Record<string, unknown> {
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

/** Arranca la escucha de eventos online/offline y un sondeo periódico. */
export function iniciarMotorDeSync(intervaloMs = 15000): void {
  window.addEventListener('online', () => {
    useSyncStore.getState().setEnLinea(true)
    void sincronizarAhora()
    void sincronizarBajando()
    void refrescarPendientes()
  })
  window.addEventListener('offline', () => {
    useSyncStore.getState().setEnLinea(false)
  })
  window.setInterval(() => {
    void (async () => {
      const pendientes = await contarPendientes()
      useSyncStore.getState().setPendientes(pendientes)
      if (navigator.onLine && hayLlaveConfigurada()) {
        if (pendientes > 0) {
          void sincronizarAhora()
        }
        if (Date.now() - ultimoPullAuto >= INTERVALO_PULL_AUTO_MS) {
          ultimoPullAuto = Date.now()
          void sincronizarBajando()
        }
      }
    })()
  }, intervaloMs)

  if (navigator.onLine && hayLlaveConfigurada()) {
    void sincronizarAhora()
    void sincronizarBajando()
  }
}