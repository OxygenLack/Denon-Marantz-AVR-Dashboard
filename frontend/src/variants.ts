import type { Variants, Transition } from 'framer-motion'

export const fadeInUp: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: 4 },
}

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit:    { opacity: 0 },
}

export const FAST: Transition    = { duration: 0.18, ease: 'easeOut' }
export const SPRING: Transition  = { type: 'spring', stiffness: 400, damping: 28 }
export const SPIN: Transition    = { duration: 1, repeat: Infinity, ease: 'linear' }
export const PULSE: Transition   = { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }
export const BOUNCE: Transition  = { duration: 0.6, repeat: Infinity, ease: 'easeInOut' }
