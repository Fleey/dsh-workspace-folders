/**
 * Types of the Web client's shared modules this bundle requires at runtime.
 * The page's module table supplies the real modules (DSH 0.2.1); only the
 * members used here are declared.
 */
declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactElement, ReactNode, RefAttributes } from 'react'

  export function Modal(props: {
    open: boolean
    onClose: () => void
    title: string
    closeLabel: string
    description?: string
    children?: ReactNode
    footer?: ReactNode
    className?: string
    contentClassName?: string
  }): ReactElement | null

  export function Button(props: {
    variant?: 'primary' | 'ghost' | 'outline' | 'toolbar'
    size?: 'md' | 'sm'
    icon?: ReactNode
    className?: string | undefined
    children?: ReactNode
  } & ButtonHTMLAttributes<HTMLButtonElement>): ReactElement

  export const Input: (props: {
    icon?: ReactNode
    className?: string
  } & InputHTMLAttributes<HTMLInputElement> & RefAttributes<HTMLInputElement>) => ReactElement
}
