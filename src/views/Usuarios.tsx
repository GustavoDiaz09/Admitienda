import type { FormEvent } from 'react'
import { useCallback, useEffect, useState } from 'react'
import {
  Check,
  Pencil,
  ShieldCheck,
  Trash,
  UsersThree,
  X,
} from '@phosphor-icons/react'
import { UsuarioController } from '../controller/UsuarioController'
import {
  TIPO_ADMIN,
  ESTADO_APROBADA,
  ESTADO_PENDIENTE,
  type EstadoSolicitud,
  type SolicitudAdmin,
  type Usuario,
} from '../model/types'
import { avisarError, avisarExito } from '../lib/toast'
import { Button } from '../components/ui/Button'
import { Campo, Entrada } from '../components/ui/Campo'
import { Insignia, type TonoInsignia } from '../components/ui/Insignia'
import { Card } from '../components/ui/Card'
import { Modal } from '../components/ui/Modal'
import { Tabla, Celda } from '../components/ui/Tabla'
import { ConfirmButton } from '../components/ui/ConfirmButton'
import { EncabezadoSeccion, Esqueleto, EstadoVacio } from '../components/ui/Base'
import { cn } from '../lib/cn'

type Pestana = 'usuarios' | 'solicitudes'

const tonoEstado: Record<EstadoSolicitud, TonoInsignia> = {
  PENDIENTE: 'ambar',
  APROBADA: 'esmeralda',
  RECHAZADA: 'rojo',
}

const etiquetaEstado: Record<EstadoSolicitud, string> = {
  PENDIENTE: 'Pendiente',
  APROBADA: 'Aprobada',
  RECHAZADA: 'Rechazada',
}

function formatearFecha(texto: string): string {
  const [fecha, hora] = texto.split(' ')
  if (!fecha) return texto
  const [anio, mes, dia] = fecha.split('-')
  return `${dia}/${mes}/${anio}${hora ? ` ${hora}` : ''}`
}

/** Gestión de usuarios y solicitudes de permiso de administrador. */
export function Usuarios() {
  const [pestana, setPestana] = useState<Pestana>('usuarios')
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null)
  const [solicitudes, setSolicitudes] = useState<SolicitudAdmin[] | null>(null)
  const [edicion, setEdicion] = useState<Usuario | null>(null)

  const cargarUsuarios = useCallback(async () => {
    setUsuarios(await new UsuarioController().obtenerUsuarios())
  }, [])

  const cargarSolicitudes = useCallback(async () => {
    setSolicitudes(await new UsuarioController().obtenerSolicitudes())
  }, [])

  useEffect(() => {
    void cargarUsuarios()
  }, [cargarUsuarios])

  useEffect(() => {
    if (pestana === 'solicitudes' && solicitudes === null) {
      void cargarSolicitudes()
    }
  }, [pestana, solicitudes, cargarSolicitudes])

  const decidirSolicitud = async (solicitud: SolicitudAdmin, aprobar: boolean) => {
    const controlador = new UsuarioController()
    const resultado = aprobar
      ? await controlador.aprobarSolicitud(solicitud.id)
      : await controlador.rechazarSolicitud(solicitud.id)
    if (resultado.exito) {
      avisarExito(resultado.mensaje)
    } else {
      avisarError(resultado.mensaje)
    }
    await Promise.all([cargarSolicitudes(), cargarUsuarios()])
  }

  const eliminadoConExito = async (resultado: { exito: boolean; mensaje: string }) => {
    if (resultado.exito) {
      avisarExito(resultado.mensaje)
    } else {
      avisarError(resultado.mensaje)
    }
    await cargarUsuarios()
  }

  return (
    <div className="animate-desvanecer space-y-5">
      <EncabezadoSeccion
        titulo="Gestión de usuarios"
        descripcion="Maneje el acceso al sistema y las solicitudes de administrador."
      />

      <div className="inline-flex rounded-full border border-zinc-300 bg-white p-0.5">
        {(
          [
            { valor: 'usuarios', etiqueta: 'Usuarios' },
            { valor: 'solicitudes', etiqueta: 'Solicitudes de administrador' },
          ] as Array<{ valor: Pestana; etiqueta: string }>
        ).map((opcion) => (
          <button
            key={opcion.valor}
            type="button"
            onClick={() => setPestana(opcion.valor)}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              pestana === opcion.valor
                ? 'bg-emerald-600 text-white'
                : 'text-zinc-600 hover:bg-zinc-100',
            )}
          >
            {opcion.etiqueta}
          </button>
        ))}
      </div>

      {pestana === 'usuarios' ? (
        <Card>
          {usuarios === null ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Esqueleto key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : usuarios.length === 0 ? (
            <EstadoVacio
              icono={<UsersThree size={24} weight="duotone" />}
              titulo="Sin usuarios"
              descripcion="Aún no hay usuarios registrados en el sistema."
            />
          ) : (
            <Tabla encabezados={['Nombre de usuario', 'Rol', '']}>
              {usuarios.map((usuario) => (
                <tr key={usuario.id} className="hover:bg-zinc-50/80">
                  <Celda>
                    <div className="flex items-center gap-3">
                      <span className="grid size-8 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                        {usuario.nombre_usuario.charAt(0).toUpperCase()}
                      </span>
                      <span className="font-medium text-zinc-900">{usuario.nombre_usuario}</span>
                    </div>
                  </Celda>
                  <Celda>
                    <Insignia tono={usuario.tipo_usuario === TIPO_ADMIN ? 'esmeralda' : 'gris'}>
                      {usuario.tipo_usuario === TIPO_ADMIN ? 'Administrador' : 'Registrado'}
                    </Insignia>
                  </Celda>
                  <Celda className="text-right">
                    <div className="inline-flex gap-1">
                      <button
                        type="button"
                        onClick={() => setEdicion(usuario)}
                        aria-label={`Modificar ${usuario.nombre_usuario}`}
                        className="focus-ring rounded-full p-2 text-zinc-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600"
                      >
                        <Pencil size={16} weight="bold" />
                      </button>
                      <ConfirmButton
                        accion={<Trash size={14} weight="bold" />}
                        titulo="Eliminar usuario"
                        mensaje={
                          <>
                            ¿Desea eliminar a <b>{usuario.nombre_usuario}</b>? No se puede
                            eliminar el último administrador del sistema.
                          </>
                        }
                        disabled={usuario.tipo_usuario === TIPO_ADMIN}
                        confirmar={async () => {
                          const resultado = await new UsuarioController().eliminarUsuario(usuario.id)
                          await eliminadoConExito(resultado)
                        }}
                      />
                    </div>
                  </Celda>
                </tr>
              ))}
            </Tabla>
          )}
        </Card>
      ) : (
        <Card>
          {solicitudes === null ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Esqueleto key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : solicitudes.length === 0 ? (
            <EstadoVacio
              icono={<ShieldCheck size={24} weight="duotone" />}
              titulo="Sin solicitudes"
              descripcion="Cuando un usuario solicite permiso de administrador, aparecerá aquí."
            />
          ) : (
            <Tabla encabezados={['Solicitante', 'Estado', 'Fecha', '']}>
              {solicitudes.map((solicitud) => (
                <tr key={solicitud.id} className="hover:bg-zinc-50/80">
                  <Celda className="font-medium text-zinc-900">{solicitud.nombre_usuario}</Celda>
                  <Celda>
                    <Insignia tono={tonoEstado[solicitud.estado]}>
                      {etiquetaEstado[solicitud.estado]}
                    </Insignia>
                  </Celda>
                  <Celda className="text-zinc-500">{formatearFecha(solicitud.fecha_solicitud)}</Celda>
                  <Celda className="text-right">
                    {solicitud.estado === ESTADO_PENDIENTE ? (
                      <div className="inline-flex gap-2">
                        <Button
                          variante="primario"
                          tamanio="sm"
                          icono={Check}
                          onClick={() => void decidirSolicitud(solicitud, true)}
                        >
                          Aprobar
                        </Button>
                        <Button
                          variante="fantasma"
                          tamanio="sm"
                          icono={X}
                          onClick={() => void decidirSolicitud(solicitud, false)}
                        >
                          Rechazar
                        </Button>
                      </div>
                    ) : solicitud.estado === ESTADO_APROBADA ? null : (
                      <Insignia tono="gris">Resuelta</Insignia>
                    )}
                  </Celda>
                </tr>
              ))}
            </Tabla>
          )}
        </Card>
      )}

      <FormularioUsuario
        usuario={edicion}
        abierto={edicion !== null}
        onCerrar={() => setEdicion(null)}
        onGuardado={async () => {
          setEdicion(null)
          await cargarUsuarios()
        }}
      />
    </div>
  )
}

