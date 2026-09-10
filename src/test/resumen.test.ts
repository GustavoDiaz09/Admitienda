import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import { MovimientoController } from '../controller/MovimientoController'
import { MovimientoDao } from '../dao/MovimientoDao'
import { TIPO_INGRESO } from '../model/types'
import { formatFecha, OFFSET_COLOMBIA_MS } from '../lib/fecha'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

/**
 * Instantes de la semana "actual" calculados en hora de Colombia (UTC-5),
 * independientes de la zona horaria del equipo donde corren los tests.
 */
function fechasDeSemanaActual(): { lunes: Date; domingo: Date; lunesProximo: Date } {
  const ahoraCol = new Date(Date.now() - OFFSET_COLOMBIA_MS)
  const diaCol = (ahoraCol.getUTCDay() + 6) % 7
  const lunes = new Date(
    Date.UTC(
      ahoraCol.getUTCFullYear(),
      ahoraCol.getUTCMonth(),
      ahoraCol.getUTCDate() - diaCol,
    ) + OFFSET_COLOMBIA_MS,
  )
  const domingo = new Date(lunes.getTime() + 6 * 86_400_000 + (20 * 3_600 + 30 * 60) * 1000)
  const lunesProximo = new Date(lunes.getTime() + 7 * 86_400_000 + 30 * 60 * 1000)
  return { lunes, domingo, lunesProximo }
}

describe('Resumen semanal (AL-06)', () => {
  it('incluye los movimientos del domingo (cerrados a medianoche del lunes)', async () => {
    const { lunes, domingo, lunesProximo } = fechasDeSemanaActual()
    const dao = new MovimientoDao()

    await dao.insertar({
      tipo_movimiento: TIPO_INGRESO,
      monto: 100,
      descripcion: 'Ingreso del lunes',
      fecha: formatFecha(lunes),
    })
    await dao.insertar({
      tipo_movimiento: TIPO_INGRESO,
      monto: 50,
      descripcion: 'Ingreso del domingo',
      fecha: formatFecha(domingo),
    })
    await dao.insertar({
      tipo_movimiento: TIPO_INGRESO,
      monto: 999,
      descripcion: 'Ya es la semana siguiente',
      fecha: formatFecha(lunesProximo),
    })

    const resumen = await new MovimientoController().obtenerResumenSemanal()

    expect(resumen.get(1)).toBe(100)
    expect(resumen.get(7)).toBe(50)
    expect(Array.from(resumen.values()).reduce((a, b) => a + b, 0)).toBe(150)
  })

  it('deja en cero los días sin movimientos', async () => {
    const resumen = await new MovimientoController().obtenerResumenSemanal()
    expect(Array.from(resumen.keys())).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(Array.from(resumen.values()).every((valor) => valor === 0)).toBe(true)
  })
})