import { Component, useEffect, useState, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { Storefront } from '@phosphor-icons/react'
import { restaurarSesion, useSesionStore } from './controller/SessionController'
import { TIPO_ADMIN } from './model/types'
import { inicializarApp } from './lib/inicializacion'
import { iniciarMotorDeSync } from './sync/syncEngine'
import { AppShell } from './components/layout/AppShell'
import { Toasts } from './components/ui/Toasts'
import { Button } from './components/ui/Button'
import { Login } from './views/Login'
import { Registro } from './views/Registro'
import { RecuperarContrasena } from './views/RecuperarContrasena'
import { Productos } from './views/Productos'
import { Movimientos } from './views/Movimientos'
import { Resumenes } from './views/Resumenes'
import { Usuarios } from './views/Usuarios'
import { Alertas } from './views/Alertas'
import { Deudas } from './views/Deudas'

/** Inicialización única (semilla, sesión restaurada y motor de sync). */
let promesaArranque: Promise<void> | null = null
function iniciarArranque(): Promise<void> {
  if (!promesaArranque) {
    promesaArranque = (async () => {
      await inicializarApp()
      await restaurarSesion()
      iniciarMotorDeSync()
    })()
  }
  return promesaArranque
}

/** Solo permite entrar si existe sesión (usuario o invitado). */
function RequiereSesion() {
  const haySesion = useSesionStore(
    (estado) => estado.usuarioActivo !== null || estado.invitadoActivo,
  )
  if (!haySesion) {
    return <Navigate to="/ingreso" replace />
  }
  return <Outlet />
}

/** Restringe una ruta a administradores. */
function SoloAdministrador({ children }: { children: ReactNode }) {
  const esAdmin = useSesionStore((estado) => estado.usuarioActivo?.tipo_usuario === TIPO_ADMIN)
  if (!esAdmin) {
    return <Navigate to="/productos" replace />
  }
  return <>{children}</>
}

/** Restringe una ruta a usuarios con cuenta (admin o registrado): bloquea invitados. */
function SoloConCuenta({ children }: { children: ReactNode }) {
  const hayCuenta = useSesionStore((estado) => estado.usuarioActivo !== null)
  if (!hayCuenta) {
    return <Navigate to="/productos" replace />
  }
  return <>{children}</>
}

/** Página de inicio según el rol (los invitados solo ven productos). */
function Inicio() {
  const hayCuenta = useSesionStore((estado) => estado.usuarioActivo !== null)
  return <Navigate to={hayCuenta ? '/resumenes' : '/productos'} replace />
}

/** Recoge fallos de render para que nunca quede la pantalla en blanco. */
class LimiteDeErrores extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-zinc-100 p-6 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-red-100 text-red-600">
            <Storefront size={28} weight="bold" />
          </span>
          <div>
            <p className="text-base font-semibold text-zinc-900">Algo salió mal</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-500">
              Ocurrió un error inesperado. La tienda está a salvo en este dispositivo.
            </p>
          </div>
          <Button variante="primario" onClick={() => window.location.reload()}>
            Recargar la aplicación
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}

/** Pantalla de carga mientras se inicializa la base local. */
function PantallaDeCarga() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-zinc-100">
      <span className="grid size-14 place-items-center rounded-2xl bg-emerald-500 text-zinc-950">
        <Storefront size={28} weight="bold" />
      </span>
      <div className="size-5 animate-spin rounded-full border-2 border-zinc-300 border-r-emerald-500" />
      <p className="text-sm font-medium text-zinc-500">Preparando su tienda…</p>
    </div>
  )
}

export default function App() {
  const [listo, setListo] = useState(false)

  useEffect(() => {
    let activo = true
    iniciarArranque()
      .then(() => {
        if (activo) setListo(true)
      })
      .catch(() => {
        if (activo) setListo(true)
      })
    return () => {
      activo = false
    }
  }, [])

  if (!listo) {
    return <PantallaDeCarga />
  }

  return (
    <LimiteDeErrores>
      <BrowserRouter>
        <Routes>
          <Route path="/ingreso" element={<Login />} />
          <Route path="/registro" element={<Registro />} />
          <Route path="/recuperar" element={<RecuperarContrasena />} />
          <Route element={<RequiereSesion />}>
            <Route element={<AppShell />}>
              <Route index element={<Inicio />} />
              <Route path="productos" element={<Productos />} />
              <Route
                path="movimientos"
                element={
                  <SoloConCuenta>
                    <Movimientos />
                  </SoloConCuenta>
                }
              />
              <Route
                path="resumenes"
                element={
                  <SoloConCuenta>
                    <Resumenes />
                  </SoloConCuenta>
                }
              />
              <Route
                path="usuarios"
                element={
                  <SoloAdministrador>
                    <Usuarios />
                  </SoloAdministrador>
                }
              />
              <Route
                path="deudas"
                element={
                  <SoloConCuenta>
                    <Deudas />
                  </SoloConCuenta>
                }
              />
              <Route
                path="alertas"
                element={
                  <SoloAdministrador>
                    <Alertas />
                  </SoloAdministrador>
                }
              />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toasts />
    </LimiteDeErrores>
  )
}