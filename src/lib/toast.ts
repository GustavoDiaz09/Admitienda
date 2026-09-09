import { create } from 'zustand'

/** Tipo de aviso mostrado en la pila de notificaciones (toasts). */
export type TipoAlerta = 'exito' | 'error' | 'info'

export interface Aviso {
  id: number
  tipo: TipoAlerta
  mensaje: string
}

interface EstadoToasts {
  avisos: Aviso[]
  avisar: (tipo: TipoAlerta, mensaje: string) => void
  descartar: (id: number) => void
}

let siguienteId = 1

export const useToastStore = create<EstadoToasts>((set) => ({
  avisos: [],
  avisar: (tipo, mensaje) => {
    const id = siguienteId++
    set((estado) => ({ avisos: [...estado.avisos, { id, tipo, mensaje }] }))
    window.setTimeout(() => {
      set((estado) => ({ avisos: estado.avisos.filter((a) => a.id !== id) }))
    }, 4500)
  },
  descartar: (id) => set((estado) => ({ avisos: estado.avisos.filter((a) => a.id !== id) })),
}))

/** Emite un aviso de éxito en la interfaz. */
export function avisarExito(mensaje: string): void {
  useToastStore.getState().avisar('exito', mensaje)
}

/** Emite un aviso de error en la interfaz. */
export function avisarError(mensaje: string): void {
  useToastStore.getState().avisar('error', mensaje)
}

/** Emite un aviso informativo en la interfaz. */
export function avisarInfo(mensaje: string): void {
  useToastStore.getState().avisar('info', mensaje)
}