"use client";

import { Component, type ReactNode, useEffect } from "react";
import { logError, installGlobalErrorHandlers } from "@/lib/error-log";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string | null;
}

/**
 * App-wide error boundary (Stage A3).
 *
 * Catches React render-tree exceptions, logs to localStorage via error-log,
 * and renders a fallback UI with retry + download log buttons. Combined
 * with installGlobalErrorHandlers() (window.onerror + unhandledrejection),
 * this gives full client-side error visibility without external services.
 *
 * The fallback uses inline styles so a broken Tailwind setup doesn't make
 * the error screen invisible.
 */
class ErrorBoundaryClass extends Component<Props, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, componentStack: null };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }): void {
    logError({
      source: "boundary",
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack ?? undefined,
      route: typeof window !== "undefined" ? window.location.pathname : undefined,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    });
    this.setState({ componentStack: info.componentStack ?? null });
  }

  reset = () => {
    this.setState({ error: null, componentStack: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main
        style={{
          maxWidth: 640,
          margin: "4rem auto",
          padding: "1.5rem",
          fontFamily: "system-ui, sans-serif",
          color: "#18181b",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
          앗 — 오류 발생
        </h1>
        <p style={{ color: "#52525b", marginBottom: "1rem" }}>
          예상치 못한 오류가 발생했습니다. 자동으로 기록되었으니 잠시 후 다시 시도해 주세요.
        </p>
        <pre
          style={{
            background: "#fee2e2",
            color: "#7f1d1d",
            padding: "0.75rem",
            borderRadius: 6,
            overflow: "auto",
            fontSize: "0.75rem",
            maxHeight: 240,
            whiteSpace: "pre-wrap",
          }}
        >
          {this.state.error.message}
          {this.state.componentStack ? "\n\n" + this.state.componentStack : ""}
        </pre>
        <div style={{ display: "flex", gap: 8, marginTop: "1rem", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={this.reset}
            style={{
              background: "#18181b",
              color: "white",
              border: "none",
              padding: "0.5rem 1rem",
              borderRadius: 6,
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            다시 시도
          </button>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") window.location.reload();
            }}
            style={{
              background: "white",
              color: "#18181b",
              border: "1px solid #e4e4e7",
              padding: "0.5rem 1rem",
              borderRadius: 6,
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            새로고침
          </button>
          <button
            type="button"
            onClick={() => {
              import("@/lib/error-log").then(({ downloadErrorLog }) => downloadErrorLog());
            }}
            style={{
              background: "white",
              color: "#3f3f46",
              border: "1px solid #e4e4e7",
              padding: "0.5rem 1rem",
              borderRadius: 6,
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            오류 로그 다운로드
          </button>
        </div>
        <p style={{ fontSize: "0.7rem", color: "#71717a", marginTop: "1rem" }}>
          로그는 브라우저 localStorage에 저장됩니다 (외부 전송 없음). 콘솔에서{" "}
          <code>__oelp.errorLog.read()</code>로 확인 가능.
        </p>
      </main>
    );
  }
}

/**
 * Wrapper that installs global error handlers on mount + delegates render.
 */
export function ErrorBoundary({ children }: Props) {
  useEffect(() => {
    installGlobalErrorHandlers();
  }, []);
  return <ErrorBoundaryClass>{children}</ErrorBoundaryClass>;
}
