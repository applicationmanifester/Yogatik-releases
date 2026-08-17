import type { ButtonHTMLAttributes } from "react";
import { tokens } from "./theme.js";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
}

export function Button({ variant = "primary", style, ...rest }: ButtonProps) {
  const bg =
    variant === "primary"
      ? tokens.color.brand
      : variant === "danger"
        ? tokens.color.danger
        : "transparent";
  const color = variant === "secondary" ? tokens.color.text : tokens.color.brandFg;
  return (
    <button
      style={{
        background: bg,
        color,
        border: variant === "secondary" ? `1px solid ${tokens.color.border}` : "none",
        borderRadius: tokens.radius.md,
        padding: `${tokens.space(2)} ${tokens.space(4)}`,
        cursor: "pointer",
        fontWeight: 600,
        ...style,
      }}
      {...rest}
    />
  );
}
