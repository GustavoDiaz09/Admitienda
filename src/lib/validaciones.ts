/**
 * Utilidades para validar datos de entrada del usuario (port de
 * `tienda.util.Validaciones` de Java). Cada método devuelve un mensaje
 * de error legible, o una cadena vacía cuando el dato es correcto.
 */

/** Valida que un texto no esté vacío ni sea solo espacios. */
export function textoNoVacio(valor: string | null | undefined, nombreCampo: string): string {
  if (valor == null || valor.trim() === '') {
    return `El campo ${nombreCampo} no puede quedar vacío.`
  }
  return ''
}

/** Valida que un texto sea un número no negativo (importe monetario). */
export function montoPositivo(valor: string, nombreCampo: string): string {
  const error = textoNoVacio(valor, nombreCampo)
  if (error) {
    return error
  }
  const monto = Number(valor.replace(',', '.'))
  if (Number.isNaN(monto)) {
    return `El campo ${nombreCampo} debe contener un número válido.`
  }
  if (monto < 0) {
    return `El campo ${nombreCampo} debe ser un valor positivo.`
  }
  return ''
}

/** Valida que un texto sea un número entero no negativo. */
export function enteroNoNegativo(valor: string, nombreCampo: string): string {
  const error = textoNoVacio(valor, nombreCampo)
  if (error) {
    return error
  }
  const numero = Number(valor.trim())
  if (!Number.isInteger(numero)) {
    return `El campo ${nombreCampo} debe contener un número entero válido.`
  }
  if (numero < 0) {
    return `El campo ${nombreCampo} debe ser un valor positivo.`
  }
  return ''
}

/** Convierte un texto a número, tolerando la coma como separador decimal. */
export function aDouble(valor: string): number {
  return Number(valor.trim().replace(',', '.'))
}

/** Convierte un texto a entero. */
export function aInt(valor: string): number {
  return Number(valor.trim())
}

/** Acumula mensajes de error separándolos con salto de línea. */
export function acumularErrores(errores: string[], nuevo: string): void {
  if (nuevo) {
    errores.push(nuevo)
  }
}