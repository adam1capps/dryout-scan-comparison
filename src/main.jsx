import React from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import App from "./App.jsx";
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
 */
const root = createRoot(document.getElementById("root"));

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

initJob().then((boot) => {
  root.render(
    <React.StrictMode>
      {!boot.ok ? (
        <BootError message={boot.error} />
      ) : publishableKey ? (
        <ClerkProvider publishableKey={publishableKey} afterSignOutUrl="/">
          <App authEnabled />
        </ClerkProvider>
      ) : (
        <App authEnabled={false} />
      )}
    </React.StrictMode>,
  );
});
