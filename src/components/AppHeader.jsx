import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react";
import { C } from "../theme.js";

/**
 * The navy bar carrying both brands.
 *
 * The sign-in control sits here and nowhere else. A reader who never signs in
 * sees a quiet "Staff sign in" link and nothing else changes; signing in is
 * what turns the annotation tools on throughout the app.
 *
 * `authUnavailable` means sign-in was configured but failed to start, and the
 * app dropped to read-only. The slot says so rather than going empty — this is
 * the one place staff look for sign-in, and an absent link explains nothing.
 */
export default function AppHeader({ authEnabled, authUnavailable = false }) {
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
        {!authEnabled && authUnavailable && (
          <span
            title="Sign-in could not start. Check the Clerk keys on the site, then redeploy."
            style={{ color: C.navyTint, fontSize: 12, fontWeight: 700, opacity: 0.6 }}
          >
            Staff sign-in unavailable
          </span>
        )}
        {authEnabled && (
          <>
            <SignedIn>
              <a
                href="#/change-orders"
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
                Change orders
              </a>
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
