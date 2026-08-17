import type { InputHTMLAttributes } from "react";
import { tokens } from "./theme.js";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ label, id, style, ...rest }: InputProps) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: tokens.space(1) }}>
      {label ? <span style={{ fontSize: 13, color: tokens.color.text }}>{label}</span> : null}
      <input
        id={id}
        style={{
          border: `1px solid ${tokens.color.border}`,
          borderRadius: tokens.radius.sm,
          padding: tokens.space(2),
          fontSize: 14,
          ...style,
        }}
        {...rest}
      />
    </label>
  );
}
