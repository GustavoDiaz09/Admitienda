import { db } from '../lib/db'
import { nuevoRegistro, actualizarRegistro, eliminarRegistro } from '../lib/mutaciones'
import type { Producto, RegistroBase } from '../model/types'

/**
 * Acceso a datos de productos (port de `tienda.dao.ProductDao`).
 * Encapsula la lectura y escritura de la tabla local `productos`;
 * ninguna otra capa conoce los detalles de IndexedDB.
 */
export class ProductoDao {
  /** Registra un producto nuevo y lo encola para sincronizar. */
  async insertar(datos: Omit<Producto, keyof RegistroBase>): Promise<Producto> {
    return nuevoRegistro('productos', datos)
  }

  /** Modifica un producto existente y encola el cambio. */
  async actualizar(producto: Producto): Promise<Producto> {
    return actualizarRegistro('productos', producto)
  }

  /** Borrado lógico de un producto (se propaga vía sincronización). */
  async eliminar(idDeProducto: string): Promise<void> {
    const producto = await this.buscarPorId(idDeProducto)
    if (producto) {
      await eliminarRegistro('productos', producto)
    }
  }

  /** Busca un producto activo por su id. */
  async buscarPorId(idDeProducto: string): Promise<Producto | undefined> {
    const producto = await db.productos.get(idDeProducto)
    return producto && !producto.eliminado ? producto : undefined
  }

  /** Devuelve los productos activos ordenados por nombre. */
  async obtenerTodos(): Promise<Producto[]> {
    const lista = await db.productos.toArray()
    return lista
      .filter((p) => !p.eliminado)
      .sort((a, b) => a.nombre_producto.localeCompare(b.nombre_producto))
  }

  /** Productos con stock por debajo de su mínimo (alimenta las alertas). */
  async obtenerStockBajo(): Promise<Producto[]> {
    const lista = await this.obtenerTodos()
    return lista
      .filter((p) => p.cantidad_stock < p.stock_minimo)
      .sort((a, b) => a.nombre_producto.localeCompare(b.nombre_producto))
  }

  /** Cuenta los productos activos. */
  async contar(): Promise<number> {
    const lista = await db.productos.toArray()
    return lista.filter((p) => !p.eliminado).length
  }
}