import { db } from '../lib/db'
import { formatFecha } from '../lib/fecha'
import { ProductoController } from '../controller/ProductoController'
import { UsuarioController } from '../controller/UsuarioController'
import { MovimientoDao } from '../dao/MovimientoDao'
import { TIPO_INGRESO_TEXTO, TIPO_EGRESO_TEXTO } from './constantes'
import type { Movimiento } from '../model/types'

/** Credenciales del administrador inicial (iguales a la app de escritorio). */
export const ADMIN_INICIAL_USUARIO = 'admin'
export const ADMIN_INICIAL_CONTRASENA = 'admin123'
export const ADMIN_INICIAL_INDICIO = 'Tienda'

/** Productos de ejemplo: tipo, nombre, costo, venta, stock, stock mínimo (COP). */
const PRODUCTOS: ReadonlyArray<readonly [string, string, number, number, number, number]> = [
  ['Granos y abarrotes', 'Arroz blanco x500g', 2400, 2900, 40, 12],
  ['Granos y abarrotes', 'Frijol rojo x500g', 3700, 4500, 25, 10],
  ['Granos y abarrotes', 'Lentejas x500g', 2600, 3200, 18, 8],
  ['Granos y abarrotes', 'Pasta espagueti x500g', 2100, 2600, 30, 10],
  ['Granos y abarrotes', 'Aceite vegetal x1L', 8200, 9800, 15, 6],
  ['Granos y abarrotes', 'Azúcar blanca x500g', 2300, 2800, 35, 12],
  ['Granos y abarrotes', 'Sal de mesa x500g', 1200, 1500, 30, 8],
  ['Granos y abarrotes', 'Café molido x250g', 6400, 7500, 14, 6],
  ['Granos y abarrotes', 'Panela x500g', 4600, 5500, 20, 8],
  ['Granos y abarrotes', 'Chocolate de mesa x300g', 2400, 2900, 16, 6],
  ['Granos y abarrotes', 'Atún en lata 115g', 4300, 5200, 22, 8],
  ['Granos y abarrotes', 'Sardinas en lata 125g', 3100, 3800, 10, 5],
  ['Lácteos y refrigerados', 'Leche larga vida x1L', 3900, 4600, 24, 10],
  ['Lácteos y refrigerados', 'Queso campesino x500g', 9800, 11800, 8, 4],
  ['Lácteos y refrigerados', 'Yogurt natural x1L', 7200, 8500, 6, 4],
  ['Carnes y huevos', 'Huevos AA cartón x30', 13800, 16200, 12, 6],
  ['Carnes y huevos', 'Pollo entero', 11600, 13800, 5, 3],
  ['Panadería', 'Pan tajado x500g', 5500, 6500, 9, 5],
  ['Panadería', 'Arepas de maíz x10', 7800, 9200, 7, 4],
  ['Bebidas', 'Gaseosa cola x2L', 4200, 5200, 30, 12],
  ['Bebidas', 'Agua sin gas x2.5L', 2900, 3600, 20, 10],
  ['Bebidas', 'Jugo en caja x1L', 3600, 4200, 14, 6],
  ['Frutas y verduras', 'Tomate x1kg', 4300, 5500, 4, 5],
  ['Frutas y verduras', 'Cebolla cabezona x1kg', 3000, 3800, 6, 5],
  ['Frutas y verduras', 'Papa pastusa x1kg', 3400, 4200, 18, 8],
  ['Frutas y verduras', 'Plátano x1kg', 2000, 2500, 12, 6],
  ['Frutas y verduras', 'Zanahoria x1kg', 2100, 2600, 10, 5],
  ['Frutas y verduras', 'Limón x1kg', 2900, 3500, 3, 6],
  ['Frutas y verduras', 'Yuca x1kg', 3400, 4100, 8, 4],
  ['Aseo y hogar', 'Detergente en polvo x1kg', 15800, 18500, 9, 5],
  ['Aseo y hogar', 'Jabón de baño', 2300, 2700, 20, 8],
  ['Aseo y hogar', 'Crema dental 100ml', 3700, 4300, 12, 6],
  ['Aseo y hogar', 'Papel higiénico x4', 10800, 12800, 14, 6],
  ['Aseo y hogar', 'Shampoo 400ml', 8200, 9500, 4, 6],
  ['Aseo y hogar', 'Suavizante x1L', 8800, 10500, 6, 4],
]

