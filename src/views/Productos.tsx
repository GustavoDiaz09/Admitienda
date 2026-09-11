import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { MagnifyingGlass, Package, Pencil, Plus, Trash, Storefront } from '@phosphor-icons/react'
import { useSesionStore } from '../controller/SessionController'
import { ProductoController, calcularPrecioDeVenta } from '../controller/ProductoController'
import { TIPO_ADMIN } from '../model/types'
import type { Producto } from '../model/types'
import { actualizarConteoAlertas } from '../lib/conteoAlertas'
import { moneda } from '../lib/formato'
import { avisarError, avisarExito } from '../lib/toast'
import { Button } from '../components/ui/Button'
import { Campo, Entrada, AlertaDeError } from '../components/ui/Campo'
import { Insignia } from '../components/ui/Insignia'
import { Card } from '../components/ui/Card'
import { Modal } from '../components/ui/Modal'
import { Tabla, Celda, CeldaNumerica } from '../components/ui/Tabla'
import { ConfirmButton } from '../components/ui/ConfirmButton'
import { EncabezadoSeccion, Esqueleto, EstadoVacio } from '../components/ui/Base'
import { ErrorDeCarga } from '../components/ui/ErrorDeCarga'
import { AvisoInvitado } from '../components/layout/AppShell'

import { estadoDeProducto } from '../lib/estadoProducto'

