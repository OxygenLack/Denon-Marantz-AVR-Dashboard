import React from 'react'
import { clearAppCaches } from '../utils/clearAppCaches'

interface ErrorBoundaryProps {
  children: React.ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Dashboard render error:', error, info)
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-denon-dark p-6 text-denon-text">
          <div className="card max-w-md w-full text-center space-y-3">
            <h1 className="text-lg font-bold text-denon-red">Dashboard failed to render</h1>
            <p className="text-sm text-denon-muted">
              A frontend error occurred. Clear stale browser cache/service worker data and reload.
            </p>
            <pre className="text-left text-xs text-denon-muted/80 bg-denon-surface rounded-xl p-3 overflow-auto max-h-40">
              {String(this.state.error?.message || this.state.error)}
            </pre>
            <button
              className="btn-primary"
              onClick={async () => {
                try {
                  await clearAppCaches({ allCaches: true })
                } finally {
                  window.location.reload()
                }
              }}
            >
              Clear cache and reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
