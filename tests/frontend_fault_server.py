"""Local-only browser verification server; never imported by the production app.

Run: python -m tests.frontend_fault_server
Open http://127.0.0.1:5051/?scenario=slow (or 503, 500, malformed, wrong-shape).
The normal slow scenario calls the actual analysis engine after a delay.
"""
import time
from urllib.parse import urlparse, parse_qs
from flask import request, jsonify, Response
from server import app


@app.before_request
def browser_test_fault():
    if request.path != '/analyze':
        return None
    scenario = parse_qs(urlparse(request.referrer or '').query).get('scenario', [''])[0]
    if scenario == 'slow':
        time.sleep(3)
    elif scenario in ('500', '503'):
        return jsonify(error=True, message='The analysis service is temporarily unavailable. Please retry.'), int(scenario)
    elif scenario == 'malformed':
        return Response('<html>Test-only malformed response</html>', mimetype='text/html')
    elif scenario == 'wrong-shape':
        return jsonify(test_only='This is not an analysis object.')
    return None


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5051, debug=False)
