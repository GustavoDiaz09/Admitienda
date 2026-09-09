import type { ReactNode } from 'react'
import { useCallback, useEffect, useState } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  CloudArrowDown,
  CloudArrowUp,
  Package,
  ArrowsClockwise,
  Wallet,
  Bell,
} from '@phosphor-icons/react'
import { MovimientoController } from '../controller/MovimientoController'
import { ProductoController } from '../controller/ProductoController'
import { moneda, DIAS_CORTOS, MESES_CORTOS, horaCorta } from '../lib/formato'
import { ejecutarAccionDeSync } from '../lib/syncAcciones'
import { useSyncStore } from '../sync/syncEngine'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { EncabezadoSeccion, Esqueleto } from '../components/ui/Base'
import { cn } from '../lib/cn'

interface DatosResumen {
  semana: number[]
  mes: number[]
  totalIngresos: number
  totalEgresos: number
  productos: number
  stockBajo: number
}

/** Resúmenes financieros semanales y mensuales (solo administrador). */
export function Resumenes() {
  const [datos, setDatos] = useState<DatosResumen | null>(null)
  const { enLinea, pendientes, ultimaSync } = useSyncStore()
  const [accion, setAccion] = useState<'sincronizar' | 'subir' | 'bajar' | null>(null)

  const cargar = useCallback(async () => {
    const movimientos = new MovimientoController()
    const productos = new ProductoController()
    const [semana, mes, totalIngresos, totalEgresos, listaProductos, stockBajo] =
      await Promise.all([
        movimientos.obtenerResumenSemanal(),
        movimientos.obtenerResumenMensual(),
        movimientos.totalIngresos(),
        movimientos.totalEgresos(),
        productos.obtenerProductos(),
        productos.obtenerStockBajo(),
      ])
    setDatos({
      semana: Array.from({ length: 7 }, (_, i) => semana.get(i + 1) ?? 0),
      mes: Array.from({ length: 12 }, (_, i) => mes.get(i + 1) ?? 0),
      totalIngresos,
      totalEgresos,
      productos: listaProductos.length,
      stockBajo: stockBajo.length,
    })
  }, [])

  useEffect(() => {
    void cargar()
    const alRecargar = () => void cargar()
    window.addEventListener('datos:sincronizados', alRecargar)
    return () => window.removeEventListener('datos:sincronizados', alRecargar)
  }, [cargar])

  const ejecutar = async (accionElegida: 'sincronizar' | 'subir' | 'bajar') => {
    setAccion(accionElegida)
    await ejecutarAccionDeSync(accionElegida)
    setAccion(null)
  }

  const saldo = datos ? datos.totalIngresos - datos.totalEgresos : 0

  return (
    <div className="animate-desvanecer space-y-5">
      <EncabezadoSeccion
        titulo="Resúmenes financieros"
        descripcion="Panorama general de la semana, del año y del inventario."
      />

      {datos === null ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Esqueleto key={i} className="h-24 w-full" />
            ))}
          </div>
          <Esqueleto className="h-72 w-full" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Kpi
              etiqueta="Ingresos"
              valor={moneda(datos.totalIngresos)}
              icono={<ArrowDownRight size={16} weight="bold" />}
              tono="esmeralda"
            />
            <Kpi
              etiqueta="Egresos"
              valor={moneda(datos.totalEgresos)}
              icono={<ArrowUpRight size={16} weight="bold" />}
              tono="rojo"
            />
            <Kpi
              etiqueta="Saldo"
              valor={moneda(saldo)}
              icono={<Wallet size={16} weight="bold" />}
              tono={saldo >= 0 ? 'esmeralda' : 'rojo'}
            />
            <Kpi
              etiqueta="Productos"
              valor={String(datos.productos)}
              icono={<Package size={16} weight="bold" />}
              tono="zinc"
            />
            <Kpi
              etiqueta="Stock bajo"
              valor={String(datos.stockBajo)}
              icono={<Bell size={16} weight="bold" />}
              tono={datos.stockBajo > 0 ? 'ambar' : 'zinc'}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="p-5">
              <GrafitoBarras
                titulo="Semana actual"
                valores={datos.semana}
                etiquetas={DIAS_CORTOS}
              />
            </Card>
            <Card className="p-5">
              <GrafitoBarras
                titulo="Año actual"
                valores={datos.mes}
                etiquetas={MESES_CORTOS.slice(1)}
              />
            </Card>
          </div>

          <Card className="p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-base font-semibold tracking-tight text-zinc-900">
                  Sincronización de datos
                </h2>
                <p className="mt-0.5 max-w-lg text-sm text-zinc-500">
                  {enLinea
                    ? 'Los cambios se suben automáticamente a la nube. Use "Subir todo" para respaldar la base completa o "Descargar" en un dispositivo nuevo.'
                    : 'Sin conexión: los cambios quedan guardados localmente y se sincronizarán al recuperar la red.'}
                </p>
                <p className="mt-1.5 text-xs font-medium text-zinc-500">
                  {pendientes > 0
                    ? `${pendientes} cambio(s) pendientes de sincronizar`
                    : 'Sin cambios pendientes'}{' '}
                  · última sincronización: {ultimaSync ? horaCorta(ultimaSync) : 'aún no'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variante="secundario"
                  tamanio="sm"
                  icono={ArrowsClockwise}
                  cargando={accion === 'sincronizar'}
                  disabled={!enLinea}
                  onClick={() => void ejecutar('sincronizar')}
                >
                  Sincronizar cambios
                </Button>
                <Button
                  variante="secundario"
                  tamanio="sm"
                  icono={CloudArrowUp}
                  cargando={accion === 'subir'}
                  disabled={!enLinea}
                  onClick={() => void ejecutar('subir')}
                >
                  Subir todo
                </Button>
                <Button
                  variante="secundario"
                  tamanio="sm"
                  icono={CloudArrowDown}
                  cargando={accion === 'bajar'}
                  disabled={!enLinea}
                  onClick={() => void ejecutar('bajar')}
                >
                  Descargar todo
                </Button>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

function Kpi({
  etiqueta,
  valor,
  icono,
  tono,
}: {
  etiqueta: string
  valor: string
  icono: ReactNode
  tono: 'esmeralda' | 'rojo' | 'ambar' | 'zinc'
}) {
  const iconos = {
    esmeralda: 'bg-emerald-50 text-emerald-600',
    rojo: 'bg-red-50 text-red-500',
    ambar: 'bg-amber-50 text-amber-600',
    zinc: 'bg-zinc-100 text-zinc-500',
  }
  const valores = {
    esmeralda: 'text-emerald-700',
    rojo: 'text-red-600',
    ambar: 'text-amber-700',
    zinc: 'text-zinc-900',
  }
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', iconos[tono])}>
        {icono}
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-zinc-500">{etiqueta}</p>
        <p className={cn('truncate text-lg font-semibold tabular-nums tracking-tight', valores[tono])}>
          {valor}
        </p>
      </div>
    </Card>
  )
}

