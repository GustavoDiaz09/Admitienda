import { create } from 'zustand'
import { esRolAdministrativo, type Usuario } from '../model/types'
import { UsuarioDao } from '../dao/UsuarioDao'

/** Clave usada para conservar la sesión durante la sesión del navegador. */
const CLAVE_SESION = 'sistematienda.sesion'

interface SesionPersistida {
  usuarioId?: string
  invitado?: boolean
}

function guardarSesion(usuario: Usuario | null, invitado: boolean): void {
  const datos: SesionPersistida = invitado
    ? { invitado: true }
    : usuario
      ? { usuarioId: usuario.id }
      : {}
  if (datos.usuarioId || datos.invitado) {
    window.sessionStorage.setItem(CLAVE_SESION, JSON.stringify(datos))
  } else {
    window.sessionStorage.removeItem(CLAVE_SESION)
  }
}

/**
 * Restaura la sesión guardada al recargar la página (el store Zustand es
 * volátil; la sesión del navegador persiste el id del usuario o invitado).
 */
export async function restaurarSesion(): Promise<void> {
  try {
    const texto = window.sessionStorage.getItem(CLAVE_SESION)
    if (!texto) {
      return
    }
    const datos = JSON.parse(texto) as SesionPersistida
    if (datos.invitado) {
      useSesionStore.getState().entrarComoInvitado()
      return
    }
    if (datos.usuarioId) {
      const usuario = await new UsuarioDao().buscarPorId(datos.usuarioId)
      if (usuario) {
        useSesionStore.getState().iniciarSesion(usuario)
      }
    }
  } catch {
    window.sessionStorage.removeItem(CLAVE_SESION)
  }
}

/**
 * Estado de la sesión actual (port de `tienda.controller.SessionController`,
 * que era estático; en web se usa un store Zustand global).
 */
interface SesionState {
  /** Usuario autenticado en la sesión actual (null si hay invitado/nadie). */
  usuarioActivo: Usuario | null
  /** Indica si la sesión activa corresponde a un invitado. */
  invitadoActivo: boolean
  iniciarSesion: (usuario: Usuario) => void
  entrarComoInvitado: () => void
  cerrarSesion: () => void
}

export const useSesionStore = create<SesionState>((set) => ({
  usuarioActivo: null,
  invitadoActivo: false,
  iniciarSesion: (usuario) => {
    guardarSesion(usuario, false)
    set({ usuarioActivo: usuario, invitadoActivo: false })
  },
  entrarComoInvitado: () => {
    guardarSesion(null, true)
    set({ usuarioActivo: null, invitadoActivo: true })
  },
  cerrarSesion: () => {
    guardarSesion(null, false)
    set({ usuarioActivo: null, invitadoActivo: false })
  },
}))

/** Selectores derivados del estado de sesión. */

export function esAdministrador(): boolean {
  const { usuarioActivo } = useSesionStore.getState()
  return usuarioActivo !== null && esRolAdministrativo(usuarioActivo.tipo_usuario)
}

export function esInvitado(): boolean {
  return useSesionStore.getState().invitadoActivo
}

export function haySesionUsuario(): boolean {
  return useSesionStore.getState().usuarioActivo !== null
}

export function nombreDeSesion(): string {
  const { usuarioActivo, invitadoActivo } = useSesionStore.getState()
  if (usuarioActivo) {
    return usuarioActivo.nombre_usuario
  }
  return invitadoActivo ? 'Invitado' : 'Sin sesión'
}