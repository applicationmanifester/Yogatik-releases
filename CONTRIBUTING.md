# Contributing to Yogatik

Thank you for your interest in contributing to Yogatik! This document provides guidelines for setting up your environment, running tests, submitting changes, and understanding the project's architecture.

---

## 1. Prerequisites

- **Node.js**: v20+ (v22 LTS recommended)
- **Package Manager**: `npm` or `pnpm`
- **Optional**: Python 3.11+ (for local embeddings and Pyodide extensions), Go 1.22+ (for search sidecar)

---

## 2. Getting Started

### Installation
```bash
# Clone the repository
git clone https://github.com/your-username/yogatik.git
cd yogatik

# Install root dependencies
npm install

# Install frontend dependencies
cd frontend
npm install
```

### Running Locally
```bash
# Start Web Development Server (Vite)
npm run dev

# Start Electron Desktop App in Development Mode
npm run electron
```

---

## 3. Testing & Code Quality

Before opening a pull request, ensure all linters, type checks, and test suites pass:

```bash
# In root: run vitest architecture & tool suite
npm run test

# In frontend/: run full test suite
cd frontend
npm run lint
npm test
npm run e2e
```

---

## 4. Building the Application

```bash
# Build Web Production Bundle
cd frontend
npm run build

# Build Standalone Electron Desktop App (Windows NSIS & Unpacked)
npm run electron:build:studio
```

---

## 5. Pull Request Conventions

1. **Branch Naming**:
   - `feat/feature-name` for new capabilities.
   - `fix/bug-description` for bug fixes.
   - `perf/optimization` for performance enhancements.
2. **Commit Messages**: Follow Conventional Commits:
   - `feat: add openalex citation graph tool`
   - `fix(roots): unbind chat folder on conversation deletion`
   - `perf: speculative pre-warm for pyodide wasm runtime`
3. **Automated CI**: Every PR runs `.github/workflows/ci.yml` (Linting, Vitest tests, Playwright E2E, and Production Build).
