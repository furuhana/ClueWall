import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="w-screen h-screen bg-[#1a1a1a] flex items-center justify-center p-4">
                    <div className="max-w-md w-full bg-black/50 border border-red-900/50 rounded-lg p-6 backdrop-blur-sm shadow-2xl">
                        <div className="flex flex-col items-center text-center gap-4">
                            <div className="w-16 h-16 rounded-full bg-red-900/20 flex items-center justify-center border border-red-500/30">
                                <AlertTriangle size={32} className="text-red-500" />
                            </div>

                            <h1 className="text-xl font-bold text-red-400 uppercase tracking-widest">
                                System Malfunction
                            </h1>

                            <div className="text-xs font-mono text-red-200/70 bg-red-950/30 p-3 rounded w-full overflow-hidden text-left border border-red-900/30">
                                {this.state.error?.toString()}
                            </div>

                            <p className="text-sm text-gray-400">
                                The agent interface encountered a critical error. Please reform connection.
                            </p>

                            <button
                                onClick={() => window.location.reload()}
                                className="flex items-center gap-2 px-6 py-2 bg-red-700 hover:bg-red-600 text-white rounded font-bold uppercase tracking-wider text-xs transition-colors"
                            >
                                <RefreshCw size={14} /> Reboot System
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
