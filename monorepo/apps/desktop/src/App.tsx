import { useEffect, useState } from "react";
import { Button } from "@ui/index";
import { APP_NAME } from "@shared/index";

/** Desktop root — same shared UI + logic as web, plus native IPC. */
export function App() {
  const [version, setVersion] = useState("…");

  useEffect(() => {
    void window.acme?.getVersion().then(setVersion);
    const off = window.acme?.onMenu((action) => {
      if (action === "new-note") alert("New note (from native menu)");
    });
    return off;
  }, []);

  return (
    <main style={{ fontFamily: "system-ui", padding: 32 }}>
      <h1>{APP_NAME} — Desktop</h1>
      <p>App version (via secure IPC): {version}</p>
      <Button onClick={() => window.acme?.openExternal("https://example.com")}>
        Open website
      </Button>
    </main>
  );
}
