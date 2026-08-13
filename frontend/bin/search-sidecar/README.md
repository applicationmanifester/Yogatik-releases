# Local Search Sidecar — Build Instructions

## Prerequisites

**Go 1.21+** must be installed on the build machine:
- Windows: `winget install GoLang.Go` or download from https://go.dev/dl/
- Linux: `sudo apt install golang-go` / `sudo dnf install golang`
- macOS: `brew install go`

## Building the sidecar

```bash
# From the frontend directory
cd frontend

# Build for current platform
go build -o bin/search-sidecar/search-sidecar ./bin/search-sidecar/main.go

# Cross-compile for Windows (from Linux/macOS)
GOOS=windows GOARCH=amd64 go build -o bin/search-sidecar/search-sidecar.exe ./bin/search-sidecar/main.go

# Cross-compile for Linux
GOOS=linux GOARCH=amd64 go build -o bin/search-sidecar/search-sidecar ./bin/search-sidecar/main.go

# Cross-compile for macOS (Intel)
GOOS=darwin GOARCH=amd64 go build -o bin/search-sidecar/search-sidecar ./bin/search-sidecar/main.go

# Cross-compile for macOS (Apple Silicon)
GOOS=darwin GOARCH=arm64 go build -o bin/search-sidecar/search-sidecar ./bin/search-sidecar/main.go
```

The sidecar uses **three free, keyless search engines**:
- **DuckDuckGo Lite** — always available, no key required
- **Marginalia** — independent crawler, non-commercial bias
- **Wikipedia** — excellent for definitional queries

No Brave API key or any external API dependency.

## Electron integration

The sidecar is bundled via `package.json` `extraResources`:

```json
"extraResources": [{
  "from": "bin/search-sidecar",
  "to": "search-sidecar",
  "filter": ["**/*"]
}]
```

At runtime, `main.cjs` spawns it from `process.resourcesPath` and captures the `PORT=` output to know which port it's listening on.

## Testing the sidecar manually

```bash
# Run directly
cd frontend/bin/search-sidecar
go run main.go --port=0

# Test search
curl "http://127.0.0.1:PORT/search?q=golang+programming&count=5&engines=all"
```

## Size estimates

| Platform | Binary size (stripped) |
|----------|------------------------|
| Windows (amd64) | ~12 MB |
| Linux (amd64) | ~11 MB |
| macOS (amd64) | ~12 MB |
| macOS (arm64) | ~11 MB |

Total installer impact: ~12 MB (negligible vs ~150 MB Electron baseline)

## CI/CD (GitHub Actions)

```yaml
# .github/workflows/build-sidecar.yml
name: Build Search Sidecar
on: [push, workflow_dispatch]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with: { go-version: '1.22' }
      - name: Build all platforms
        run: |
          cd frontend
          for os in windows linux darwin; do
            for arch in amd64 arm64; do
              [ "$os" = "windows" ] && ext=".exe" || ext=""
              GOOS=$os GOARCH=$arch go build -o bin/search-sidecar/search-sidecar$ext ./bin/search-sidecar/main.go
            done
          done
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: search-sidecar
          path: frontend/bin/search-sidecar/*
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `PORT=` not printed | Check stdout buffering; the Go code uses `fmt.Printf` which is line-buffered when stdout is a pipe |
| Sidecar fails to start | Ensure binary is in `resources/search-sidecar` (or `resources/search-sidecar.exe` on Windows) |
| CORS errors | Sidecar runs on localhost — no CORS issues. If you see them, check `127.0.0.1` vs `localhost` |

## Architecture note

The sidecar is a **metasearch engine** — it queries multiple engines in parallel and merges results by URL agreement (same algorithm as `webSearch.js`):

1. **DuckDuckGo Lite** — always available, no key
2. **Marginalia** — independent crawler, non-commercial bias
3. **Wikipedia** — great for definitional queries

Results are deduplicated, scored by cross-engine agreement, and returned in the same JSON format as the browser tool.