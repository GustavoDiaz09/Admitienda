import type { Producto } from '../model/types'
import { ProductoDao } from '../dao/ProductoDao'
import { Resultado } from './Resultado'
import { aDouble, aInt, acumularErrores, enteroNoNegativo, montoPositivo, textoNoVacio } from '../lib/validaciones'

/** Calcula el precio de venta final (venta indicada o neto + ganancia). */
export function calcularPrecioDeVenta(p: Producto): number {
  return p.precio_venta > 0 ? p.precio_venta : p.precio_neto + p.ganancia
}

/** Indica si el producto tiene stock por debajo de su mínimo. */
export function tieneStockBajo(p: Producto): boolean {
  return p.cantidad_stock < p.stock_minimo
}

/** Indica si el producto está disponible para la venta. */
export function estaDisponible(p: Producto): boolean {
  return p.cantidad_stock > 0
}

/**
 * Controlador de productos (port de `tienda.controller.ProductController`:
 * casos de uso registrar, modificar, eliminar y ver tabla/stock bajo).
 */
export class ProductoController {
  private readonly productoDao = new ProductoDao()

  /** Registra un producto nuevo, validando el formulario. */
  async nuevoProducto(
    tipoDeProducto: string,
    nombreDeProducto: string,
    precioNeto: string,
    ganancia: string,
    precioALaVenta: string,
    cantidadEnStock: string,
    stockMinimo: string,
  ): Promise<Resultado> {
    const errores = this.validarFormulario(
      tipoDeProducto, nombreDeProducto, precioNeto, ganancia,
      precioALaVenta, cantidadEnStock, stockMinimo,
    )
    if (errores.length > 0) {
      return Resultado.error(errores.join('\n'))
    }
    const producto = await this.productoDao.insertar({
      tipo_producto: tipoDeProducto.trim(),
      nombre_producto: nombreDeProducto.trim(),
      precio_neto: aDouble(precioNeto),
      ganancia: aDouble(ganancia),
      precio_venta: aDouble(precioALaVenta),
      cantidad_stock: aInt(cantidadEnStock),
      stock_minimo: aInt(stockMinimo),
    })
    return Resultado.exito(`Producto "${producto.nombre_producto}" registrado.`)
  }

  /** Modifica un producto existente, validando el formulario. */
  async modificarProducto(
    producto: Producto,
    tipoDeProducto: string,
    nombreDeProducto: string,
    precioNeto: string,
    ganancia: string,
    precioALaVenta: string,
    cantidadEnStock: string,
    stockMinimo: string,
  ): Promise<Resultado> {
    const errores = this.validarFormulario(
      tipoDeProducto, nombreDeProducto, precioNeto, ganancia,
      precioALaVenta, cantidadEnStock, stockMinimo,
    )
    if (errores.length > 0) {
      return Resultado.error(errores.join('\n'))
    }
    const existente = await this.productoDao.buscarPorId(producto.id)
    if (!existente) {
      return Resultado.error('El producto ya no existe en el sistema.')
    }
    const actualizado = await this.productoDao.actualizar({
      ...producto,
      tipo_producto: tipoDeProducto.trim(),
      nombre_producto: nombreDeProducto.trim(),
      precio_neto: aDouble(precioNeto),
      ganancia: aDouble(ganancia),
      precio_venta: aDouble(precioALaVenta),
      cantidad_stock: aInt(cantidadEnStock),
      stock_minimo: aInt(stockMinimo),
    })
    return Resultado.exito(`Producto "${actualizado.nombre_producto}" modificado.`)
  }

  /** Elimina un producto (borrado lógico) tras la confirmación. */
  async eliminarProducto(idDeProducto: string): Promise<Resultado> {
    const producto = await this.productoDao.buscarPorId(idDeProducto)
    if (!producto) {
      return Resultado.error('El producto ya no existe.')
    }
    await this.productoDao.eliminar(idDeProducto)
    return Resultado.exito(`Producto "${producto.nombre_producto}" eliminado.`)
  }

  /** Devuelve todos los productos para la tabla de productos. */
  async obtenerProductos(): Promise<Producto[]> {
    return this.productoDao.obtenerTodos()
  }

  /** Devuelve los productos con stock por debajo del mínimo. */
  async obtenerStockBajo(): Promise<Producto[]> {
    return this.productoDao.obtenerStockBajo()
  }

  /** Suma los errores del formulario de producto en un solo arreglo. */
  private validarFormulario(
    tipo: string,
    nombre: string,
    precioNeto: string,
    ganancia: string,
    precioVenta: string,
    stock: string,
    stockMinimo: string,
  ): string[] {
    const errores: string[] = []
    acumularErrores(errores, textoNoVacio(tipo, 'tipo de producto'))
    acumularErrores(errores, textoNoVacio(nombre, 'nombre de producto'))
    acumularErrores(errores, montoPositivo(precioNeto, 'precio neto'))
    acumularErrores(errores, montoPositivo(ganancia, 'ganancia'))
    acumularErrores(errores, montoPositivo(precioVenta, 'precio de venta'))
    acumularErrores(errores, enteroNoNegativo(stock, 'cantidad en stock'))
    acumularErrores(errores, enteroNoNegativo(stockMinimo, 'stock mínimo'))
    return errores
  }
}