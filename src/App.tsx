import { ToolStatusPanel } from "./components/tool-status/ToolStatusPanel";
import "./App.css";

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>AI ChatBot — Tool Status</h1>
        <p className="subtitle">Real-time monitoring for 65 tools across 7 categories</p>
      </header>
      <main className="app-main">
        <ToolStatusPanel />
      </main>
    </div>
  );
}

export { App };