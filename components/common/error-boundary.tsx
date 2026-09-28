"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

// PRD 32 / AC-13: a crash in one place never blanks the app. Every boundary
// states what happened in plain language and offers one next action.

interface ErrorBoundaryProps {
  /** Names the area in the message, e.g. "the map canvas". */
  area: string;
  children: ReactNode;
  /** Extra recovery action beside Reload. */
  onReset?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // PRD 32: log for the developer; the user sees plain language only.
    console.error(`Error boundary (${this.props.area}) caught:`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"
      >
        <div className="grid size-14 place-items-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertTriangle className="size-7" aria-hidden />
        </div>
        <h2 className="font-heading text-base font-semibold">
          Something went wrong in {this.props.area}
        </h2>
        <p className="max-w-xs text-sm text-muted-foreground">
          Your work is saved. Reload to keep going.
        </p>
        <div className="flex gap-2">
          <Button className="h-11 rounded-lg px-5" onClick={() => this.setState({ error: null })}>
            Reload
          </Button>
          {this.props.onReset && (
            <Button variant="outline" className="h-11 rounded-lg px-5" onClick={this.props.onReset}>
              Back to projects
            </Button>
          )}
        </div>
      </div>
    );
  }
}
