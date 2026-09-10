import { describe, expect, it } from 'vitest'
import { ErrorRemoto } from '../lib/remoto'

describe('ErrorRemoto: clasificación de rechazos', () => {
  it('marca como definitivo cualquier 4xx (no reintentar)', () => {
    expect(new ErrorRemoto('Conflicto', 409).definitivo).toBe(true)
    expect(new ErrorRemoto('Inválido', 400).definitivo).toBe(true)
    expect(new ErrorRemoto('Lote grande', 413).definitivo).toBe(true)
  })

  it('marca como transitorio un 5xx o sin listado (reintentar)', () => {
    expect(new ErrorRemoto('Falla', 500).definitivo).toBe(false)
    expect(new ErrorRemoto('Agotado', 503).definitivo).toBe(false)
    expect(new ErrorRemoto('Se quitó el listado').definitivo).toBe(false)
  })

  it('conserva el mensaje y el estado HTTP', () => {
    const error = new ErrorRemoto('No se pudo guardar', 422)
    expect(error.message).toBe('No se pudo guardar')
    expect(error.estado).toBe(422)
    expect(error.name).toBe('ErrorRemoto')
  })
})