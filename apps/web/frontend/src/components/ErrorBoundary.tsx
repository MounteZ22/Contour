import { Component, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center p-8">
          <div className="flex flex-col items-center gap-4 max-w-md text-center">
            <div className="w-12 h-12 rounded-full bg-danger-subtle-bg/30 flex items-center justify-center">
              <AlertCircle size={24} className="text-danger" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary font-headline">页面渲染出错</h2>
              <p className="mt-1.5 text-sm text-text-secondary leading-relaxed">
                {this.state.error.message || '发生了未知错误'}
              </p>
            </div>
            <button
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-md border text-sm font-medium cursor-pointer transition-colors bg-accent-subtle-bg/15 border-accent-strong/25 text-accent-strong hover:bg-accent-subtle-bg/30 font-mono"
              onClick={() => this.setState({ error: null })}
              type="button"
            >
              重试
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
