# Canonical frontend resolution — 8 September 2026

## Observed cause

Port 5000 was owned by PID 16060, launched through project venv launcher PID 5616 with `python.exe server.py`. Port 5050 was owned by PID 27040, launched through PID 4456 with `python.exe -c "from server import app; app.run(host='127.0.0.1',port=5050,debug=False)"`. A further `server.py` launcher/child pair was present; these obsolete project instances were stopped before the canonical restart.

The old port-5000 process returned 36,529 characters of the previous HTML. Port 5050 returned 16,261 characters of the redesigned HTML. Both served byte-equivalent CSS and JavaScript content from the project static files. The old non-debug Flask process retained a compiled Jinja template; it combined obsolete HTML with updated assets. The 5050 process was a fresh import of the same real Flask app, not a mock frontend or another implementation.

There is one `templates/index.html`, one `static/css/style.css`, and one modular JavaScript application in `static/js/`. `app.py` is the separate pre-existing Streamlit interface, not either Flask listener. `static/js/package.json` only declares native JavaScript modules. The optional test-only fault harness is not part of normal startup and is not running.

## Resolution

- Stopped the identified old Flask processes and the alternate 5050 instance.
- Started exactly `.\venv\Scripts\python.exe server.py` from the project directory.
- Enabled Jinja template reload independently of debug mode, and set HTML to `no-store` and static assets to `no-cache` (revalidation required).
- Changed the JavaScript test default URL from 5050 to the canonical localhost:5000.
- Added regression checks for the canonical HTML, module assets, input-limit configuration and cache/reload settings.
- Preserved all frontend design files and all ML/analytics/API implementations; no UI was duplicated or redesigned.

After restart, localhost:5000 returned the same HTML SHA-256 as the good 5050 page captured before shutdown:

`D02FACB710F6BB764846757F60FE0F5F84EA9771B557B414105A49A73A9DDC3E`

The Python suite passed 49 tests; the JavaScript suite passed 12 tests against port 5000. Live browser checks on localhost:5000 verified the editorial page/logo, validation error, paste counters/Clear, real loading and results, sentiment/keywords/topics/issues, original evidence, search/filters/reset, pagination, empty matches and CSV upload/mapping.

## Single application launch

```powershell
.\venv\Scripts\python.exe server.py
```

Use **http://localhost:5000**. Port 5050 is not required. Stop the existing canonical instance with Ctrl+C before launching another one. Template reload does not reload Python code; restart after backend changes.
