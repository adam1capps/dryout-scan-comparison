import React from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { initJob } from "./data/project.js";
import "./styles.css";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

/**
 * The job's manifest loads BEFORE the app mounts, so every screen renders
 * against settled data — and a real job whose manifest cannot be loaded gets
 * an honest error page, never the demo fixture's numbers.
 *
 * Clerk wraps the app only when a key is configured: the reader this site is
 * built for has no account, so the read-only view must be able to render
 * without Clerk. Missing key simply means nobody can edit, which is the safe
 * direction to fail in.
 *
 * And never a blank page, whatever fails. Three layers:
 *  - Sign-in throwing as it starts (a malformed publishable key, for one) drops
 *    to the read-only report, and the header says sign-in is unavailable.
 *  - Anything else that throws while rendering hits a page-level boundary that
 *    says what failed.
 *  - If the boot chain rejects, or an error escapes every boundary, the message
 *    is written as plain DOM, with no React involved.
 * A white page with nothing in the console is the one failure nobody can
 * diagnose from the outside, so none of these paths is allowed to produce it.
 */
const root = createRoot(document.getElementById("root"), {
  // render() only schedules work, so errors escaping every boundary surface
  // here, not in the promise chain below. React has already unmounted the tree
  // by then; the timeout writes after its commit rather than racing it.
  onUncaughtError: (error) => setTimeout(() => renderPlainFailure(error), 0),
});

function renderPlainFailure(error) {
  console.error("The report could not start:", error);
  const el = document.getElementById("root");
  if (!el) return;
  const box = document.createElement("div");
  box.setAttribute("role", "alert");
  box.style.cssText =
    "max-width:460px;margin:15vh auto;padding:26px 30px;background:#fff;" +
    "border:1px solid #e2e4ea;border-radius:8px;color:#333;" +
    "font:15px/1.6 'DM Sans',Verdana,sans-serif";
  const title = document.createElement("div");
  title.style.cssText = "font-weight:700;color:#1E2C55;font-size:18px;margin-bottom:8px";
  title.textContent = "ReDry Scan Comparison";
  const message = document.createElement("div");
  message.textContent = "The report could not start. Reload the page; if it keeps happening, contact ReDry.";
  const detail = document.createElement("pre");
  detail.style.cssText = "white-space:pre-wrap;word-break:break-word;font-size:12px;color:#6b7280;margin:12px 0 0";
  detail.textContent = String(error?.stack || error?.message || error);
  box.append(title, message, detail);
  el.replaceChildren(box);
}

function BootError({ message }) {
  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "'DM Sans', Verdana, sans-serif",
      }}
    >
      <div
        style={{
          background: "#fff",
          border: "1px solid #e2e4ea",
          borderRadius: 8,
          padding: "26px 30px",
          maxWidth: 460,
          color: "#333",
          fontSize: 15,
          lineHeight: 1.6,
        }}
      >
        <div style={{ fontWeight: 700, color: "#1E2C55", fontSize: 18, marginBottom: 8 }}>
          ReDry Scan Comparison
        </div>
        {message}
      </div>
    </div>
  );
}

function Root({ boot }) {
  if (!boot.ok) return <BootError message={boot.error} />;
  if (!publishableKey) return <App authEnabled={false} />;
  return (
    <ErrorBoundary fallback={<App authEnabled={false} authUnavailable />}>
      <ClerkProvider publishableKey={publishableKey} afterSignOutUrl="/">
        <App authEnabled />
      </ClerkProvider>
    </ErrorBoundary>
  );
}

initJob()
  .then((boot) => {
    root.render(
      <React.StrictMode>
        <ErrorBoundary page label="The report could not be displayed.">
          <Root boot={boot} />
        </ErrorBoundary>
      </React.StrictMode>,
    );
  })
  .catch(renderPlainFailure);
