/**
 * Tipos y entidades del dominio, espejo de los modelos Java del sistema
 * original (User, Product, IngresoEgreso, SolicitudAdmin).
 *
 * Cada registro incluye campos de sincronización (RegistroBase) para
 * soportar la estrategia offline-first con "último write gana":
 * - id: identificador único generado en el cliente (UUID).
 * - creadoEn / actualizadoEn: marcas de tiempo (ms epoch) para ordenar.
 * - version: contador entero que sube en cada cambio.
 * - eliminado: borrado lógico (tumba / tombstone) para propagar bajas.
 * - dispositivo: id del dispositivo que realizó el último cambio.
 */

/** Campos comunes a todos los registros sincronizables. */
export interface RegistroBase {
  id: string
  creadoEn: number
  actualizadoEn: number
  version: number
  eliminado: boolean
  dispositivo: string
}

/** Nombre de las tablas que se sincronizan con Supabase. */
export type TablaSync =
  | 'usuarios'
  | 'productos'
  | 'movimientos'
  | 'solicitudes_admin'
  | 'deudores'
  | 'deudas'
  | 'pagos_deuda'

/** Tipo de usuario: administrador (acceso completo). */
export const TIPO_ADMIN = 'ADMIN'

/** Tipo de usuario: registrado (puede gestionar su cuenta, no los datos). */
export const TIPO_REGISTRADO = 'REGISTRADO'

export type TipoUsuario = typeof TIPO_ADMIN | typeof TIPO_REGISTRADO

/** Usuario del sistema (autenticación local con hash SHA-256 + salt). */
export interface Usuario extends RegistroBase {
  nombre_usuario: string
  tipo_usuario: TipoUsuario
  contrasena_hash: string
  salt: string
  indicio_usuario: string
  fecha_registro: string
}

/** Producto de la tienda (costos, venta, stock y stock mínimo). */
export interface Producto extends RegistroBase {
  tipo_producto: string
  nombre_producto: string
  precio_neto: number
  ganancia: number
  precio_venta: number
  cantidad_stock: number
  stock_minimo: number
}

/** Tipo de movimiento: entrada de dinero. */
export const TIPO_INGRESO = 'INGRESO'

/** Tipo de movimiento: salida de dinero. */
export const TIPO_EGRESO = 'EGRESO'

export type TipoMovimiento = typeof TIPO_INGRESO | typeof TIPO_EGRESO

/** Movimiento financiero (ingreso o egreso) de la tienda. */
export interface Movimiento extends RegistroBase {
  tipo_movimiento: TipoMovimiento
  monto: number
  descripcion: string
  /** Fecha en formato "yyyy-MM-dd HH:mm" (compatible con el sistema Java). */
  fecha: string
}

/** Estado: la solicitud espera la decisión de un administrador. */
export const ESTADO_PENDIENTE = 'PENDIENTE'

/** Estado: la solicitud fue aprobada. */
export const ESTADO_APROBADA = 'APROBADA'

/** Estado: la solicitud fue rechazada. */
export const ESTADO_RECHAZADA = 'RECHAZADA'

export type EstadoSolicitud =
  | typeof ESTADO_PENDIENTE
  | typeof ESTADO_APROBADA
  | typeof ESTADO_RECHAZADA

/** Solicitud de permiso de administrador. */
export interface SolicitudAdmin extends RegistroBase {
  usuario_id: string
  estado: EstadoSolicitud
  fecha_solicitud: string
  /** Nombre del usuario solicitante (join con usuarios para mostrar en pantalla). */
  nombre_usuario?: string
}

/**
 * Deudor (cliente que compra fiado). Identidad única en la base por nombre
 * normalizado (sin mayúsculas ni espacios repetidos): una sola entidad por
 * nombre, con todas sus ventas fiadas agrupadas en el historial. Las deudas
 * del mismo deudor pueden ser varias y simultáneas (decide el tendero).
 */
export interface Deudor extends RegistroBase {
  nombre_deudor: string
  /** Nombre en minúsculas y con espacios colapsados (clave de unicidad). */
  nombre_normalizado: string
}

/**
 * Deuda de un cliente (venta fiada). El `monto` es el total original y
 * `saldo` lo que aún falta por pagar; cuando `saldo` llega a 0 la deuda
 * se considera saldada. `deudor_id` enlaza la deuda con su deudor único.
 */
export interface Deuda extends RegistroBase {
  deudor_id: string
  cliente_nombre: string
  monto: number
  saldo: number
  descripcion: string
  /** Fecha en formato "yyyy-MM-dd HH:mm" (compatible con el sistema Java). */
  fecha: string
}

/** Pago (abono) aplicado a una deuda. Cada abono genera un ingreso en caja. */
export interface PagoDeuda extends RegistroBase {
  deuda_id: string
  monto: number
  descripcion: string
  /** Fecha en formato "yyyy-MM-dd HH:mm" (compatible con el sistema Java). */
  fecha: string
}

/** Entrada de la cola de sincronización (outbox). */
export interface ItemOutbox {
  /** Clave compuesta: `${tabla}:${registroId}`. */
  id: string
  tabla: TablaSync
  registro: RegistroBase
  encoladoEn: number
  intentos: number
  /** Marca de tiempo del último intento fallido (para reaprovechar tras un alto). */
  ultimoIntento?: number
}

/** Metadato global de la aplicación (dispositivo_id, estado de sync, etc.). */
export interface Metadato {
  clave: string
  valor: string
}