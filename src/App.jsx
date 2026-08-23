import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import AppHeader from "./components/AppHeader.jsx";
import Footer from "./components/Footer.jsx";
import Lightbox from "./components/Lightbox.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import CampusOverview from "./screens/CampusOverview.jsx";
import BuildingDetail from "./screens/BuildingDetail.jsx";
import { TERMS, findBuilding } from "./data/project.js";
import { useAnnotations } from "./useAnnotations.js";
import { useDeployVersion } from "./useDeployVersion.js";
import { C } from "./theme.js";

/**
 * Clerk's hooks only exist inside ClerkProvider, and hooks cannot be called
 * conditionally — so the two cases are two components rather than one branch.
 * `authEnabled` comes from build-time env and never changes at runtime, so
 * React never has to swap between them mid-session.
 */
export default function App({ authEnabled }) {
  return authEnabled ? <AuthedApp /> : <Shell canEdit={false} getToken={null} />;
}

function AuthedApp() {
  const { isSignedIn, getToken } = useAuth();
  return <Shell canEdit={!!isSignedIn} getToken={getToken} authEnabled />;
}

function Shell({ canEdit, getToken, authEnabled = false }) {
  const store = useAnnotations(getToken);
  const updateAvailable = useDeployVersion();
  // "campus", or a building id.
  const [view, setView] = useState("campus");
  const [lightbox, setLightbox] = useState(null);

  const openBuilding = useCallback((id) => {
    setView(id);
    window.scrollTo(0, 0);
  }, []);

  const goCampus = useCallback(() => {
    setView("campus");
    window.scrollTo(0, 0);
  }, []);

  // Escape closes the lightbox from anywhere; the building screen handles the
  // rest of its own Escape behaviour (cancel placing, close the panel).
  useEffect(() => {
    if (!lightbox) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  const building = view === "campus" ? null : findBuilding(view);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <AppHeader authEnabled={authEnabled} />

      <main
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          padding: "28px 24px 40px",
          width: "100%",
          boxSizing: "border-box",
          flex: 1,
        }}
      >
        {updateAvailable && <UpdateBar />}
        {store.error && <ErrorBar message={store.error} onDismiss={store.dismissError} />}

        {store.status === "loading" ? (
          <LoadingNote />
        ) : building ? (
          // Keyed by building so a contained error clears when another is
          // opened, rather than the boundary staying tripped.
          <ErrorBoundary
            key={building.id}
            label={`${building.name} could not be displayed.`}
          >
            <BuildingDetail
              building={building}
              store={store}
              canEdit={canEdit}
              onBack={goCampus}
              onLightbox={setLightbox}
              lightboxOpen={!!lightbox}
            />
          </ErrorBoundary>
        ) : (
          <ErrorBoundary label={`The ${TERMS.site.toLowerCase()} overview could not be displayed.`}>
            <CampusOverview store={store} canEdit={canEdit} onOpenBuilding={openBuilding} />
          </ErrorBoundary>
        )}
      </main>

      <Footer />
      <Lightbox src={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}

/**
 * Shown when the server has a newer build than this tab is running. Never
 * reloads on its own — that would discard whatever is half-typed in a panel.
 */
function UpdateBar() {
  return (
    <div
      style={{
        background: "rgba(0,189,112,0.09)",
        border: `1px solid ${C.green}55`,
        borderRadius: 8,
        padding: "12px 16px",
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        fontSize: 14,
        color: C.ink,
      }}
    >
      <span style={{ flex: 1 }}>
        A newer version of this report has been published. Refresh to load it.
      </span>
      <button
        onClick={() => window.location.reload()}
        style={{
          background: C.navy,
          color: "#fff",
          border: "none",
          borderRadius: 6,
          padding: "7px 13px",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Refresh
      </button>
    </div>
  );
}

function LoadingNote() {
  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        padding: "22px 24px",
        color: C.muted,
        fontSize: 15,
      }}
    >
      Loading the latest scan data…
    </div>
  );
}

/**
 * A failed write is shown but never blocks reading. The scans and the tables
 * come from the bundle, so the report stays useful even if the annotation API
 * is unreachable.
 */
function ErrorBar({ message, onDismiss }) {
  return (
    <div
      role="alert"
      style={{
        background: "rgba(214,69,69,0.08)",
        border: `1px solid ${C.red}55`,
        borderRadius: 8,
        padding: "12px 16px",
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontSize: 14,
        color: "#C03A3A",
      }}
    >
      <span style={{ flex: 1 }}>{message}</span>
      <button
        onClick={onDismiss}
        style={{
          background: "none",
          border: "none",
          color: "#C03A3A",
          fontSize: 15,
          cursor: "pointer",
          padding: "2px 6px",
          lineHeight: 1,
        }}
        aria-label="Dismiss"
      >
        &#10005;
      </button>
    </div>
  );
}
