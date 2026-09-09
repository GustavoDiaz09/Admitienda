import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface Props {
  children: ReactNode
  className?: string
}

/** Superficie principal elevada (radio 16px, sombra tintada al fondo). */
export function Card({ children, className }: Props) {
  return (
    <div className={cn('rounded-2xl border border-zinc-200 bg-white shadow-card', className)}>
      {children}
    </div>
  )
}