/** Gráfico de barras CSS puro (positivo esmeralda, negativo rojo). */
function GrafitoBarras({
  titulo,
  valores,
  etiquetas,
}: {
  titulo: string
  valores: number[]
  etiquetas: string[]
}) {
  const maximo = Math.max(...valores.map((valor) => Math.abs(valor)), 1)
  const total = valores.reduce((acumulado, valor) => acumulado + valor, 0)

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-base font-semibold tracking-tight text-zinc-900">{titulo}</h2>
        <span
          className={cn(
            'text-sm font-semibold tabular-nums',
            total >= 0 ? 'text-emerald-700' : 'text-red-600',
          )}
        >
          {moneda(total)}
        </span>
      </div>
      <div className="flex h-32 items-end gap-1 sm:gap-1.5">
        {valores.map((valor, indice) => (
          <div
            key={indice}
            className="group relative flex h-full flex-1 flex-col justify-end"
            title={`${etiquetas[indice]}: ${moneda(valor)}`}
          >
            <span className="pointer-events-none absolute -top-6 left-1/2 z-10 -translate-x-1/2 rounded-md bg-zinc-900 px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-white opacity-0 tabular-nums transition-opacity group-hover:opacity-100">
              {moneda(valor)}
            </span>
            <div
              aria-label={`${etiquetas[indice]}: ${moneda(valor)}`}
              className={cn(
                'w-full rounded-t-md transition-colors',
                valor >= 0 ? 'bg-emerald-500/85 hover:bg-emerald-500' : 'bg-red-400/85 hover:bg-red-400',
              )}
              style={{ height: `${(Math.abs(valor) / maximo) * 100}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-1 border-t border-zinc-100 pt-2 sm:gap-1.5">
        {etiquetas.map((etiqueta, indice) => (
          <span
            key={indice}
            className="flex-1 truncate text-center text-[11px] font-medium text-zinc-500"
          >
            {etiqueta}
          </span>
        ))}
      </div>
    </div>
  )
}