import type { FormEvent } from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Key, User as UserIcon } from '@phosphor-icons/react'
import { useSesionStore } from '../controller/SessionController'
import { UsuarioController } from '../controller/UsuarioController'
import { AuthShell } from '../components/auth/AuthShell'
import { FormAuthHeader } from '../components/auth/FormAuthHeader'
import { Button } from '../components/ui/Button'
import { Campo, Entrada } from '../components/ui/Campo'
import { avisarExito } from '../lib/toast'

/** Pantalla de inicio de sesión (pública). */
export function Login() {
  const navegar = useNavigate()
  const iniciarSesion = useSesionStore((estado) => estado.iniciarSesion)
  const entrarComoInvitado = useSesionStore((estado) => estado.entrarComoInvitado)

  const [nombre, setNombre] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const entrar = async (evento: FormEvent) => {
    evento.preventDefault()
    setError(null)
    setCargando(true)
    try {
      const controlador = new UsuarioController()
      const usuario = await controlador.iniciarSesion(nombre, contrasena)
      if (!usuario) {
        setCargando(false)
        setError('Usuario o contraseña incorrectos.')
        return
      }
      iniciarSesion(usuario)
      avisarExito(`Bienvenido, ${usuario.nombre_usuario}.`)
      navegar('/')
    } catch {
      setCargando(false)
      setError('No se pudo iniciar sesión. Intente de nuevo.')
    }
  }

  const entrarInvitado = () => {
    entrarComoInvitado()
    navegar('/')
  }

  return (
    <AuthShell>
      <FormAuthHeader titulo="Iniciar sesión" subtitulo="Acceda a la gestión de su tienda." />
      <form onSubmit={entrar} className="space-y-4">
        <Campo etiqueta="Nombre de usuario" htmlFor="login-usuario">
          <Entrada
            id="login-usuario"
            icono={UserIcon}
            placeholder="p. ej. admin"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </Campo>
        <Campo etiqueta="Contraseña" htmlFor="login-clave">
          <Entrada
            id="login-clave"
            type="password"
            icono={Key}
            placeholder="••••••••"
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Campo>
        {error ? (
          <p role="alert" className="text-sm font-medium text-red-600">
            {error}
          </p>
        ) : null}
        <Button type="submit" cargando={cargando} className="w-full">
          Iniciar sesión
        </Button>
      </form>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variante="secundario" onClick={() => navegar('/registro')}>
          Registrarse
        </Button>
        <Button variante="secundario" onClick={() => navegar('/recuperar')}>
          Olvidó su contraseña
        </Button>
      </div>
      <div className="mt-3">
        <Button variante="fantasma" onClick={entrarInvitado} className="w-full">
          Entrar como invitado
        </Button>
      </div>
      <p className="mt-6 text-center text-xs text-zinc-400">
        Credenciales de acceso inicial: <span className="font-medium">admin</span> /{' '}
        <span className="font-medium">admin123</span>
      </p>
    </AuthShell>
  )
}