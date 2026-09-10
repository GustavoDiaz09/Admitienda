import { create } from 'zustand'
import { supabaseDisponible } from '../lib/supabase'
import { hayLlaveConfigurada } from '../lib/llave'
import { subirRemoto, verificarRemoto } from '../lib/remoto'
import { contarPendientes, eliminarItem, listarPendientes, marcarIntento } from './outbox'
import type { RegistroBase, TablaSync } from '../model/types'

/** Máximo de reintentos por entrada antes de dejarla en espera. */
const MAX_INTENTOS = 5

/** Estado global de la sincronización (visible en la interfaz). */
interface SyncState {
  enLinea: boolean
  pendientes: number
  sincronizando: boolean
  ultimaSync: number | null
  error: string | null
  setEnLinea: (v: boolean) => void
  setPendientes: (v: number) => void
  setSincronizando: (v: boolean) => void
  setUltimaSync: (v: number | null) => void
  setError: (v: string | null) => void
}

export const useSyncStore = create<SyncState>((set) => ({
  enLinea: navigator.onLine,
  pendientes: 0,
  sincronizando: false,
  ultimaSync: null,
  error: null,
  setEnLinea: (enLinea) => set({ enLinea }),
  setPendientes: (pendientes) => set({ pendientes }),
  setSincronizando: (sincronizando) => set({ sincronizando }),
  setUltimaSync: (ultimaSync) => set({ ultimaSync }),
  setError: (error) => set({ error }),
}))

/** Actualiza el contador de cambios pendientes en el estado global. */
export async function refrescarPendientes(): Promise<void> {
  useSyncStore.getState().setPendientes(await contarPendientes())
}

/** Verifica conectividad con la nube (llave válida) sin descargar datos. */
export async function verificarConectividad(): Promise<boolean> {
  if (!supabaseDisponible() || !hayLlaveConfigurada()) {
    return false
  }
  return verificarRemoto()
}

/**
 * Sube los cambios pendientes (outbox) a la nube a través de la Edge
 * Function `sync`. El sentido es unidireccional: la app nunca baja datos
 * aquí; el pull es explícito y solo lo dispara un administrador.
 */
export async function sincronizarAhora(): Promise<{ subidos: number; fallados: number }> {
  const store = useSyncStore.getState()
  if (!supabaseDisponible() || !hayLlaveConfigurada() || store.sincronizando) {
    return { subidos: 0, fallados: 0 }
  }
  const enLinea = await verificarConectividad()
  if (!enLinea) {
    store.setEnLinea(false)
    return { subidos: 0, fallados: 0 }
  }
  store.setEnLinea(true)
  store.setSincronizando(true)
  store.setError(null)

  let subidos = 0
  let fallados = 0
  try {
    const pendientes = await listarPendientes()
    const pendientesAlInicio = pendientes.length
    for (const item of pendientes) {
      if (item.intentos >= MAX_INTENTOS) {
        continue
      }
      try {
        await subirRemoto(item.tabla, [filaParaSupabase(item.tabla, item.registro)])
        await eliminarItem(item)
        subidos++
      } catch {
        await marcarIntento(item)
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
    case 'deudas':
      return {
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
    void refrescarPendientes()
  })
  window.addEventListener('offline', () => {
    useSyncStore.getState().setEnLinea(false)
  })
  window.setInterval(() => {
    void (async () => {
      const pendientes = await contarPendientes()
      useSyncStore.getState().setPendientes(pendientes)
      if (pendientes > 0 && navigator.onLine && hayLlaveConfigurada()) {
        void sincronizarAhora()
      }
    })()
  }, intervaloMs)

  if (navigator.onLine && hayLlaveConfigurada()) {
    void sincronizarAhora()
  }
}