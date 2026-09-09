import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  ArrowsLeftRight,
  BellRinging,
  ChartBar,
  HandCoins,
  List,
  Package,
  ShieldCheck,
  SignOut,
  Storefront,
  UserCircle,
  X,
} from '@phosphor-icons/react'
import { useSesionStore } from '../../controller/SessionController'
import { UsuarioController } from '../../controller/UsuarioController'
import { TIPO_ADMIN, TIPO_REGISTRADO } from '../../model/types'
import { actualizarConteoAlertas, useAlertasStore } from '../../lib/conteoAlertas'
import { avisarError, avisarExito } from '../../lib/toast'
import { cn } from '../../lib/cn'
import { Button } from '../ui/Button'
import { SyncIndicator } from './SyncIndicator'

const TITULOS: Record<string, string> = {
  '/resumenes': 'Resúmenes financieros',
  '/productos': 'Tabla de productos',
  '/movimientos': 'Ingresos y egresos',
  '/deudas': 'Deudas y pagos',
  '/usuarios': 'Gestión de usuarios',
  '/alertas': 'Alertas de inventario',
}

const ITEMS: Array<{
  ruta: string
  etiqueta: string
  icono: typeof Package
  soloAdmin?: boolean
}> = [
  { ruta: '/resumenes', etiqueta: 'Resúmenes', icono: ChartBar, soloAdmin: true },
  { ruta: '/productos', etiqueta: 'Productos', icono: Package },
  { ruta: '/movimientos', etiqueta: 'Ingresos y egresos', icono: ArrowsLeftRight, soloAdmin: true },
  { ruta: '/deudas', etiqueta: 'Deudas y pagos', icono: HandCoins, soloAdmin: true },
  { ruta: '/usuarios', etiqueta: 'Usuarios', icono: UserCircle, soloAdmin: true },
  { ruta: '/alertas', etiqueta: 'Alertas', icono: BellRinging, soloAdmin: true },
]

/** Accesos rápidos del hub inferior para dispositivos móviles. */
const HUB_MOVILES: Array<{
  ruta: string
  etiqueta: string
  icono: typeof Package
  soloAdmin?: boolean
}> = [
  { ruta: '/resumenes', etiqueta: 'Resumen', icono: ChartBar, soloAdmin: true },
  { ruta: '/productos', etiqueta: 'Productos', icono: Package },
  { ruta: '/movimientos', etiqueta: 'Ingresos', icono: ArrowsLeftRight, soloAdmin: true },
  { ruta: '/deudas', etiqueta: 'Deudas', icono: HandCoins, soloAdmin: true },
]