/** Vista de la tabla de productos (CRUD solo administrador). */
export function Productos() {
  const esAdmin = useSesionStore((estado) => estado.usuarioActivo?.tipo_usuario) === TIPO_ADMIN
  const [productos, setProductos] = useState<Producto[] | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [edicion, setEdicion] = useState<Producto | null | 'nuevo'>(null)
  const [errorDeCarga, setErrorDeCarga] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      setProductos(await new ProductoController().obtenerProductos())
      setErrorDeCarga(null)
    } catch {
      setErrorDeCarga('No se pudo cargar la información. Intente de nuevo.')
    }
    void actualizarConteoAlertas()
  }, [])

  useEffect(() => {
    void cargar()
    const alRecargar = () => void cargar()
    window.addEventListener('datos:sincronizados', alRecargar)
    return () => window.removeEventListener('datos:sincronizados', alRecargar)
  }, [cargar])

  const filtrados = useMemo(() => {
    if (!productos) return []
    const texto = busqueda.trim().toLowerCase()
    if (!texto) return productos
    return productos.filter(
      (p) =>
        p.nombre_producto.toLowerCase().includes(texto) ||
        p.tipo_producto.toLowerCase().includes(texto),
    )
  }, [productos, busqueda])

  const stockBajo = useMemo(
    () => (productos ?? []).filter((p) => p.cantidad_stock < p.stock_minimo).length,
    [productos],
  )

  return (
    <div className="animate-desvanecer space-y-5">
      <AvisoInvitado />
      <EncabezadoSeccion
        titulo="Tabla de productos"
        descripcion="Inventario de la tienda con precios, stock y alertas por mínimos."
        acciones={
          esAdmin ? (
            <Button icono={Plus} onClick={() => setEdicion('nuevo')}>
              Nuevo producto
            </Button>
          ) : undefined
        }
      />

      <Card>
        <div className="flex items-center gap-3 border-b border-zinc-100 px-4 py-3">
          <div className="relative w-full max-w-xs">
            <MagnifyingGlass className="pointer-events-none absolute inset-y-0 left-3 my-auto size-4 text-zinc-400" weight="regular" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o tipo…"
              aria-label="Buscar productos"
              className="campo-base pl-9"
            />
          </div>
          {productos && (
            <span className="ml-auto hidden text-xs font-medium text-zinc-500 sm:inline">
              {productos.length} productos · {stockBajo} con stock bajo
            </span>
          )}
        </div>

        {productos === null && errorDeCarga ? (
          <ErrorDeCarga mensaje={errorDeCarga} alReintentar={() => void cargar()} />
        ) : productos === null ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Esqueleto key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : filtrados.length === 0 ? (
          <EstadoVacio
            icono={<Package size={24} weight="duotone" />}
            titulo={productos.length === 0 ? 'Sin productos registrados' : 'Sin resultados'}
            descripcion={
              productos.length === 0
                ? 'Registre su primer producto con el botón "Nuevo producto".'
                : 'No hay productos que coincidan con su búsqueda.'
            }
            accion={esAdmin ? <Button icono={Plus} onClick={() => setEdicion('nuevo')}>Nuevo producto</Button> : undefined}
          />
        ) : (
          <Tabla encabezados={['Producto', 'Precio venta', 'Precio neto', 'Ganancia', 'Stock', 'St. mín', 'Estado', ...(esAdmin ? [''] : [])]}>
            {filtrados.map((p) => {
              const estado = estadoDeProducto(p)
              const resaltada =
                p.cantidad_stock <= 0
                  ? 'bg-red-50/70'
                  : p.cantidad_stock < p.stock_minimo
                    ? 'bg-amber-50/50'
                    : 'hover:bg-zinc-50/80'
              return (
                <tr key={p.id} className={resaltada}>
                  <Celda>
                    <div className="flex items-center gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-500">
                        <Storefront size={16} weight="duotone" />
                      </span>
                      <div>
                        <p className="font-medium text-zinc-900">{p.nombre_producto}</p>
                        <p className="text-xs text-zinc-500">{p.tipo_producto}</p>
                      </div>
                    </div>
                  </Celda>
                  <CeldaNumerica className="font-semibold text-zinc-900">
                    {moneda(calcularPrecioDeVenta(p))}
                  </CeldaNumerica>
                  <CeldaNumerica>{moneda(p.precio_neto)}</CeldaNumerica>
                  <CeldaNumerica>{moneda(p.ganancia)}</CeldaNumerica>
                  <CeldaNumerica className={p.cantidad_stock <= 0 ? 'font-semibold text-red-600' : undefined}>
                    {p.cantidad_stock}
                  </CeldaNumerica>
                  <CeldaNumerica className="text-zinc-500">{p.stock_minimo}</CeldaNumerica>
                  <Celda>
                    <Insignia tono={estado.tono}>{estado.texto}</Insignia>
                  </Celda>
                  {esAdmin ? (
                    <Celda className="text-right">
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          onClick={() => setEdicion(p)}
                          aria-label={`Modificar ${p.nombre_producto}`}
                          className="focus-ring rounded-full p-2 text-zinc-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600"
                        >
                          <Pencil size={16} weight="bold" />
                        </button>
                        <ConfirmButton
                          accion={<Trash size={14} weight="bold" />}
                          titulo="Eliminar producto"
                          mensaje={
                            <>
                              ¿Desea eliminar <b>{p.nombre_producto}</b>? Esta acción se
                              propagará a los demás dispositivos al sincronizar.
                            </>
                          }
                          confirmar={async () => {
                            const resultado = await new ProductoController().eliminarProducto(p.id)
                            if (resultado.exito) {
                              avisarExito(resultado.mensaje)
                              await cargar()
                            } else {
                              avisarError(resultado.mensaje)
                            }
                          }}
                        />
                      </div>
                    </Celda>
                  ) : null}
                </tr>
              )
            })}
          </Tabla>
        )}

        {productos && productos.length > 0 ? (
          <div className="flex items-center gap-4 border-t border-zinc-100 px-4 py-3 text-xs font-medium text-zinc-500">
            <span>Total: {productos.length} productos</span>
            {stockBajo > 0 ? (
              <span className="text-amber-600">{stockBajo} con stock bajo</span>
            ) : null}
          </div>
        ) : null}
      </Card>

      <FormularioProducto
        producto={edicion === 'nuevo' ? null : edicion}
        abierto={edicion !== null}
        onCerrar={() => setEdicion(null)}
        onGuardado={async () => {
          setEdicion(null)
          await cargar()
        }}
      />
    </div>
  )
}