function FormularioUsuario({
  usuario,
  abierto,
  onCerrar,
  onGuardado,
}: {
  usuario: Usuario | null
  abierto: boolean
  onCerrar: () => void
  onGuardado: () => Promise<void>
}) {
  const [nombre, setNombre] = useState(usuario?.nombre_usuario ?? '')
  const [indicio, setIndicio] = useState(usuario?.indicio_usuario ?? '')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault()
    setError(null)
    setCargando(true)
    try {
      const resultado = await new UsuarioController().modificarUsuario(
        usuario as Usuario,
        nombre,
        indicio,
      )
      setCargando(false)
      if (!resultado.exito) {
        setError(resultado.mensaje)
        return
      }
      avisarExito(resultado.mensaje)
      onCerrar()
      await onGuardado()
    } catch {
      setCargando(false)
      setError('No se pudo modificar el usuario.')
    }
  }

  return (
    <Modal
      abierto={abierto}
      titulo="Modificar usuario"
      descripcion="Actualice el nombre de usuario y el indicio de seguridad."
      onCerrar={onCerrar}
    >
      <form onSubmit={enviar} className="space-y-4">
        <Campo etiqueta="Nombre de usuario" htmlFor="usr-nombre">
          <Entrada
            id="usr-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            autoFocus
          />
        </Campo>
        <Campo
          etiqueta="Palabras clave de seguridad"
          htmlFor="usr-indicio"
          ayuda="Palabras que solo usted conozca y que le ayuden a recordar su contraseña si la olvida. Evite datos obvios (nombres, fechas de nacimiento), así su cuenta estará mejor protegida."
        >
          <Entrada
            id="usr-indicio"
            value={indicio}
            onChange={(e) => setIndicio(e.target.value)}
            required
          />
        </Campo>
        {error ? (
          <p role="alert" className="text-xs font-medium text-red-600">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 border-t border-zinc-100 pt-4">
          <Button variante="fantasma" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" cargando={cargando}>
            Guardar cambios
          </Button>
        </div>
      </form>
    </Modal>
  )
}