/** Contenido de la barra lateral (compartido entre escritorio y modal móvil). */
export function AppShell() {
  const usuarioActivo = useSesionStore((estado) => estado.usuarioActivo)
  const cerrarSesion = useSesionStore((estado) => estado.cerrarSesion)
  const contarAlertas = useAlertasStore((estado) => estado.count)
  const { pathname } = useLocation()
  const [menuAbierto, setMenuAbierto] = useState(false)

  const esAdmin = usuarioActivo?.tipo_usuario === TIPO_ADMIN
  const esRegistrado = usuarioActivo?.tipo_usuario === TIPO_REGISTRADO

  useEffect(() => {
    void actualizarConteoAlertas()
    const alRecargar = () => void actualizarConteoAlertas()
    window.addEventListener('datos:sincronizados', alRecargar)
    return () => window.removeEventListener('datos:sincronizados', alRecargar)
  }, [])

  const solicitarPermiso = async () => {
    if (!usuarioActivo) return
    const resultado = await new UsuarioController().solicitarPermisoAdministrador(usuarioActivo.id)
    if (resultado.exito) {
      avisarExito(resultado.mensaje)
    } else {
      avisarError(resultado.mensaje)
    }
  }

  const itemsVisibles = ITEMS.filter((item) => !item.soloAdmin || esAdmin)
  const hubMovilVisible = HUB_MOVILES.filter((item) => !item.soloAdmin || esAdmin)

  const barraLateral = (cerrar: () => void) => (
    <div className="flex h-full flex-col bg-zinc-950">
      <div className="flex h-16 shrink-0 items-center gap-2.5 px-5">
        <span className="grid size-9 place-items-center rounded-xl bg-emerald-500 text-zinc-950">
          <Storefront size={20} weight="bold" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold leading-tight text-white">
            AdmiTienda
          </p>
          <p className="text-[11px] text-zinc-400">Punto de venta libre</p>
        </div>
        <button
          type="button"
          onClick={cerrar}
          aria-label="Cerrar menú"
          className="focus-ring ml-auto rounded-full p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white lg:hidden"
        >
          <X size={18} weight="bold" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {itemsVisibles.map((item) => (
          <NavLink
            key={item.ruta}
            to={item.ruta}
            onClick={cerrar}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100',
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icono size={19} weight={isActive ? 'fill' : 'regular'} />
                <span className="truncate">{item.etiqueta}</span>
                {item.ruta === '/alertas' && contarAlertas > 0 ? (
                  <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                    {contarAlertas}
                  </span>
                ) : null}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/5 p-3">
        <button
          type="button"
          onClick={() => {
            cerrar()
            cerrarSesion()
          }}
          className="focus-ring flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
        >
          <SignOut size={19} weight="regular" />
          Cerrar sesión
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-[100dvh] bg-zinc-100">
      {/* Barra lateral fija (escritorio). */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 lg:block">
        {barraLateral(() => undefined)}
      </aside>

      {/* Vista en móvil. */}
      <div className="lg:pl-72">
        <div
          className={cn(
            'fixed inset-0 z-40 bg-zinc-950/40 transition-opacity lg:hidden',
            menuAbierto ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
          onClick={() => setMenuAbierto(false)}
          aria-hidden="true"
        />
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-200 lg:hidden',
            menuAbierto ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          {barraLateral(() => setMenuAbierto(false))}
        </aside>

        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-zinc-200 bg-white/85 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            onClick={() => setMenuAbierto(true)}
            aria-label="Abrir menú"
            className="focus-ring rounded-full p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 lg:hidden"
          >
            <List size={20} weight="bold" />
          </button>
          <h1 className="min-w-0 truncate text-base font-semibold tracking-tight text-zinc-900 sm:text-lg">
            {TITULOS[pathname] ?? 'AdmiTienda'}
          </h1>

          <div className="ml-auto flex items-center gap-2">
            <SyncIndicator />

            {esRegistrado ? (
              <Button variante="secundario" tamanio="sm" icono={ShieldCheck} onClick={solicitarPermiso}>
                <span className="hidden md:inline">Solicitar permiso de administrador</span>
                <span className="md:hidden">Solicitar permiso</span>
              </Button>
            ) : null}

            <span className="hidden items-center gap-2 rounded-full border border-zinc-200 bg-white py-1 pl-1 pr-3 sm:inline-flex">
              <span className="grid size-6 place-items-center rounded-full bg-emerald-100 font-semibold text-emerald-700">
                {(usuarioActivo?.nombre_usuario ?? 'I').charAt(0).toUpperCase()}
              </span>
              <span className="text-xs font-medium text-zinc-700">
                {usuarioActivo?.nombre_usuario ?? 'Invitado'}
              </span>
              {usuarioActivo ? (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                    esAdmin ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-500',
                  )}
                >
                  {esAdmin ? 'ADMIN' : 'REGISTRADO'}
                </span>
              ) : null}
            </span>

            <button
              type="button"
              onClick={cerrarSesion}
              aria-label="Cerrar sesión"
              className="focus-ring rounded-full p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
            >
              <SignOut size={18} weight="bold" />
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1200px] px-4 pb-24 pt-6 sm:px-6 sm:py-8 lg:px-8 lg:pb-8">
          <Outlet />
        </main>
      </div>

      {/* Hub de navegación inferior (solo móvil/tableta). */}
      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <div className="grid grid-cols-4">
          {hubMovilVisible.map((item) => (
            <NavLink
              key={item.ruta}
              to={item.ruta}
              className={({ isActive }) =>
                cn(
                  'relative flex flex-col items-center gap-1 py-2.5 pt-3 text-[11px] font-medium transition-colors',
                  isActive ? 'text-emerald-600' : 'text-zinc-400 hover:text-zinc-700',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive ? (
                    <span className="absolute top-0 h-0.5 w-10 rounded-full bg-emerald-500" />
                  ) : null}
                  <item.icono size={22} weight={isActive ? 'fill' : 'regular'} />
                  <span className="leading-none">{item.etiqueta}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

/** Aviso cuando el invitado entra: solo ve la tabla de productos. */
export function AvisoInvitado() {
  const invitadoActivo = useSesionStore((estado) => estado.invitadoActivo)
  if (!invitadoActivo) return null
  return (
    <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
      Está navegando como invitado: puede consultar los productos, pero no modificar datos.
    </p>
  )
}