import { C } from "../theme.js";

export default function Lightbox({ src, onClose }) {
  if (!src) return null;
  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Finding photo enlarged"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,26,45,0.55)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "zoom-out",
        padding: 32,
      }}
    >
      <img
        src={src}
        alt="Finding photo enlarged"
        style={{
          maxWidth: "92%",
          maxHeight: "92%",
          borderRadius: 8,
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          background: C.surface,
        }}
      />
    </div>
  );
}
