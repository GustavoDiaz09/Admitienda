import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import { MovimientoController } from '../controller/MovimientoController'
import { MovimientoDao } from '../dao/MovimientoDao'
import { TIPO_INGRESO } from '../model/types'
import { formatFecha } from '../lib/fecha'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

function fechasDeSemanaActual(): { lunes: Date; domingo: Date; lunesProximo: Date } {
  const hoy = new Date()
  const diaSemana = (hoy.getDay() + 6) % 7
  const lunes = new Date(hoy)
  lunes.setDate(hoy.getDate() - diaSemana)
  lunes.setHours(0, 0, 0, 0)
  const domingo = new Date(lunes)
  domingo.setDate(lunes.getDate() + 6)
  domingo.setHours(20, 30, 0, 0)
  const lunesProximo = new Date(lunes)
  lunesProximo.setDate(lunes.getDate() + 7)
  lunesProximo.setHours(0, 30, 0, 0)
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