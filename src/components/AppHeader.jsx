import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react";
import { C } from "../theme.js";

/**
 * The navy bar carrying both brands.
 *
 * The sign-in control sits here and nowhere else. A reader who never signs in
 * sees a quiet "Staff sign in" link and nothing else changes; signing in is
 * what turns the annotation tools on throughout the app.
 */
export default function AppHeader({ authEnabled }) {
  return (
    <header
      style={{ background: C.navy, position: "sticky", top: 0, zIndex: 60 }}
    >
      <div
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          padding: "10px 24px",
          display: "flex",
          alignItems: "center",
          gap: 18,
          boxSizing: "border-box",
        }}
      >
        <img
          src="/assets/redry-logo-on-navy.png"
          alt="ReDry"
          style={{ height: 38, width: "auto", display: "block" }}
        />
        <div style={{ width: 1, height: 26, background: "rgba(255,255,255,0.25)" }} />
        <img
          src="/assets/roofmri-logo-on-navy.png"
          alt="Roof MRI"
          style={{ height: 34, width: "auto", display: "block" }}
        />
        <div style={{ flex: 1 }} />
        <div
          style={{
            color: C.navyTint,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Drying Progress
        </div>
        {authEnabled && (
          <>
            <SignedIn>
              <a
                href="#/setup"
                style={{
                  color: C.navyTint,
                  fontSize: 12,
                  fontWeight: 700,
                  textDecoration: "none",
                  border: "1px solid rgba(255,255,255,0.25)",
                  borderRadius: 6,
                  padding: "6px 12px",
                }}
              >
                Job setup
              </a>
            </SignedIn>
            <SignedOut>
              <SignInButton mode="modal">
                <button
                  style={{
                    background: "transparent",
                    color: C.navyTint,
                    border: "1px solid rgba(255,255,255,0.25)",
                    borderRadius: 6,
                    padding: "6px 12px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Staff sign in
                </button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <UserButton
                appearance={{ elements: { avatarBox: { width: 30, height: 30 } } }}
              />
            </SignedIn>
          </>
        )}
      </div>
    </header>
  );
}
