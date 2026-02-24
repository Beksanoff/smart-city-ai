import { Component, ErrorInfo, ReactNode } from 'react'
import i18n from '../i18n'

interface Props {
    children: ReactNode
    fallback?: ReactNode
}

interface State {
    hasError: boolean
    error: Error | null
}

class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props)
        this.state = { hasError: false, error: null }
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error }
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('ErrorBoundary caught:', error, errorInfo)
    }

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback
            }
            return (
                <div className="cyber-card p-6 text-center">
                    <h2 className="text-lg font-semibold text-red-400 mb-2">
                        {i18n.t('common.errorOccurred')}
                    </h2>
                    <p className="text-cyber-muted text-sm mb-4 break-words">
                        {this.state.error?.message || i18n.t('common.unknownError')}
                    </p>
                    <button
                        onClick={() => this.setState({ hasError: false, error: null })}
                        className="px-4 py-2 rounded bg-cyber-cyan/20 text-cyber-cyan hover:bg-cyber-cyan/30 transition-colors"
                    >
                        {i18n.t('common.tryAgain')}
                    </button>
                </div>
            )
        }

        return this.props.children
    }
}

export default ErrorBoundary
