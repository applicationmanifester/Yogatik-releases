import type { ReactNode } from "react";
import { tokens } from "./theme.js";

export interface ModalProps {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ open, title, onClose, children }: ModalProps) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "grid",
        placeItems: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: tokens.color.surface,
          borderRadius: tokens.radius.lg,
          padding: tokens.space(6),
          minWidth: 320,
          maxWidth: "90vw",
        }}
      >
        {title ? <h2 style={{ marginTop: 0 }}>{title}</h2> : null}
        {children}
      </div>
    </div>
  );
}
