"""
Automated Test Suite for Real Cactus-Needle Foundation Engine.
Verifies constrained tool execution, latency, memory footprint, and intent normalization.
"""

import unittest
import sys
import os

# Add root directory to python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.needle.needle_service import run_query, get_needle_agent, ALL_TELECOM_TOOLS

class TestRealNeedleEngine(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        print("\n--- Initializing Cactus-Needle Foundation Model ---")
        agent = get_needle_agent()
        assert agent is not None, "Failed to instantiate Needle agent"
        print(f"Loaded {len(ALL_TELECOM_TOOLS)} telecom tools into Needle engine.")

    def test_01_cctv_route_extraction(self):
        query = "Route the CCTV cable from CCTV-021 to the control room through the outdoor corridor at 4.5 m elevation"
        res = run_query(query)

        self.assertTrue(res.get("success"), "Needle execution reported failure")
        self.assertEqual(res.get("engine"), "cactus-needle")
        self.assertGreater(res.get("confidence", 0), 0.4, "Confidence score lower than expected")
        self.assertGreater(res.get("prefill_tps", 0), 100.0, "Prefill TPS lower than threshold")
        self.assertLess(res.get("peak_ram_mb", 999), 300.0, "RAM usage exceeded budget")

        intent = res.get("intent", {})
        self.assertEqual(intent.get("operation"), "route_cable")
        self.assertEqual(intent.get("source"), "CCTV-021")
        self.assertEqual(intent.get("destination"), "CONTROL_ROOM")
        self.assertEqual(intent.get("preferred_path"), "OUTDOOR_CORRIDOR")
        self.assertEqual(intent.get("cable_type"), "CCTV_DATA")
        self.assertEqual(intent.get("elevation_m"), 4.5)
        self.assertEqual(intent.get("topology"), "STAR")

    def test_02_paga_speaker_route_extraction(self):
        query = "Route PAGA speaker SPK-101 to PAGA-CAB-A at 4.2m elevation"
        res = run_query(query)

        self.assertTrue(res.get("success"))
        intent = res.get("intent", {})
        self.assertEqual(intent.get("operation"), "route_cable")
        self.assertEqual(intent.get("source"), "SPK-101")
        self.assertEqual(intent.get("destination"), "PAGA-CAB-A")
        self.assertEqual(intent.get("cable_type"), "PAGA_AUDIO")
        self.assertEqual(intent.get("elevation_m"), 4.2)
        self.assertEqual(intent.get("topology"), "CLASS_A_LOOP")

    def test_03_inspect_device_extraction(self):
        query = "Inspect device CCTV-021"
        res = run_query(query)

        self.assertTrue(res.get("success"))
        intent = res.get("intent", {})
        self.assertEqual(intent.get("operation"), "inspect_object")
        self.assertEqual(intent.get("device_tag"), "CCTV-021")

    def test_04_explain_rule_extraction(self):
        query = "Explain rule RULE-WALL-001"
        res = run_query(query)

        self.assertTrue(res.get("success"))
        intent = res.get("intent", {})
        self.assertEqual(intent.get("operation"), "explain_rule")
        self.assertEqual(intent.get("rule_id"), "RULE-WALL-001")

if __name__ == "__main__":
    unittest.main(verbosity=2)
