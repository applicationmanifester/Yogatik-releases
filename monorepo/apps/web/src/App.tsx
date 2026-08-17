import { useState } from "react";
import { Button, Input, Modal } from "@ui/index";
import { formatDate, APP_NAME, type Note } from "@shared/index";

/** Web root. Uses the SAME shared logic + UI as the desktop app. */
export function App() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const now = Date.now();
  const demo: Note = { id: "1", title: "Welcome", body: "Shared note", createdAt: now, updatedAt: now };

  return (
    <main style={{ fontFamily: "system-ui", padding: 32, maxWidth: 640, margin: "0 auto" }}>
      <h1>{APP_NAME} — Web</h1>
      <p>Last note updated {formatDate(demo.updatedAt)}.</p>
      <Button onClick={() => setOpen(true)}>New note</Button>

      <Modal open={open} title="New note" onClose={() => setOpen(false)}>
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
          <Button onClick={() => setOpen(false)}>Save</Button>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      </Modal>
    </main>
  );
}
