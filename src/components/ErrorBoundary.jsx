import { Component } from "react";
import { C } from "../theme.js";

/**
 * Stops one broken component from blanking the whole report.
 *
 * React's default response to an error thrown during render is to unmount the
 * entire tree, which on a client-facing page means a white screen — the worst
 * possible failure, because it looks like the site is down rather than like one
 * panel is misbehaving. A boundary turns that into a contained message with the
 * rest of the page intact.
 *
 * Errors are far likelier in the editing paths, which only render for signed-in
 * staff, so a fault there must not be able to take the report away from the
 * reader it was written for.
 *
 * `fallback` replaces the message with something to render instead — used to
 * drop to the read-only report when sign-in fails. `page` marks the outermost
 * boundary: nothing else on the page survived, so it says so and shows what
 * failed, because a whole-page failure with no detail is undiagnosable.
 */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Kept in the console so a report of "it went blank" has something to go on.
    console.error("Render error contained by boundary:", error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;

    const { page } = this.props;
    return (
      <div
        role="alert"
        style={{
          border: `1px solid ${C.red}55`,
          background: "rgba(214,69,69,0.06)",
          borderRadius: 8,
          padding: "16px 18px",
          margin: "12px 0",
          fontSize: 14,
          color: C.ink,
        }}
      >
        <div style={{ fontWeight: 700, color: "#C03A3A", marginBottom: 6 }}>
          {this.props.label || "This section could not be displayed."}
        </div>
        <div style={{ color: C.muted, fontSize: 13 }}>
          {page
            ? "Reloading the page usually clears it."
            : "The rest of the report is unaffected. Reloading the page usually clears it."}
        </div>
        {page && (
          <details style={{ marginTop: 10, fontSize: 12, color: C.muted }}>
            <summary style={{ cursor: "pointer" }}>Technical detail</summary>
            <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: "8px 0 0" }}>
              {String(error?.stack || error?.message || error)}
            </pre>
          </details>
        )}
        <button
          onClick={() => (page ? window.location.reload() : this.setState({ error: null }))}
          style={{
            marginTop: 12,
            background: C.surface,
            color: C.navy,
            border: `1px solid ${C.borderStrong}`,
            borderRadius: 6,
            padding: "7px 12px",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {page ? "Reload" : "Try again"}
        </button>
      </div>
    );
  }
}
