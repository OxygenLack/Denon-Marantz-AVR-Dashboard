import { createContext, useContext } from 'react'

export type ToastKind = 'error' | 'info'

export interface ToastInput {
  kind: ToastKind
  text: string
}

export interface Toast extends ToastInput {
  id: number
}

export interface ToastApi {
  show: (toast: ToastInput) => void
}

// Default is a no-op so components render (and test) fine outside a provider.
export const ToastContext = createContext<ToastApi>({ show: () => {} })

export function useToast(): ToastApi {
  return useContext(ToastContext)
}
