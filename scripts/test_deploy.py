"""Deployment safety checks; no daemon, real database, credentials or network required."""

import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

import deploy


class DeploymentSafetyTests(unittest.TestCase):
    def setUp(self):
        self.output = contextlib.redirect_stdout(io.StringIO())
        self.output.__enter__()
        self.errors = contextlib.redirect_stderr(io.StringIO())
        self.errors.__enter__()

    def tearDown(self):
        self.errors.__exit__(None, None, None)
        self.output.__exit__(None, None, None)

    def deployment(self, *, exists=True, failure=None):
        instance = object.__new__(deploy.Deployment)
        instance.domain = "geo.production.test"
        events = []

        def compose(*args, **kwargs):
            if args[0] == "run":
                action = args[-1]
            elif args[0] == "up":
                action = "up-apps" if "api" in args else "up-database"
            else:
                action = args[0]
            events.append(action)
            if action == failure:
                raise deploy.DeployError("simulated failure")

        instance.compose = Mock(side_effect=compose)
        instance.database_exists = Mock(return_value=exists)
        for name, event in (("preserve_credentials", "check-keys"), ("build", "build"),
                            ("stop_apps", "stop"), ("start_database", "start-database"),
                            ("backup_files", "backup"), ("health", "https-ready")):
            def record(*args, label=event, **kwargs):
                events.append(label)
                if label == failure:
                    raise deploy.DeployError("simulated failure")
            setattr(instance, name, Mock(side_effect=record))
        return instance, events

    def test_init_preserves_existing_keys_and_never_prints_them(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "production.env"
            with contextlib.redirect_stdout(io.StringIO()) as output:
                deploy.init_env(target)
            content = target.read_text()
            values = dict(line.split("=", 1) for line in content.splitlines() if line and not line.startswith("#"))
            for key in ("DB_PASSWORD", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "CREDENTIAL_ENCRYPTION_KEY"):
                self.assertNotIn(values[key], output.getvalue())
            self.assertNotEqual(values["JWT_ACCESS_SECRET"], values["JWT_REFRESH_SECRET"])
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(deploy.DeployError):
                deploy.init_env(target)
            self.assertEqual(target.read_text(), content)

    def test_build_failure_keeps_existing_services_running(self):
        instance, events = self.deployment(failure="build")
        with self.assertRaises(deploy.DeployError):
            instance.deploy()
        self.assertNotIn("stop", events)
        self.assertNotIn("migrate", events)

    def test_update_stops_writers_and_backs_up_before_migration(self):
        instance, events = self.deployment()
        instance.deploy()
        self.assertLess(events.index("build"), events.index("stop"))
        self.assertLess(events.index("stop"), events.index("backup"))
        self.assertLess(events.index("backup"), events.index("migrate"))
        self.assertLess(events.index("migrate"), events.index("up-apps"))
        self.assertNotIn("bootstrap", events)

    def test_backup_failure_prevents_migration_and_restart_during_update(self):
        instance, events = self.deployment(failure="backup")
        with self.assertRaises(deploy.DeployError):
            instance.deploy()
        self.assertNotIn("migrate", events)
        self.assertNotIn("up-apps", events)
        self.assertNotIn("start", events)

    def test_migration_failure_prevents_starting_new_or_old_application(self):
        instance, events = self.deployment(failure="migrate")
        with self.assertRaises(deploy.DeployError):
            instance.deploy()
        self.assertIn("backup", events)
        self.assertNotIn("up-apps", events)
        self.assertNotIn("start", events)

    def test_first_install_initializes_account_before_starting_services(self):
        instance, events = self.deployment(exists=False)
        instance.deploy(first_install=True)
        self.assertLess(events.index("migrate"), events.index("bootstrap"))
        self.assertLess(events.index("bootstrap"), events.index("up-apps"))
        self.assertNotIn("backup", events)

    def test_first_install_refuses_existing_database_without_mutations(self):
        instance, events = self.deployment()
        with self.assertRaises(deploy.DeployError):
            instance.deploy(first_install=True)
        self.assertEqual(events, [])

    def test_update_refuses_empty_install_without_mutations(self):
        instance, events = self.deployment(exists=False)
        with self.assertRaises(deploy.DeployError):
            instance.deploy()
        self.assertEqual(events, [])

    def test_standalone_backup_restarts_only_original_containers_even_on_failure(self):
        instance, events = self.deployment(failure="backup")
        instance.running_apps = Mock(return_value=["api"])
        with self.assertRaises(deploy.DeployError):
            instance.backup()
        instance.compose.assert_called_once_with("start", "api")
        self.assertLess(events.index("stop"), events.index("backup"))
        self.assertNotIn("up-apps", events)

    def test_secret_rotation_is_rejected_without_disclosing_values(self):
        instance = object.__new__(deploy.Deployment)
        instance.config = {"services": {"api": {"environment": {"JWT_ACCESS_SECRET": "new-private-secret"}}}}
        instance.container = Mock(return_value="container-id")
        instance.command = Mock(return_value=json.dumps(["JWT_ACCESS_SECRET=old-private-secret"]))
        with self.assertRaises(deploy.DeployError) as error:
            instance.preserve_credentials()
        self.assertNotIn("new-private-secret", str(error.exception))
        self.assertNotIn("old-private-secret", str(error.exception))

    def test_missing_upload_volume_does_not_create_a_root_owned_volume(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            env_file = root / "production.env"
            env_file.write_text("private test configuration")
            instance = object.__new__(deploy.Deployment)
            instance.env_file = env_file
            instance.config = {"name": "test", "volumes": {"uploads": {"name": "test_uploads"}},
                               "services": {"api": {"image": "bgeo:test"}}}
            instance.compose = Mock(side_effect=lambda *args, output, **kwargs: output.write(b"test dump"))
            instance.container = Mock(return_value="")
            instance.volume_exists = Mock(return_value=False)
            instance.command = Mock()
            with patch.object(deploy, "ROOT", root):
                backup = instance.backup_files()
            instance.command.assert_not_called()
            self.assertTrue((backup / "uploads.tar.gz").is_file())
            self.assertTrue((backup / "metadata.json").is_file())
            self.assertEqual((backup / "production.env").stat().st_mode & 0o777, 0o600)


if __name__ == "__main__":
    unittest.main()
