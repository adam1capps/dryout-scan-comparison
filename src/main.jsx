import React from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import App from "./App.jsx";
import "./styles.css";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

/**
 * Clerk wraps the app only when a key is configured.
 *
 * The reader this site is built for has no account and never signs in. If the
 * Clerk key were ever missing or misconfigured, mounting ClerkProvider would
 * throw and take the whole report down for them — so the read-only view is
 * deliberately able to render without it. Missing key simply means nobody can
 * edit, which is the safe direction to fail in.
 */
const root = createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    {publishableKey ? (
      <ClerkProvider publishableKey={publishableKey} afterSignOutUrl="/">
        <App authEnabled />
      </ClerkProvider>
    ) : (
      <App authEnabled={false} />
    )}
  </React.StrictMode>,
);
