import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'An unexpected error occurred.' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('ErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0a1628] text-[#f0f4ff] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white/5 border-2 border-[#e63946]/50 rounded-2xl p-6 text-center">
            <div className="text-4xl mb-3">⚠️</div>
            <h2 className="font-display text-3xl text-[#ffd60a] tracking-wider mb-2">
              Something Went Wrong
            </h2>
            <p className="text-sm text-[#f0f4ff]/70 mb-5 break-words">{this.state.message}</p>
            <button
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                window.location.reload();
              }}
              className="px-6 py-2.5 rounded-full bg-gradient-to-r from-[#f77f00] to-[#ffb347] text-white font-extrabold text-sm uppercase cursor-pointer"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
