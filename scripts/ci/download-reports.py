"""Descarga la evidencia de la misma corrida, incluidos los jobs aprobados antes de un reintento."""

import hashlib
import io
import json
import os
import re
import subprocess
import zipfile
from collections import defaultdict
from pathlib import Path


REPORT_NAME = re.compile(r"ci-(unit|inventory|integration-\d+|e2e-\d+|backup|promotion|reuse)")


def latest_reports(pages):
    candidates = defaultdict(list)
    for page in pages:
        for artifact in page["artifacts"]:
            name = artifact["name"]
            if REPORT_NAME.fullmatch(name):
                candidates[name].append(artifact)

    for name, versions in sorted(candidates.items()):
        # GitHub puede asignarle al reintento un ID menor que al primer intento.
        latest, *older = sorted(versions, key=lambda version: version["created_at"], reverse=True)
        if older and older[0]["created_at"] == latest["created_at"]:
            raise ValueError(f"Dos versiones de {name} tienen la misma fecha de creación")
        if not latest["expired"]:
            yield latest


def download_reports():
    api = f"repos/{os.environ['GITHUB_REPOSITORY']}/actions"
    run = os.environ["GITHUB_RUN_ID"]
    path = f"{api}/runs/{run}/artifacts?per_page=100"
    pages = json.loads(subprocess.check_output(["gh", "api", "--paginate", "--slurp", path]))
    directory = Path(os.environ.get("CI_REPORT_DIR", "ci-results"))
    directory.mkdir(parents=True, exist_ok=True)
    for latest in latest_reports(pages):
        name = latest["name"]
        artifact_id = latest["id"]
        data = subprocess.check_output(["gh", "api", f"{api}/artifacts/{artifact_id}/zip"])
        if f"sha256:{hashlib.sha256(data).hexdigest()}" != latest["digest"]:
            raise ValueError(f"El digest de {name} no coincide con el de GitHub")
        filename = "backup-test.log" if name == "ci-backup" else f"{name.removeprefix('ci-')}.json"
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            (directory / filename).write_bytes(archive.read(filename))
        print(f"{name} · {artifact_id} · {latest['created_at']}", flush=True)


if __name__ == "__main__":
    download_reports()
