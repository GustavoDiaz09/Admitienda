import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowsClockwise, Bell, Storefront } from '@phosphor-icons/react'
import { ProductoController } from '../controller/ProductoController'
import type { Producto } from '../model/types'
import { actualizarConteoAlertas } from '../lib/conteoAlertas'
import { moneda } from '../lib/formato'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Tabla, Celda, CeldaNumerica } from '../components/ui/Tabla'
import { Insignia } from '../components/ui/Insignia'
import { EncabezadoSeccion, Esqueleto, EstadoVacio } from '../components/ui/Base'
import { ErrorDeCarga } from '../components/ui/ErrorDeCarga'
import { estadoDeProducto } from '../lib/estadoProducto'

/** Alertas de inventario: productos por debajo de su stock mínimo (admin). */
export function Alertas() {
  const [productos, setProductos] = useState<Producto[] | null>(null)
  const [cargando, setCargando] = useState(false)
  const [errorDeCarga, setErrorDeCarga] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      setProductos(await new ProductoController().obtenerStockBajo())
      setErrorDeCarga(null)
      void actualizarConteoAlertas()
    } catch {
      setErrorDeCarga('No se pudo cargar la información. Intente de nuevo.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
    const alRecargar = () => void cargar()
    window.addEventListener('datos:sincronizados', alRecargar)
    return () => window.removeEventListener('datos:sincronizados', alRecargar)
  }, [cargar])

  const agotados = useMemo(
    () => productos?.filter((p) => p.cantidad_stock <= 0).length ?? 0,
    [productos],
  )

  return (
    <div className="animate-desvanecer space-y-5">
      <EncabezadoSeccion
        titulo="Alertas de inventario"
        descripcion="Productos cuyo stock está por debajo del mínimo o agotado."
        acciones={
          <Button
            variante="secundario"
            icono={ArrowsClockwise}
            cargando={cargando}
            onClick={() => void cargar()}
          >
            Actualizar
          </Button>
        }
      />

      <Card>
        {productos === null && errorDeCarga ? (
          <ErrorDeCarga mensaje={errorDeCarga} alReintentar={() => void cargar()} />
        ) : productos === null ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Esqueleto key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : productos.length === 0 ? (
          <EstadoVacio
            icono={<Bell size={24} weight="duotone" />}
            titulo="Todo en orden"
            descripcion="No hay productos por debajo del stock mínimo. Puede seguir operando con tranquilidad."
          />
        ) : (
          <>
            <Tabla encabezados={['Producto', 'Stock actual', 'Stock mínimo', 'Faltan', 'Sugerencia']}>
              {productos.map((p) => {
                const faltan = Math.max(0, p.stock_minimo - p.cantidad_stock)
                const estado = estadoDeProducto(p)
                return (
                  <tr
                    key={p.id}
                    className={
                      p.cantidad_stock <= 0
                        ? 'bg-red-50/70'
                        : 'bg-amber-50/50'
                    }
                  >
                    <Celda>
                      <div className="flex items-center gap-3">
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white text-zinc-500">
                          <Storefront size={16} weight="duotone" />
                        </span>
                        <div>
                          <p className="font-medium text-zinc-900">{p.nombre_producto}</p>
                          <p className="text-xs text-zinc-500">{p.tipo_producto}</p>
                        </div>
                      </div>
                    </Celda>
                    <CeldaNumerica className="font-semibold text-zinc-900">
                      {p.cantidad_stock}
                    </CeldaNumerica>
                    <CeldaNumerica>{p.stock_minimo}</CeldaNumerica>
                    <CeldaNumerica>
                      <Insignia tono={estado.tono}>{faltan}</Insignia>
                    </CeldaNumerica>
                    <Celda>
                      <p className="text-sm text-zinc-600">
                        {p.cantidad_stock <= 0
                          ? `Agotado: compre al menos ${p.stock_minimo} unidades para cubrir el mínimo.`
                          : `Comprar al menos ${faltan} unidades para cubrir el stock mínimo.`}
                      </p>
                    </Celda>
                  </tr>
                )
              })}
            </Tabla>
            <div className="border-t border-zinc-100 px-4 py-3 text-xs font-medium text-zinc-500">
              {productos.length} producto(s) con alerta · {agotados} agotado(s) · valor en riesgo:{' '}
              <b className="tabular-nums text-red-600">
                {moneda(productos.reduce((acumulado, p) => acumulado + (p.cantidad_stock <= 0 ? p.precio_neto : 0), 0))}
              </b>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}