import runpy
import unittest
from pathlib import Path


latest_reports = runpy.run_path(
    str(Path(__file__).resolve().parents[2] / "scripts/ci/download-reports.py")
)["latest_reports"]


def artifact(name, artifact_id, minute, expired=False):
    return {
        "name": name,
        "id": artifact_id,
        "created_at": f"2026-11-19T03:{minute:02}:00Z",
        "expired": expired,
    }


class LatestReportsTest(unittest.TestCase):
    def test_rerun_with_smaller_id_keeps_inventory_and_other_shards(self):
        pages = [
            {"artifacts": [artifact("ci-e2e-6", 90, 27), artifact("ci-inventory", 83, 23)]},
            {"artifacts": [
                artifact("ci-e2e-6", 71, 34),
                artifact("ci-e2e-1", 85, 25),
                artifact("ci-result", 99, 30),
            ]},
        ]
        expected = {"ci-e2e-6": 71, "ci-e2e-1": 85, "ci-inventory": 83}
        for listing in (pages, list(reversed(pages))):
            self.assertEqual({a["name"]: a["id"] for a in latest_reports(listing)}, expected)

    def test_expired_report_does_not_fall_back_to_earlier_attempt(self):
        entries = [artifact("ci-unit", 90, 22), artifact("ci-unit", 75, 29, expired=True)]
        self.assertEqual(list(latest_reports([{"artifacts": entries}])), [])

    def test_two_reports_with_the_same_creation_time_are_ambiguous(self):
        entries = [artifact("ci-e2e-6", 90, 27), artifact("ci-e2e-6", 71, 27)]
        with self.assertRaisesRegex(ValueError, "ci-e2e-6"):
            list(latest_reports([{"artifacts": entries}]))
