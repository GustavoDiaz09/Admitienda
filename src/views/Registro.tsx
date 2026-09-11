import type { FormEvent } from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ArrowBendDownLeft } from '@phosphor-icons/react'
import { UsuarioController } from '../controller/UsuarioController'
import { AuthShell } from '../components/auth/AuthShell'
import { FormAuthHeader } from '../components/auth/FormAuthHeader'
import { Button } from '../components/ui/Button'
import { Campo, Entrada, AlertaDeError } from '../components/ui/Campo'
import { avisarExito } from '../lib/toast'

/** Registro de nuevo usuario con opción de solicitar permiso de administrador. */
export function Registro() {
  const navegar = useNavigate()
  const [nombre, setNombre] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [indicio, setIndicio] = useState('')
  const [solicitaAdmin, setSolicitaAdmin] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault()
    setError(null)
    if (contrasena !== confirmacion) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setCargando(true)
    try {
      const controlador = new UsuarioController()
      const resultado = await controlador.registrarUsuario(nombre, contrasena, indicio, solicitaAdmin)
      setCargando(false)
      if (!resultado.exito) {
        setError(resultado.mensaje)
        return
      }
      avisarExito(resultado.mensaje)
      navegar('/ingreso')
    } catch {
      setCargando(false)
      setError('No se pudo completar el registro.')
    }
  }

  return (
    <AuthShell>
      <FormAuthHeader titulo="Crear cuenta" subtitulo="Regístrese para acceder a la gestión." />
      <form onSubmit={enviar} className="space-y-4">
        <Campo etiqueta="Nombre de usuario" htmlFor="reg-usuario">
          <Entrada
            id="reg-usuario"
            placeholder="Cómo se identificará al iniciar sesión"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            autoFocus
            autoComplete="username"
            required
          />
        </Campo>
        <Campo
          etiqueta="Contraseña"
          htmlFor="reg-clave"
          error={contrasena && contrasena.length < 6 ? 'Debe tener al menos 6 caracteres.' : undefined}
        >
          <Entrada
            id="reg-clave"
            type="password"
            placeholder="Mínimo 6 caracteres"
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Campo>
        <Campo
          etiqueta="Confirmar contraseña"
          htmlFor="reg-clave2"
          error={confirmacion && contrasena !== confirmacion ? 'Las contraseñas no coinciden.' : undefined}
        >
          <Entrada
            id="reg-clave2"
            type="password"
            placeholder="Repita la contraseña"
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Campo>
        <Campo
          etiqueta="Palabras clave de seguridad"
          htmlFor="reg-indicio"
          ayuda="Escriba una o varias palabras que solo usted conozca y que le ayuden a recordar su contraseña si alguna vez la olvida. Elíjalas de modo que no sean fáciles de adivinar: evite su nombre, fechas de nacimiento u otros datos personales obvios, así su cuenta estará mejor protegida."
        >
          <Entrada
            id="reg-indicio"
            placeholder="Palabras que solo usted conozca, p. ej. su comida y lugar favoritos"
            value={indicio}
            onChange={(e) => setIndicio(e.target.value)}
            required
          />
        </Campo>
        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-3">
          <input
            type="checkbox"
            checked={solicitaAdmin}
            onChange={(e) => setSolicitaAdmin(e.target.checked)}
            className="mt-0.5 size-4 rounded border-zinc-300 accent-emerald-600"
          />
          <span className="text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Solicitar permiso de administrador</span>
            <br />
            <span className="text-zinc-500">
              Podrá gestionar productos, movimientos y usuarios una vez aprobado.
            </span>
          </span>
        </label>
        {error ? <AlertaDeError mensaje={error} /> : null}
        <Button type="submit" cargando={cargando} className="w-full" icono={Check}>
          Registrarse
        </Button>
      </form>
      <div className="mt-4">
        <Button variante="fantasma" onClick={() => navegar('/ingreso')} icono={ArrowBendDownLeft}>
          Volver al inicio de sesión
        </Button>
      </div>
    </AuthShell>
  )
}