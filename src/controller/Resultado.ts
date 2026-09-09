/**
 * Resultado de una operación de negocio (port del record
 * `tienda.controller.Resultado`). Nunca se lanzan excepciones por errores
 * esperados: los controladores devuelven un {@link Resultado}.
 */
export class Resultado {
  readonly exito: boolean
  readonly mensaje: string

  constructor(exito: boolean, mensaje: string) {
    this.exito = exito
    this.mensaje = mensaje
  }

  static exito(mensaje: string): Resultado {
    return new Resultado(true, mensaje)
  }

  static error(mensaje: string): Resultado {
    return new Resultado(false, mensaje)
  }

  static esExito(r: Resultado | null | undefined): r is Resultado {
    return !!r?.exito
  }
}