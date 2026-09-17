"use client";

import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Props = { children: ReactNode; storageKey?: string };
type State = { error: Error | null };

// Keeps corrupt/legacy localStorage data from crashing the whole page.
export default class SafeBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  private reset = () => {
    try {
      if (this.props.storageKey) localStorage.removeItem(this.props.storageKey);
    } catch {
      // storage unavailable — reload anyway
    }
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">stat panel hiccup 🫠</p>
          <p className="mt-1">
            Saved run data from an older version couldn&apos;t be read. Resetting local stats fixes
            it.
          </p>
          <Button size="sm" variant="outline" className="mt-3" onClick={this.reset}>
            🚿 reset local stats
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