/** Movimientos de la semana actual: [día 1..7, hora, tipo, monto, descripción]. */
const MOVIMIENTOS: ReadonlyArray<readonly [number, number, string, number, string]> = [
  [1, 8, TIPO_INGRESO_TEXTO, 128500, 'Ventas del día'],
  [2, 9, TIPO_EGRESO_TEXTO, 184000, 'Compra a proveedor'],
  [3, 10, TIPO_INGRESO_TEXTO, 94700, 'Ventas de domicilios'],
  [4, 16, TIPO_EGRESO_TEXTO, 36000, 'Pago de transporte'],
  [5, 8, TIPO_INGRESO_TEXTO, 147300, 'Ventas del día'],
  [5, 18, TIPO_INGRESO_TEXTO, 121800, 'Ventas de la tarde'],
  [6, 8, TIPO_INGRESO_TEXTO, 96800, 'Ventas de mercado'],
]

/**
 * Siembra el administrador inicial solo si no existe ningún usuario
 * (port de `DatabaseConnection.sembrarAdministradorInicial`).
 */
export async function sembrarAdminSiNoExiste(): Promise<void> {
  const totalUsuarios = await db.usuarios.count()
  if (totalUsuarios > 0) {
    return
  }
  const controlador = new UsuarioController()
  // El primer usuario registrado asume rol ADMIN automáticamente.
  await controlador.registrarUsuario(
    ADMIN_INICIAL_USUARIO,
    ADMIN_INICIAL_CONTRASENA,
    ADMIN_INICIAL_INDICIO,
    true,
  )
}

/**
 * Siembra los productos y movimientos de ejemplo solo cuando la tabla de
 * productos está vacía (port de `DatosEjemplo.sembrarSiVacio`). No pisa
 * datos reales.
 */
export async function sembrarDatosEjemplo(): Promise<boolean> {
  const productos = await db.productos.toArray()
  const activos = productos.filter((p) => !p.eliminado).length
  if (activos > 0) {
    return false
  }

  const productoController = new ProductoController()
  for (const [tipo, nombre, neto, venta, stock, stockMinimo] of PRODUCTOS) {
    const ganancia = String(venta - neto)
    await productoController.nuevoProducto(
      tipo, nombre, String(neto), ganancia, String(venta), String(stock), String(stockMinimo),
    )
  }

  await sembrarMovimientos()
  return true
}

/** Inserta los movimientos de ejemplo de los días ya transcurridos. */
async function sembrarMovimientos(): Promise<void> {
  const hoy = new Date()
  const diaSemana = (hoy.getDay() + 6) % 7
  const lunes = new Date(hoy)
  lunes.setDate(hoy.getDate() - diaSemana)
  lunes.setHours(0, 0, 0, 0)
  const semanaTranscurrida = diaSemana + 1

  const dao = new MovimientoDao()
  for (const [dia, hora, tipo, monto, descripcion] of MOVIMIENTOS) {
    if (dia > semanaTranscurrida) {
      continue
    }
    const fecha = new Date(lunes)
    fecha.setDate(lunes.getDate() + (dia - 1))
    fecha.setHours(hora, 0, 0, 0)
    await dao.insertar({
      tipo_movimiento: (tipo === TIPO_INGRESO_TEXTO ? 'INGRESO' : 'EGRESO') as Movimiento['tipo_movimiento'],
      monto,
      descripcion,
      fecha: formatFecha(fecha),
    })
  }
}