"""Unit test for environment-aware database path resolution."""
import os
import sqlite3
import tempfile
import unittest

from persistence.database import resolve_database_path, Database


class DatabasePathTests(unittest.TestCase):
    def test_local_default_path(self):
        original_vercel = os.environ.pop("VERCEL", None)
        original_vercel_env = os.environ.pop("VERCEL_ENV", None)
        original_db_path = os.environ.pop("CONSULTATION_DB_PATH", None)
        try:
            path = resolve_database_path()
            self.assertTrue(path.endswith("consultation_history.sqlite3"))
            self.assertFalse(path.startswith("/tmp"))
        finally:
            if original_vercel:
                os.environ["VERCEL"] = original_vercel
            if original_vercel_env:
                os.environ["VERCEL_ENV"] = original_vercel_env
            if original_db_path:
                os.environ["CONSULTATION_DB_PATH"] = original_db_path

    def test_vercel_environment_path(self):
        original_vercel = os.environ.get("VERCEL")
        original_db_path = os.environ.pop("CONSULTATION_DB_PATH", None)
        try:
            os.environ["VERCEL"] = "1"
            path = resolve_database_path()
            self.assertEqual(path, "/tmp/consultation_history.sqlite3")
        finally:
            if original_vercel is not None:
                os.environ["VERCEL"] = original_vercel
            else:
                os.environ.pop("VERCEL", None)
            if original_db_path:
                os.environ["CONSULTATION_DB_PATH"] = original_db_path

    def test_explicit_override_takes_precedence(self):
        original_vercel = os.environ.get("VERCEL")
        original_db_path = os.environ.get("CONSULTATION_DB_PATH")
        try:
            os.environ["VERCEL"] = "1"
            os.environ["CONSULTATION_DB_PATH"] = "/var/data/custom.sqlite3"
            path = resolve_database_path()
            self.assertEqual(path, "/var/data/custom.sqlite3")
        finally:
            if original_vercel is not None:
                os.environ["VERCEL"] = original_vercel
            else:
                os.environ.pop("VERCEL", None)
            if original_db_path is not None:
                os.environ["CONSULTATION_DB_PATH"] = original_db_path
            else:
                os.environ.pop("CONSULTATION_DB_PATH", None)

    def test_database_initialization(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            test_db = os.path.join(tmpdir, "test.sqlite3")
            db = Database(path=test_db)
            conn = db.connection()
            try:
                tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
                self.assertIn("consultations", tables)
                self.assertIn("imports", tables)
                self.assertIn("analysis_runs", tables)
                fk = conn.execute("PRAGMA foreign_keys").fetchone()[0]
                self.assertEqual(fk, 1)
            finally:
                conn.close()


if __name__ == "__main__":
    unittest.main()
