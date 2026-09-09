# Consultation Analytics startup

Keep the backend and frontend running in two PowerShell terminals.

From the repository root, start Flask:

```powershell
.\venv\Scripts\python.exe -m flask --app server run --host 127.0.0.1 --port 5000
```

PostgreSQL must be running and `DATABASE_URL` must be configured in the backend
terminal for URL analysis and history. Keep database credentials out of frontend files.

From the repository root in the second terminal:

```powershell
cd frontend
npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open http://127.0.0.1:5173/ and select **Public URL** for the URL input and
**Analyze consultation** action. Existing supported-source restrictions apply.

`npm.cmd` works when PowerShell execution policy blocks `npm.ps1`. The strict
port option reports a conflict instead of silently selecting another port.
Stopping Vite makes the website unavailable. Flask is required for analysis and history.

The API client uses relative URLs. Vite proxies `/health`, `/consultations`,
`/analyze` (including `/analyze-url` and `/analyze-file`), and `/predict` to
http://127.0.0.1:5000. No frontend API environment variable is required.
The explicit `/analyze-url` proxy preserves the browser Host header so Flask's
same-origin check can validate browser submissions without relaxing security.

Use `npm.cmd ci` only if dependencies need installation from the existing lockfile.
Validate from the frontend directory with `npm.cmd run build`, `npm.cmd run lint`,
and `node --test ../tests/phase5_react_contracts.test.mjs ../tests/phase5_history.test.mjs`.

## Vite template notes

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
