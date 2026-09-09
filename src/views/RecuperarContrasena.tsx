import type { FormEvent } from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowBendDownLeft, ArrowRight, Check, Key, User as UserIcon } from '@phosphor-icons/react'
import { UsuarioController } from '../controller/UsuarioController'
import { AuthShell } from '../components/auth/AuthShell'
import { FormAuthHeader } from '../components/auth/FormAuthHeader'
import { Button } from '../components/ui/Button'
import { Campo, Entrada, AlertaDeError } from '../components/ui/Campo'
import { avisarExito } from '../lib/toast'

/** Flujo de recuperación de contraseña por indicio de seguridad (3 pasos). */
export function RecuperarContrasena() {
  const navegar = useNavigate()
  const [paso, setPaso] = useState(1)
  const [nombre, setNombre] = useState('')
  const [indicio, setIndicio] = useState('')
  const [nuevaContrasena, setNuevaContrasena] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const verificarUsuario = async (evento: FormEvent) => {
    evento.preventDefault()
    setError(null)
    setCargando(true)
    try {
      const controlador = new UsuarioController()
      if (!(await controlador.existeUsuario(nombre))) {
        setError('No se encontró un usuario con ese nombre.')
        return
      }
      setPaso(2)
    } catch {
      setError('No se pudo verificar el usuario.')
    } finally {
      setCargando(false)
    }
  }

  const verificarIndicio = async (evento: FormEvent) => {
    evento.preventDefault()
    setError(null)
    setCargando(true)
    try {
      const controlador = new UsuarioController()
      if (!(await controlador.verificarIndicio(nombre, indicio))) {
        setError('El indicio no es correcto o el usuario no existe.')
        return
      }
      setPaso(3)
    } catch {
      setError('No se pudo verificar el indicio.')
    } finally {
      setCargando(false)
    }
  }

  const restablecer = async (evento: FormEvent) => {
    evento.preventDefault()
    setError(null)
    if (nuevaContrasena !== confirmacion) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setCargando(true)
    try {
      const controlador = new UsuarioController()
      const resultado = await controlador.restablecerContrasena(nombre, indicio, nuevaContrasena)
      setCargando(false)
      if (!resultado.exito) {
        setError(resultado.mensaje)
        return
      }
      avisarExito('Contraseña restablecida correctamente. Ya puede iniciar sesión.')
      navegar('/ingreso')
    } catch {
      setCargando(false)
      setError('No se pudo restablecer la contraseña.')
    }
  }

  const titulo = paso === 1
    ? 'Recuperar acceso'
    : paso === 2
      ? 'Verificar identidad'
      : 'Establecer nueva contraseña'

  return (
    <AuthShell>
      <FormAuthHeader
        titulo={titulo}
        subtitulo={
          paso === 1
            ? 'Escriba el nombre de usuario para comenzar.'
            : paso === 2
              ? 'Responda la pregunta de seguridad para su cuenta.'
              : 'Escriba la nueva contraseña para su cuenta.'
        }
      />

      {paso === 1 ? (
        <form onSubmit={verificarUsuario} className="space-y-4">
          <Campo etiqueta="Nombre de usuario" htmlFor="rec-usuario">
            <Entrada
              id="rec-usuario"
              icono={UserIcon}
              placeholder="p. ej. admin"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              autoFocus
              autoComplete="username"
              required
            />
          </Campo>
          {error ? <AlertaDeError mensaje={error} /> : null}
          <Button type="submit" cargando={cargando} className="w-full" icono={ArrowRight}>
            Siguiente
          </Button>
        </form>
      ) : paso === 2 ? (
        <form onSubmit={verificarIndicio} className="space-y-4">
          <Campo etiqueta="Indicio de seguridad" htmlFor="rec-indicio">
            <Entrada
              id="rec-indicio"
              icono={Key}
              placeholder="La respuesta que registró"
              value={indicio}
              onChange={(e) => setIndicio(e.target.value)}
              autoFocus
              required
            />
          </Campo>
          {error ? <AlertaDeError mensaje={error} /> : null}
          <div className="grid grid-cols-2 gap-2">
            <Button variante="fantasma" onClick={() => setPaso(1)} icono={ArrowBendDownLeft}>
              Atrás
            </Button>
            <Button type="submit" cargando={cargando} icono={ArrowRight}>
              Continuar
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={restablecer} className="space-y-4">
          <Campo
            etiqueta="Nueva contraseña"
            htmlFor="rec-nueva"
            error={
              nuevaContrasena && nuevaContrasena.length < 6
                ? 'Debe tener al menos 6 caracteres.'
                : undefined
            }
          >
            <Entrada
              id="rec-nueva"
              type="password"
              icono={Key}
              placeholder="Mínimo 6 caracteres"
              value={nuevaContrasena}
              onChange={(e) => setNuevaContrasena(e.target.value)}
              autoComplete="new-password"
              autoFocus
              required
            />
          </Campo>
          <Campo
            etiqueta="Confirmar contraseña"
            htmlFor="rec-confirmar"
            error={
              confirmacion && nuevaContrasena !== confirmacion
                ? 'Las contraseñas no coinciden.'
                : undefined
            }
          >
            <Entrada
              id="rec-confirmar"
              type="password"
              icono={Key}
              placeholder="Repita la contraseña"
              value={confirmacion}
              onChange={(e) => setConfirmacion(e.target.value)}
              autoComplete="new-password"
              required
            />
          </Campo>
          {error ? <AlertaDeError mensaje={error} /> : null}
          <div className="grid grid-cols-2 gap-2">
            <Button variante="fantasma" onClick={() => setPaso(2)} icono={ArrowBendDownLeft}>
              Atrás
            </Button>
            <Button type="submit" cargando={cargando} icono={Check}>
              Guardar
            </Button>
          </div>
        </form>
      )}

      <div className="mt-4">
        <Button variante="fantasma" onClick={() => navegar('/ingreso')} className="w-full">
          Volver al inicio de sesión
        </Button>
      </div>
    </AuthShell>
  )
}