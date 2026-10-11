import copy
import unittest
from pathlib import Path

from govfix.policy import PolicyError, load_policy, validate_policy

POLICY_PATH = Path(__file__).resolve().parents[1] / "config/policies/demo-pilot-v1.json"
DEMO_V1_CHECKSUM = "99d7a59147c45735a8e6bb3ed68d9f2d13158232ffa1c26a92f8135b5a898b68"


class PolicyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.policy, cls.checksum = load_policy(POLICY_PATH)

    def test_demo_policy_loads_with_stable_checksum(self):
        self.assertEqual(self.policy["version"], "demo-pilot-v1")
        self.assertEqual(self.checksum, DEMO_V1_CHECKSUM)

    def test_rejects_missing_transition(self):
        policy = copy.deepcopy(self.policy)
        policy["transitions"].pop()
        with self.assertRaisesRegex(PolicyError, "complete P0 graph"):
            validate_policy(policy)

    def test_rejects_unauthorized_role_for_closure(self):
        policy = copy.deepcopy(self.policy)
        next(item for item in policy["transitions"] if item["to"] == "CLOSED")["roles"] = [
            "OFFICER"
        ]
        with self.assertRaisesRegex(PolicyError, "incorrect roles"):
            validate_policy(policy)

    def test_rejects_duplicate_category(self):
        policy = copy.deepcopy(self.policy)
        policy["categories"].append(copy.deepcopy(policy["categories"][0]))
        with self.assertRaisesRegex(PolicyError, "duplicate category"):
            validate_policy(policy)

    def test_rejects_invalid_department(self):
        policy = copy.deepcopy(self.policy)
        policy["categories"][0]["department"] = "UNKNOWN"
        with self.assertRaisesRegex(PolicyError, "unknown department"):
            validate_policy(policy)

    def test_rejects_nonincreasing_thresholds(self):
        policy = copy.deepcopy(self.policy)
        policy["thresholds"][1]["percent_of_sla"] = 50
        with self.assertRaisesRegex(PolicyError, "must increase"):
            validate_policy(policy)

    def test_rejects_production_label_without_approval(self):
        policy = copy.deepcopy(self.policy)
        policy["status"] = "PUBLISHED"
        with self.assertRaisesRegex(PolicyError, "DEMO_ONLY"):
            validate_policy(policy)

    def test_rejects_nonfinite_and_unbounded_sla(self):
        for hours in (float("inf"), float("nan"), 10**400):
            policy = copy.deepcopy(self.policy)
            policy["categories"][0]["sla_hours"] = hours
            with self.assertRaises(PolicyError):
                validate_policy(policy)

    def test_rejects_empty_timezone(self):
        policy = copy.deepcopy(self.policy)
        policy["timezone"] = ""
        with self.assertRaisesRegex(PolicyError, "IANA"):
            validate_policy(policy)

    def test_bad_reference_type_has_validation_error(self):
        policy = copy.deepcopy(self.policy)
        policy["categories"][0]["department"] = []
        with self.assertRaisesRegex(PolicyError, "unknown department"):
            validate_policy(policy)


if __name__ == "__main__":
    unittest.main()