function FormularioProducto({
  producto,
  abierto,
  onCerrar,
  onGuardado,
}: {
  producto: Producto | null
  abierto: boolean
  onCerrar: () => void
  onGuardado: () => Promise<void>
}) {
  const esEdicion = producto !== null
  const [tipo, setTipo] = useState(producto?.tipo_producto ?? '')
  const [nombre, setNombre] = useState(producto?.nombre_producto ?? '')
  const [precioNeto, setPrecioNeto] = useState(producto ? String(producto.precio_neto) : '')
  const [ganancia, setGanancia] = useState(producto ? String(producto.ganancia) : '')
  const [precioVenta, setPrecioVenta] = useState(producto ? String(producto.precio_venta) : '')
  const [stock, setStock] = useState(producto ? String(producto.cantidad_stock) : '0')
  const [stockMinimo, setStockMinimo] = useState(producto ? String(producto.stock_minimo) : '0')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault()
    setError(null)
    setCargando(true)
    try {
      const controlador = new ProductoController()
      const precioVentaFinal = precioVenta.trim() === '' ? '0' : precioVenta
      const resultado = esEdicion
        ? await controlador.modificarProducto(
            producto as Producto, tipo, nombre, precioNeto, ganancia, precioVentaFinal, stock, stockMinimo,
          )
        : await controlador.nuevoProducto(
            tipo, nombre, precioNeto, ganancia, precioVentaFinal, stock, stockMinimo,
          )
      setCargando(false)
      if (!resultado.exito) {
        setError(resultado.mensaje)
        return
      }
      avisarExito(resultado.mensaje)
      onCerrar()
      await onGuardado()
    } catch {
      setCargando(false)
      setError('No se pudo guardar el producto.')
    }
  }

  return (
    <Modal
      abierto={abierto}
      titulo={esEdicion ? 'Modificar producto' : 'Registrar producto'}
      descripcion="Complete los datos del producto de la tienda."
      onCerrar={onCerrar}
    >
      <form onSubmit={enviar} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Campo etiqueta="Tipo de producto" htmlFor="prod-tipo">
            <Entrada
              id="prod-tipo"
              placeholder="p. ej. Granos y abarrotes"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              required
              autoFocus
            />
          </Campo>
          <Campo etiqueta="Nombre del producto" htmlFor="prod-nombre">
            <Entrada
              id="prod-nombre"
              placeholder="p. ej. Arroz blanco x500g"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
            />
          </Campo>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Campo etiqueta="Precio neto" htmlFor="prod-neto">
            <Entrada id="prod-neto" inputMode="decimal" placeholder="0" value={precioNeto} onChange={(e) => setPrecioNeto(e.target.value)} required />
          </Campo>
          <Campo etiqueta="Ganancia" htmlFor="prod-ganancia">
            <Entrada id="prod-ganancia" inputMode="decimal" placeholder="0" value={ganancia} onChange={(e) => setGanancia(e.target.value)} required />
          </Campo>
          <Campo
            etiqueta="Precio de venta"
            htmlFor="prod-venta"
            ayuda="Déjelo en 0 para calcularlo como neto + ganancia."
          >
            <Entrada id="prod-venta" inputMode="decimal" placeholder="0" value={precioVenta} onChange={(e) => setPrecioVenta(e.target.value)} />
          </Campo>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Campo etiqueta="Cantidad en stock" htmlFor="prod-stock">
<Entrada id="prod-stock" inputMode="numeric" min="0" placeholder="0" value={stock} onChange={(e) => setStock(e.target.value)} required />
            </Campo>
            <Campo etiqueta="Stock mínimo" htmlFor="prod-stockmin" ayuda="Avisa cuando el stock esté por debajo.">
            <Entrada id="prod-stockmin" inputMode="numeric" min="0" placeholder="0" value={stockMinimo} onChange={(e) => setStockMinimo(e.target.value)} required />
          </Campo>
        </div>
        {error ? <AlertaDeError mensaje={error} /> : null}
        <div className="flex justify-end gap-2 border-t border-zinc-100 pt-4">
          <Button variante="fantasma" onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" cargando={cargando}>
            {esEdicion ? 'Guardar cambios' : 'Registrar producto'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}