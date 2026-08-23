import { C } from "../theme.js";

export default function Footer() {
  return (
    <footer style={{ borderTop: `2px solid ${C.navy}`, background: C.surface }}>
      <div
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          padding: "14px 24px",
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          fontSize: 13,
          color: "#555",
          boxSizing: "border-box",
        }}
      >
        <span>
          <span style={{ fontWeight: 700, color: C.navy }}>ReDry</span> &middot;{" "}
          <a href="https://re-dry.com">re-dry.com</a> &middot; 877.733.7973
        </span>
        <span>
          <span style={{ fontWeight: 700, color: C.navy }}>Roof MRI</span> &middot;{" "}
          <a href="https://roof-mri.com">roof-mri.com</a> &middot; Advancing the Science of
          Moisture Detection
        </span>
      </div>
    </footer>
  );
}
