import { describe, expect, it } from 'vitest'
import { agruparPorDia, diaDeFecha, diaDeFechaActual, esDeudaActiva } from '../lib/deudaHistorial'
import type { Deuda, PagoDeuda } from '../model/types'

function deuda(id: string, fecha: string, monto: number, saldo: number): Deuda {
  return {
    id,
    deudor_id: 'deudor-ana',
    cliente_nombre: 'Ana',
    monto,
    saldo,
    descripcion: `Fiado ${id}`,
    fecha,
    creadoEn: 1,
    actualizadoEn: 1,
    version: 1,
    eliminado: false,
    dispositivo: 'test',
  }
}

function pago(id: string, deudaId: string, fecha: string, monto: number): PagoDeuda {
  return {
    id,
    deuda_id: deudaId,
    monto,
    descripcion: 'Abono',
    fecha,
    creadoEn: 1,
    actualizadoEn: 1,
    version: 1,
    eliminado: false,
    dispositivo: 'test',
  }
}

describe('Historial de deudores por día', () => {
  it('agrupa deudas y pagos del mismo día con su saldo al cierre', () => {
    const dias = agruparPorDia(
      [deuda('d1', '2026-09-01 10:00', 1000, 600)],
      [pago('p1', 'd1', '2026-09-01 15:00', 400)],
    )
    expect(dias).toHaveLength(1)
    expect(dias[0].dia).toBe('2026-09-01')
    expect(dias[0].cargado).toBe(1000)
    expect(dias[0].abonado).toBe(400)
    expect(dias[0].saldoAcumulado).toBe(600)
    expect(dias[0].eventos).toHaveLength(2)
    expect(dias[0].eventos[0].tipo).toBe('DEUDA')
    expect(dias[0].eventos[1].tipo).toBe('PAGO')
  })

  it('acumula el saldo del deudor a través de varios días', () => {
    const dias = agruparPorDia(
      [
        deuda('d1', '2026-09-01 10:00', 1000, 600),
        deuda('d2', '2026-09-03 09:00', 300, 300),
      ],
      [pago('p1', 'd1', '2026-09-01 15:00', 400)],
    )
    expect(dias.map((d) => d.dia)).toEqual(['2026-09-03', '2026-09-01'])
    const diaDos = dias[0]
    expect(diaDos.saldoAcumulado).toBe(900)
    expect(diaDos.cargado).toBe(300)
    expect(diaDos.abonado).toBe(0)
  })

  it('un día con varios cargos y abonos lleva el orden cronológico', () => {
    const dias = agruparPorDia(
      [
        deuda('d1', '2026-09-02 08:00', 500, 500),
        deuda('d2', '2026-09-02 12:00', 700, 700),
      ],
      [pago('p1', 'd1', '2026-09-02 18:00', 200)],
    )
    expect(dias[0].eventos.map((e) => e.id)).toEqual(['d1', 'd2', 'p1'])
    expect(dias[0].saldoAcumulado).toBe(1000)
  })

  it('marca una deuda como activa cuando tiene saldo pendiente', () => {
    expect(esDeudaActiva(deuda('d1', '2026-09-01 10:00', 1000, 600))).toBe(true)
    expect(esDeudaActiva(deuda('d1', '2026-09-01 10:00', 1000, 0))).toBe(false)
  })

  it('extrae el día (yyyy-MM-dd) de la fecha local y del campo de persistencia', () => {
    expect(diaDeFecha('2026-09-05 14:30')).toBe('2026-09-05')
    const ahora = new Date(2026, 8, 5, 14, 30)
    expect(diaDeFechaActual(ahora)).toBe('2026-09-05')
  })
})