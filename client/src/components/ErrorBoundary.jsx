import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <main className="grid min-h-screen place-items-center bg-cloud p-4 text-ink">
        <section className="max-w-lg rounded border border-red-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-1 h-6 w-6 shrink-0 text-red-600" />
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-red-600">Something went wrong</p>
              <h1 className="mt-2 text-2xl font-black">Reload the dashboard</h1>
              <p className="mt-2 text-sm leading-6 text-ink/65">
                The page hit an unexpected error. Your saved browser history is kept on this device.
              </p>
            </div>
          </div>
          <button className="ui-button-primary mt-5 flex w-full items-center justify-center gap-2" type="button" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4" />
            Reload
          </button>
        </section>
      </main>
    );
  }
}
