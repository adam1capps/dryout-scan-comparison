import { C } from "../theme.js";

/**
 * A fixed-shape window onto one roof drawing.
 *
 * The frame takes its aspect ratio from the image's real dimensions, so an
 * `object-fit: contain` image fills it edge to edge with no letterboxing. That
 * is what lets a marker stored as "62% across, 40% down" land on the same spot
 * on the roof at every viewport width — the percentage is of the frame, and the
 * frame is the image.
 *
 * The one deliberate exception is the pre-install scan, which is given the
 * post-install scan's aspect so the two compare at a single scale. Pre and post
 * of the same roof differ slightly in crop, so the pre image letterboxes a
 * little inside the shared frame. Markers are only ever placed on the post
 * scan, so nothing is mispositioned by it.
 */
export default function ScanFrame({
  aspect,
  src,
  alt,
  emptyLabel,
  maxHeight = "56vh",
  children,
}) {
  return (
    <div
      data-frame="1"
      style={{
        position: "relative",
        overflow: "hidden",
        background: C.frame,
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        aspectRatio: aspect,
        maxHeight,
        margin: "0 auto",
      }}
    >
      <div style={{ position: "absolute", inset: 0 }}>
        {src ? (
          <img
            src={src}
            alt={alt}
            draggable="false"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "contain",
            }}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: emptyLabel ? C.surface : C.borderSoft,
              color: emptyLabel ? C.muted : "#8a90a0",
              fontSize: emptyLabel ? 14 : 13,
              fontWeight: emptyLabel ? 400 : 600,
              padding: 16,
              textAlign: "center",
              boxSizing: "border-box",
            }}
          >
            {emptyLabel || "Scan pending"}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

/** The transparent hit layer that turns a click into an x/y percentage. */
export function PlacementLayer({ active, onPlace, zIndex = 3 }) {
  return (
    <div
      onClick={(e) => {
        if (!active) return;
        const r = e.currentTarget.getBoundingClientRect();
        onPlace(
          +(((e.clientX - r.left) / r.width) * 100).toFixed(2),
          +(((e.clientY - r.top) / r.height) * 100).toFixed(2),
        );
      }}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: active ? "auto" : "none",
        cursor: active ? "crosshair" : "default",
        zIndex,
      }}
    />
  );
}

/** Positions a marker button by percentage, centred on its point. */
export function markerStyle({ x, y, size, interactive = true, zIndex = 6 }) {
  return {
    position: "absolute",
    left: `${x}%`,
    top: `${y}%`,
    transform: "translate(-50%,-50%)",
    width: size,
    height: size,
    background: "transparent",
    border: "none",
    padding: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    pointerEvents: interactive ? "auto" : "none",
    zIndex,
  };
}
