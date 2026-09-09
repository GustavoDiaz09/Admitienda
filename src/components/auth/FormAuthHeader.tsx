/** Encabezado de los formularios de autenticación (título + subtítulo). */
export function FormAuthHeader({ titulo, subtitulo }: { titulo: string; subtitulo: string }) {
  return (
    <header className="mb-7">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{titulo}</h1>
      <p className="mt-1 text-sm text-zinc-500">{subtitulo}</p>
    </header>
  )
}