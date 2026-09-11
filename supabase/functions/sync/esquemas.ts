// Validación de la carga útil de `subir` de la Edge Function `sync`.
// Módulo P U R O (sin dependencias de Deno) compartido con los tests de la
// aplicación: la nube y el test de contrato usan la misma fuente de verdad.

export const MARGEN_FUTURO_MS = 48 * 60 * 60 * 1000

/** Cuenta fija que puede ser SUPERADMIN (el dueño; única en la nube). */
export const NOMBRE_SUPERADMIN = 'Gustavo'

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/
const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

export function esUuid(v: unknown): boolean {
  return typeof v === 'string' && UUID_REGEX.test(v)
}

export function esNumeroFinito(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

export function esTexto(v: unknown, max: number): boolean {
  return typeof v === 'string' && v.length > 0 && v.length <= max
}

/** Decimales <= 2 en montos (evita 0.1+0.2 y valores absurdos). */
export function esMonto(v: unknown): boolean {
  return esNumeroFinito(v) && v >= 0 && Number.isInteger(Math.round(v * 100))
}

/**
 * Allow-list por tabla: cada campo que el cliente sube debe estar aquí (los
 * campos base id/creado_en/actualizado_en/version/eliminado/dispositivo se
 * validan aparte). Espejo de las reglas de negocio: tipos, rangos, enums,
 * fechas y montos.
 */
export const ESQUEMAS: Record<string, Record<string, (v: unknown) => boolean>> = {
  usuarios: {
    nombre_usuario: (v) => esTexto(v, 50),
    tipo_usuario: (v) => v === 'ADMIN' || v === 'REGISTRADO' || v === 'SUPERADMIN',
    contrasena_hash: (v) => esTexto(v, 200),
    salt: (v) => esTexto(v, 64),
    indicio_usuario: (v) => esTexto(v, 100),
    fecha_registro: (v) => esTexto(v, 19) && FECHA_REGEX.test(String(v)),
  },
  productos: {
    tipo_producto: (v) => esTexto(v, 100),
    nombre_producto: (v) => esTexto(v, 100),
    precio_neto: esMonto,
    ganancia: esMonto,
    precio_venta: esMonto,
    cantidad_stock: (v) => esNumeroFinito(v) && Number.isInteger(v) && v >= 0,
    stock_minimo: (v) => esNumeroFinito(v) && Number.isInteger(v) && v >= 0,
  },
  movimientos: {
    tipo_movimiento: (v) => v === 'INGRESO' || v === 'EGRESO',
    monto: esMonto,
    descripcion: (v) => esTexto(v, 400),
    fecha: (v) => esTexto(v, 19) && FECHA_REGEX.test(String(v)),
  },
  solicitudes_admin: {
    usuario_id: esUuid,
    estado: (v) => v === 'PENDIENTE' || v === 'APROBADA' || v === 'RECHAZADA',
    fecha_solicitud: (v) => esTexto(v, 19) && FECHA_REGEX.test(String(v)),
  },
  deudores: {
    nombre_deudor: (v) => esTexto(v, 100),
    nombre_normalizado: (v) => esTexto(v, 100),
  },
  deudas: {
    deudor_id: esUuid,
    cliente_nombre: (v) => esTexto(v, 100),
    monto: esMonto,
    saldo: esMonto,
    descripcion: (v) => esTexto(v, 400),
    fecha: (v) => esTexto(v, 19) && FECHA_REGEX.test(String(v)),
  },
  pagos_deuda: {
    deuda_id: esUuid,
    monto: esMonto,
    descripcion: (v) => esTexto(v, 400),
    fecha: (v) => esTexto(v, 19) && FECHA_REGEX.test(String(v)),
  },
}

/**
 * Devuelve el primer campo inválido de una fila, o null si es válida.
 * Incluye los campos base de sincronización y las validaciones cruzadas
 * (p. ej. saldo no puede superar el monto de la deuda).
 */
export function primerCampoInvalido(tabla: string, fila: Record<string, unknown>): string | null {
  const validador = ESQUEMAS[tabla]
  if (!validador) {
    return '(tabla desconocida)'
  }
  const camposPorDefecto = [
    ['id', esUuid],
    ['creado_en', esNumeroFinito],
    ['actualizado_en', esNumeroFinito],
    ['version', (v: unknown) => esNumeroFinito(v) && Number.isInteger(v) && v >= 1],
    ['eliminado', (v: unknown) => v === true || v === false],
    ['dispositivo', (v: unknown) => esTexto(v, 64)],
  ] as const
  const permitidos = new Set([
    'id',
    'creado_en',
    'actualizado_en',
    'version',
    'eliminado',
    'dispositivo',
    ...Object.keys(validador),
  ])
  for (const campo of Object.keys(fila)) {
    if (!permitidos.has(campo)) {
      return `columna no permitida '${campo}'`
    }
  }
  for (const [campo, comprobar] of camposPorDefecto) {
    if (!comprobar(fila[campo])) {
      return campo
    }
  }
  if ((fila['actualizado_en'] as number) > Date.now() + MARGEN_FUTURO_MS) {
    return 'actualizado_en muy en el futuro (reloj adelantado)'
  }
  // Campos de negocio. Las tumbas también los conservan (las columnas son
  // NOT NULL), así que se validan igual que las filas activas.
  for (const [campo, comprobar] of Object.entries(validador)) {
    if (!comprobar(fila[campo])) {
      return campo
    }
  }
  if (tabla === 'deudas' && (fila['saldo'] as number) > (fila['monto'] as number)) {
    return 'saldo mayor que monto'
  }
  if (tabla === 'usuarios') {
    const nombre = String(fila['nombre_usuario'] ?? '').toLowerCase()
    const esNombreDelDueno = nombre === NOMBRE_SUPERADMIN.toLowerCase()
    if (fila['tipo_usuario'] === 'SUPERADMIN') {
      if (!esNombreDelDueno) {
        return `el SUPERADMIN solo puede ser la cuenta "${NOMBRE_SUPERADMIN}"`
      }
      if (fila['eliminado'] === true) {
        return 'la cuenta SUPERADMIN no se puede eliminar'
      }
    }
    if (esNombreDelDueno && fila['tipo_usuario'] !== 'SUPERADMIN') {
      return `el nombre "${NOMBRE_SUPERADMIN}" pertenece a la cuenta SUPERADMIN`
    }
  }
  return null
}