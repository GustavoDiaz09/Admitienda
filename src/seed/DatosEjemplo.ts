import { db } from '../lib/db'
import { formatFecha } from '../lib/fecha'
import { generarSalt, hashContrasena } from '../lib/password'
import {
  TIPO_ADMIN,
  type Movimiento,
  type Producto,
  type RegistroBase,
  type Usuario,
} from '../model/types'
import { TIPO_INGRESO_TEXTO, TIPO_EGRESO_TEXTO } from './constantes'

/** Credenciales del administrador inicial (iguales a la app de escritorio). */
export const ADMIN_INICIAL_USUARIO = 'admin'
export const ADMIN_INICIAL_CONTRASENA = 'Gustavo1234'
export const ADMIN_INICIAL_INDICIO = 'Tienda'

/**
 * Valor marcador de "dispositivo" de los datos de ejemplo. Detecta que el
 * registro es una demo local: no se encola ni se sube, incluso si el
 * administrador usa "Subir todo a la nube".
 */
export const DISPOSITIVO_SEMILLA = 'semilla-local'

/** Clave de metadatos que recuerda que los datos de ejemplo ya se sembraron. */
export const META_DATOS_EJEMPLO = 'datos_ejemplo_sembrados'

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
 * Campos comunes de sincronización para los datos de ejemplo. Estos registros
 * se escriben DIRECTAMENTE en IndexedDB con `put` y, a diferencia de los
 * registros reales (que pasan por `nuevoRegistro` y se encolan en el outbox),
 * NUNCA se envían a la nube: son una demo local de cada dispositivo.
 */
async function baseLocal(): Promise<RegistroBase> {
  const ahora = Date.now()
  return {
    id: crypto.randomUUID(),
    creadoEn: ahora,
    actualizadoEn: ahora,
    version: 1,
    eliminado: false,
    dispositivo: DISPOSITIVO_SEMILLA,
  }
}

/**
 * Siembra el administrador inicial solo si no existe ningún usuario
 * (port de `DatabaseConnection.sembrarAdministradorInicial`). Queda solo
 * en el dispositivo: no se encola para sincronizar.
 */
export async function sembrarAdminSiNoExiste(): Promise<void> {
  const totalUsuarios = await db.usuarios.count()
  if (totalUsuarios > 0) {
    return
  }
  const salt = generarSalt()
  const usuario: Usuario = {
    ...(await baseLocal()),
    nombre_usuario: ADMIN_INICIAL_USUARIO,
    tipo_usuario: TIPO_ADMIN,
    contrasena_hash: await hashContrasena(ADMIN_INICIAL_CONTRASENA, salt),
    salt,
    indicio_usuario: ADMIN_INICIAL_INDICIO,
    fecha_registro: formatFecha(new Date()),
  }
  await db.usuarios.put(usuario)
}

/**
 * Siembra los productos y movimientos de ejemplo **solo la primera vez**
 * que se abre la app en este dispositivo (port de `DatosEjemplo.sembrarSiVacio`).
 * Un marcador en `metadatos` evita que los demos reaparezcan después de que el
 * usuario vacía o restaura su base local: no pisa datos reales y los demos
 * quedan solo en el dispositivo (sin encolar).
 */
export async function sembrarDatosEjemplo(): Promise<boolean> {
  const yaSembrado = await db.metadatos.get(META_DATOS_EJEMPLO)
  if (yaSembrado) {
    return false
  }
  const productos = await db.productos.toArray()
  const activos = productos.filter((p) => !p.eliminado).length
  if (activos > 0) {
    await db.metadatos.put({ clave: META_DATOS_EJEMPLO, valor: String(Date.now()) })
    return false
  }

  for (const [tipo, nombre, neto, venta, stock, stockMinimo] of PRODUCTOS) {
    const producto: Producto = {
      ...(await baseLocal()),
      tipo_producto: tipo,
      nombre_producto: nombre,
      precio_neto: neto,
      ganancia: venta - neto,
      precio_venta: venta,
      cantidad_stock: stock,
      stock_minimo: stockMinimo,
    }
    await db.productos.put(producto)
  }

  await sembrarMovimientos()
  await db.metadatos.put({ clave: META_DATOS_EJEMPLO, valor: String(Date.now()) })
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

  for (const [dia, hora, tipo, monto, descripcion] of MOVIMIENTOS) {
    if (dia > semanaTranscurrida) {
      continue
    }
    const fecha = new Date(lunes)
    fecha.setDate(lunes.getDate() + (dia - 1))
    fecha.setHours(hora, 0, 0, 0)
    const movimiento: Movimiento = {
      ...(await baseLocal()),
      tipo_movimiento: (tipo === TIPO_INGRESO_TEXTO ? 'INGRESO' : 'EGRESO') as Movimiento['tipo_movimiento'],
      monto,
      descripcion,
      fecha: formatFecha(fecha),
    }
    await db.movimientos.put(movimiento)
  }
}