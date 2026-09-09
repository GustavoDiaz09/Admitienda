import type { ReactNode } from 'react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { Storefront } from '@phosphor-icons/react'
import { esAdministrador, restaurarSesion, useSesionStore } from './controller/SessionController'
import { TIPO_ADMIN } from './model/types'
import { inicializarApp } from './lib/inicializacion'
import { iniciarMotorDeSync } from './sync/syncEngine'
import { AppShell } from './components/layout/AppShell'
import { Toasts } from './components/ui/Toasts'

/* Rutas divididas por vista para mantener ligero el paquete inicial. */
const Login = lazy(() => import('./views/Login').then((m) => ({ default: m.Login })))
const Registro = lazy(() => import('./views/Registro').then((m) => ({ default: m.Registro })))
const RecuperarContrasena = lazy(() =>
  import('./views/RecuperarContrasena').then((m) => ({ default: m.RecuperarContrasena })),
)
const Productos = lazy(() => import('./views/Productos').then((m) => ({ default: m.Productos })))
const Movimientos = lazy(() =>
  import('./views/Movimientos').then((m) => ({ default: m.Movimientos })),
)
const Resumenes = lazy(() => import('./views/Resumenes').then((m) => ({ default: m.Resumenes })))
const Usuarios = lazy(() => import('./views/Usuarios').then((m) => ({ default: m.Usuarios })))
const Alertas = lazy(() => import('./views/Alertas').then((m) => ({ default: m.Alertas })))

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

/** Página de inicio según el rol (los invitados solo ven productos). */
function Inicio() {
  return esAdministrador() ? (
    <Navigate to="/resumenes" replace />
  ) : (
    <Navigate to="/productos" replace />
  )
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
    <>
      <BrowserRouter>
        <Suspense fallback={<PantallaDeCarga />}>
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
                  <SoloAdministrador>
                    <Movimientos />
                  </SoloAdministrador>
                }
              />
              <Route
                path="resumenes"
                element={
                  <SoloAdministrador>
                    <Resumenes />
                  </SoloAdministrador>
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
        </Suspense>
      </BrowserRouter>
      <Toasts />
    </>
  )
}