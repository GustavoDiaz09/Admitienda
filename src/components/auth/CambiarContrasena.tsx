import type { FormEvent } from 'react'
import { useState } from 'react'
import { Key } from '@phosphor-icons/react'
import { UsuarioController } from '../../controller/UsuarioController'
import { useSesionStore } from '../../controller/SessionController'
import { UsuarioDao } from '../../dao/UsuarioDao'
import type { Usuario } from '../../model/types'
import { avisarExito } from '../../lib/toast'
import { Button } from '../ui/Button'
import { Campo, Entrada, AlertaDeError } from '../ui/Campo'
import { Modal } from '../ui/Modal'

/**
 * Diálogo para cambiar la contraseña de la sesión actual desde dentro de la
 * aplicación (antes solo era posible cerrando sesión y usando el indicio).
 */
export function CambiarContrasena({
  abierto,
  onCerrar,
  usuario,
}: {
  abierto: boolean
  onCerrar: () => void
  usuario: Usuario | null
}) {
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault()
    setError(null)
    if (!usuario) {
      return
    }
    if (nueva !== confirmacion) {
      setError('Las contraseñas nuevas no coinciden.')
      return
    }
    setCargando(true)
    try {
      const resultado = await new UsuarioController().cambiarContrasena(
        usuario.id,
        actual,
        nueva,
      )
      setCargando(false)
      if (!resultado.exito) {
        setError(resultado.mensaje)
        return
      }
      avisarExito(resultado.mensaje)
      const usuarioActualizado = await new UsuarioDao().buscarPorId(usuario.id)
      if (usuarioActualizado) {
        useSesionStore.getState().iniciarSesion(usuarioActualizado)
      }
      setActual('')
      setNueva('')
      setConfirmacion('')
      onCerrar()
    } catch {
      setCargando(false)
      setError('No se pudo cambiar la contraseña.')
    }
  }

  return (
    <Modal
      abierto={abierto}
      titulo="Cambiar contraseña"
      descripcion={`Establezca una contraseña nueva para ${usuario?.nombre_usuario ?? 'su cuenta'}.`}
      onCerrar={onCerrar}
    >
      <form onSubmit={enviar} className="space-y-4">
        <Campo etiqueta="Contraseña actual" htmlFor="cc-actual">
          <Entrada
            id="cc-actual"
            type="password"
            icono={Key}
            placeholder="Su contraseña actual"
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            autoComplete="current-password"
            autoFocus
            required
          />
        </Campo>
        <Campo
          etiqueta="Nueva contraseña"
          htmlFor="cc-nueva"
          error={
            nueva && nueva.length < 6 ? 'Debe tener al menos 6 caracteres.' : undefined
          }
        >
          <Entrada
            id="cc-nueva"
            type="password"
            icono={Key}
            placeholder="Mínimo 6 caracteres"
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Campo>
        <Campo
          etiqueta="Confirmar contraseña"
          htmlFor="cc-confirmar"
          error={
            confirmacion && nueva !== confirmacion ? 'Las contraseñas no coinciden.' : undefined
          }
        >
          <Entrada
            id="cc-confirmar"
            type="password"
            icono={Key}
            placeholder="Repita la nueva contraseña"
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Campo>
        {error ? <AlertaDeError mensaje={error} /> : null}
        <div className="flex justify-end gap-2 border-t border-zinc-100 pt-4">
          <Button variante="fantasma" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" cargando={cargando}>
            Guardar
          </Button>
        </div>
      </form>
    </Modal>
  )
}