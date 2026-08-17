import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./Button.js";

const meta: Meta<typeof Button> = { title: "UI/Button", component: Button };
export default meta;

export const Primary: StoryObj<typeof Button> = { args: { children: "Click me" } };
export const Secondary: StoryObj<typeof Button> = {
  args: { children: "Secondary", variant: "secondary" },
};
export const Danger: StoryObj<typeof Button> = {
  args: { children: "Delete", variant: "danger" },
};
