import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in ErrorBoundary:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let parsedError: Record<string, unknown> | null = null;
      try {
        parsedError = JSON.parse(this.state.errorMessage);
      } catch {
        parsedError = null;
      }

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-slate-200 rounded-md p-6">
            <div className="flex items-center gap-3 text-red-700 mb-3">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h2 className="text-base font-semibold text-slate-900">
                Analytical Platform Exception
              </h2>
            </div>
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              An error occurred while executing an analytical or persistence operation.
            </p>
            {parsedError ? (
              <pre className="text-xs font-mono bg-slate-900 text-slate-100 p-3 rounded overflow-x-auto mb-4">
                {JSON.stringify(parsedError, null, 2)}
              </pre>
            ) : (
              <div className="text-xs font-mono bg-slate-100 text-slate-800 p-3 rounded mb-4">
                {this.state.errorMessage}
              </div>
            )}
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded hover:bg-slate-800 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reload Platform
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
