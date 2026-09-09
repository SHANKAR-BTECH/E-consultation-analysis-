"""Explicit PostgreSQL configuration and short, rollback-safe units of work."""
import os
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker


def database_url(value=None):
    value = value if value is not None else os.environ.get('DATABASE_URL')
    if not value:
        raise ValueError('Set DATABASE_URL explicitly; persistence has no default database.')
    try:
        url = make_url(value)
    except Exception:
        raise ValueError('DATABASE_URL is invalid.') from None
    if url.drivername not in ('postgresql', 'postgresql+psycopg') or not url.database:
        raise ValueError('A named PostgreSQL database using psycopg is required.')
    return url.set(drivername='postgresql+psycopg')


class Database:
    def __init__(self, url=None):
        self.engine = create_engine(database_url(url), pool_pre_ping=True,
                                    hide_parameters=True, connect_args={'connect_timeout': 5})
        self.sessions = sessionmaker(self.engine, expire_on_commit=False)

    def transaction(self):
        """A new session; commits once on success, rolls back on any exception."""
        return self.sessions.begin()

    def close(self):
        self.engine.dispose()


def init_app(app):
    """Enable storage only with an explicit URL; never connect or migrate here."""
    if not app.config.get('DATABASE_URL'):
        return None
    db = Database(app.config.get('DATABASE_URL'))
    app.extensions['consultation_database'] = db
    return db
