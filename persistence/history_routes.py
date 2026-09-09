"""Additive read-only HTTP history; never loads models or starts analysis."""
from uuid import UUID

import sqlalchemy as sa
from flask import Blueprint, current_app, jsonify

from .service import PersistenceService

history_api = Blueprint('history', __name__, url_prefix='/consultations')


@history_api.after_request
def no_cache(response):
    response.headers['Cache-Control'] = 'no-store'
    return response


def read(command, *identities):
    try:
        ids = [UUID(value) for value in identities]
    except ValueError:
        return jsonify(error=True, message='Invalid consultation or run identifier.'), 400
    database = current_app.extensions.get('consultation_database')
    if database is None:
        return jsonify(error=True, message='Consultation history is unavailable. Configure DATABASE_URL.'), 503
    try:
        with database.transaction() as session:
            session.execute(sa.text('SET TRANSACTION READ ONLY'))
            result = command(PersistenceService(session), *ids)
        if result is None:
            return jsonify(error=True, message='Consultation or run not found.'), 404
        return jsonify(result)
    except Exception:
        current_app.logger.error('Consultation history could not be read.')
        return jsonify(error=True, message='Consultation history could not be loaded. Please try again.'), 503


@history_api.get('')
def list_consultations():
    return read(lambda service: {'consultations': service.list_consultations()})


@history_api.get('/<consultation_id>')
def get_consultation(consultation_id):
    return read(lambda service, identity: service.get_consultation(identity), consultation_id)


@history_api.get('/<consultation_id>/runs/<run_id>')
def get_run(consultation_id, run_id):
    return read(lambda service, identity, run: service.get_run(identity, run), consultation_id, run_id)
