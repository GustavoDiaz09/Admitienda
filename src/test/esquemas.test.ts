import { describe, expect, it } from 'vitest'
import { ESQUEMAS, primerCampoInvalido } from '../../supabase/functions/sync/esquemas'

const UUID_VALIDO = '11111111-1111-4111-8111-111111111111'

/** Columnas de negocio que el cliente sube por tabla (espejo de columnasExtra). */
const COLUMNAS_CLIENTE: Record<string, string[]> = {
  usuarios: [
    'nombre_usuario',
    'tipo_usuario',
    'contrasena_hash',
    'salt',
    'indicio_usuario',
    'fecha_registro',
  ],
  productos: [
    'tipo_producto',
    'nombre_producto',
    'precio_neto',
    'ganancia',
    'precio_venta',
    'cantidad_stock',
    'stock_minimo',
  ],
  movimientos: ['tipo_movimiento', 'monto', 'descripcion', 'fecha'],
  solicitudes_admin: ['usuario_id', 'estado', 'fecha_solicitud'],
  deudores: ['nombre_deudor', 'nombre_normalizado'],
  deudas: ['deudor_id', 'cliente_nombre', 'monto', 'saldo', 'descripcion', 'fecha'],
  pagos_deuda: ['deuda_id', 'monto', 'descripcion', 'fecha'],
}

function filaBase(id: string, extra: Record<string, unknown>): Record<string, unknown> {
  return {
    id,
    creado_en: 1000,
    actualizado_en: 1000,
    version: 1,
    eliminado: false,
    dispositivo: 'dispositivo-x',
    ...extra,
  }
}

describe('Contrato del esquema del edge (allow-list de subir)', () => {
  for (const [tabla, columnas] of Object.entries(COLUMNAS_CLIENTE)) {
    it(`permite todas las columnas que sube el cliente en '${tabla}'`, () => {
      expect(ESQUEMAS[tabla]).toBeDefined()
      for (const columna of columnas) {
        expect(ESQUEMAS[tabla], `falta la columna '${columna}' en el esquema de ${tabla}`).toHaveProperty(columna)
      }
    })
  }

  it('rechaza una deuda sin saldo (el cliente siempre lo envía)', () => {
    const invalido = primerCampoInvalido(
      'deudas',
      filaBase('11111111-1111-4111-8111-111111111111', {
        deudor_id: UUID_VALIDO,
        cliente_nombre: 'Ana',
        monto: 1000,
        descripcion: 'Fiado',
        fecha: '2026-01-01 10:00',
      }),
    )
    expect(invalido).toBe('saldo')
  })

  it('rechaza una deuda cuyo saldo supera el monto', () => {
    const invalido = primerCampoInvalido(
      'deudas',
      filaBase('11111111-1111-4111-8111-111111111111', {
        deudor_id: UUID_VALIDO,
        cliente_nombre: 'Ana',
        monto: 1000,
        saldo: 1200,
        descripcion: 'Fiado',
        fecha: '2026-01-01 10:00',
      }),
    )
    expect(invalido).toBe('saldo mayor que monto')
  })

  it('acepta una deuda bien formada con saldo dentro del monto', () => {
    const invalido = primerCampoInvalido(
      'deudas',
      filaBase('11111111-1111-4111-8111-111111111111', {
        deudor_id: UUID_VALIDO,
        cliente_nombre: 'Ana',
        monto: 1000,
        saldo: 800,
        descripcion: 'Fiado',
        fecha: '2026-01-01 10:00',
      }),
    )
    expect(invalido).toBeNull()
  })

  it('acepta un deudor bien formado con su nombre normalizado', () => {
    const invalido = primerCampoInvalido(
      'deudores',
      filaBase('22222222-2222-4222-8222-222222222222', { nombre_deudor: 'Ana', nombre_normalizado: 'ana' }),
    )
    expect(invalido).toBeNull()
  })

  it('rechaza un SUPERADMIN con otro nombre (la cuenta del dueño es única)', () => {
    const invalido = primerCampoInvalido(
      'usuarios',
      filaBase('33333333-3333-4333-8333-333333333333', {
        nombre_usuario: 'Pedro',
        tipo_usuario: 'SUPERADMIN',
        contrasena_hash: 'abc',
        salt: 'def',
        indicio_usuario: 'clave',
        fecha_registro: '2026-01-01 10:00',
      }),
    )
    expect(invalido).toContain('SUPERADMIN')
  })

  it('acepta el SUPERADMIN fijo de la cuenta del dueño', () => {
    const invalido = primerCampoInvalido(
      'usuarios',
      filaBase('33333333-3333-4333-8333-333333333333', {
        nombre_usuario: 'Gustavo',
        tipo_usuario: 'SUPERADMIN',
        contrasena_hash: 'abc',
        salt: 'def',
        indicio_usuario: 'clave',
        fecha_registro: '2026-01-01 10:00',
      }),
    )
    expect(invalido).toBeNull()
  })

  it('rechaza que la cuenta del dueño se suba con otro rol', () => {
    const invalido = primerCampoInvalido(
      'usuarios',
      filaBase('33333333-3333-4333-8333-333333333333', {
        nombre_usuario: 'Gustavo',
        tipo_usuario: 'ADMIN',
        contrasena_hash: 'abc',
        salt: 'def',
        indicio_usuario: 'clave',
        fecha_registro: '2026-01-01 10:00',
      }),
    )
    expect(invalido).toContain('Gustavo')
  })

  it('rechaza la tumba de la cuenta SUPERADMIN', () => {
    const invalido = primerCampoInvalido(
      'usuarios',
      filaBase('33333333-3333-4333-8333-333333333333', {
        nombre_usuario: 'Gustavo',
        tipo_usuario: 'SUPERADMIN',
        eliminado: true,
        contrasena_hash: 'abc',
        salt: 'def',
        indicio_usuario: 'clave',
        fecha_registro: '2026-01-01 10:00',
      }),
    )
    expect(invalido).toContain('no se puede eliminar')
  })
})
