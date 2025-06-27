#!/usr/bin/env python3
import requests
import json
import time
import websocket
import threading
import os
from datetime import datetime, timedelta
import unittest
import uuid
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Get the backend URL from the frontend .env file
with open('/app/frontend/.env', 'r') as f:
    for line in f:
        if line.startswith('REACT_APP_BACKEND_URL='):
            BACKEND_URL = line.strip().split('=')[1].strip('"\'')
            break

API_URL = f"{BACKEND_URL}/api"
print(f"Using API URL: {API_URL}")

class TestDoctorPatientDashboard(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        """Set up test data that will be used across all tests"""
        cls.patient_data = {
            "name": "Test Patient",
            "patient_id": f"patient_{uuid.uuid4()}",
            "user_type": "patient"
        }
        
        cls.doctor_data = {
            "name": "Test Doctor",
            "doctor_id": f"doctor_{uuid.uuid4()}",
            "user_type": "doctor"
        }
        
        cls.device_data = {
            "name": "Test ESP Device",
            "id": f"device_{uuid.uuid4()}"
        }
        
        cls.patient_token = None
        cls.doctor_token = None
        cls.patient_id = None
        cls.doctor_id = None
        cls.device_id = None
        
        # WebSocket message received flag and data
        cls.ws_message_received = False
        cls.ws_received_data = None
        
    def test_01_patient_login(self):
        """Test patient login endpoint"""
        logger.info("Testing patient login...")
        
        response = requests.post(f"{API_URL}/auth/login", json=self.patient_data)
        self.assertEqual(response.status_code, 200)
        
        data = response.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["user"]["name"], self.patient_data["name"])
        self.assertEqual(data["user"]["user_type"], "patient")
        
        # Save token and ID for later tests
        self.__class__.patient_token = data["token"]
        self.__class__.patient_id = data["user"]["id"]
        
        logger.info(f"Patient login successful. ID: {self.__class__.patient_id}")
        
    def test_02_doctor_login(self):
        """Test doctor login endpoint"""
        logger.info("Testing doctor login...")
        
        response = requests.post(f"{API_URL}/auth/login", json=self.doctor_data)
        self.assertEqual(response.status_code, 200)
        
        data = response.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["user"]["name"], self.doctor_data["name"])
        self.assertEqual(data["user"]["user_type"], "doctor")
        
        # Save token and ID for later tests
        self.__class__.doctor_token = data["token"]
        self.__class__.doctor_id = data["user"]["id"]
        
        logger.info(f"Doctor login successful. ID: {self.__class__.doctor_id}")
        
    def test_03_register_device(self):
        """Test device registration endpoint"""
        logger.info("Testing device registration...")
        
        response = requests.post(
            f"{API_URL}/patients/{self.__class__.patient_id}/devices", 
            json=self.device_data
        )
        self.assertEqual(response.status_code, 200)
        
        data = response.json()
        self.assertEqual(data["patient_id"], self.__class__.patient_id)
        self.assertEqual(data["device_name"], self.device_data["name"])
        self.assertEqual(data["device_id"], self.device_data["id"])
        self.assertTrue(data["is_connected"])
        
        # Save device ID for later tests
        self.__class__.device_id = data["device_id"]
        
        logger.info(f"Device registration successful. Device ID: {self.__class__.device_id}")
        
    def test_04_get_patient_devices(self):
        """Test getting patient devices endpoint"""
        logger.info("Testing get patient devices...")
        
        response = requests.get(f"{API_URL}/patients/{self.__class__.patient_id}/devices")
        self.assertEqual(response.status_code, 200)
        
        devices = response.json()
        self.assertIsInstance(devices, list)
        self.assertTrue(len(devices) > 0)
        
        # Verify our registered device is in the list
        device_ids = [device["device_id"] for device in devices]
        self.assertIn(self.__class__.device_id, device_ids)
        
        logger.info(f"Get patient devices successful. Found {len(devices)} devices.")
        
    def test_05_send_bluetooth_data(self):
        """Test sending Bluetooth usage data"""
        logger.info("Testing Bluetooth data submission...")
        
        # Start WebSocket connection to verify real-time updates
        self.start_websocket_client()
        
        # Wait for WebSocket to connect
        time.sleep(2)
        
        # Send usage data
        usage_data = {
            "patient_id": self.__class__.patient_id,
            "device_id": self.__class__.device_id,
            "usage_duration": 120,  # 2 hours in minutes
            "time_of_day": "day",
            "timestamp": datetime.utcnow().isoformat()
        }
        
        response = requests.post(f"{API_URL}/bluetooth/data", json=usage_data)
        self.assertEqual(response.status_code, 200)
        
        data = response.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["session"]["patient_id"], self.__class__.patient_id)
        self.assertEqual(data["session"]["device_id"], self.__class__.device_id)
        self.assertEqual(data["session"]["duration_minutes"], usage_data["usage_duration"])
        
        # Wait for WebSocket message
        time.sleep(2)
        
        # Check if WebSocket received the update
        self.assertTrue(self.__class__.ws_message_received)
        if self.__class__.ws_received_data:
            ws_data = json.loads(self.__class__.ws_received_data)
            self.assertEqual(ws_data.get("type"), "usage_update")
            self.assertEqual(ws_data.get("data", {}).get("patient_id"), self.__class__.patient_id)
        
        logger.info("Bluetooth data submission successful.")
        
    def test_06_get_patient_usage(self):
        """Test getting patient usage data"""
        logger.info("Testing patient usage retrieval...")
        
        response = requests.get(f"{API_URL}/patients/{self.__class__.patient_id}/usage")
        self.assertEqual(response.status_code, 200)
        
        usage_data = response.json()
        self.assertIsInstance(usage_data, list)
        self.assertTrue(len(usage_data) > 0)
        
        # Verify our submitted usage data is in the list
        self.assertEqual(usage_data[0]["patient_id"], self.__class__.patient_id)
        self.assertEqual(usage_data[0]["device_id"], self.__class__.device_id)
        
        logger.info(f"Patient usage retrieval successful. Found {len(usage_data)} sessions.")
        
    def test_07_get_patient_compliance(self):
        """Test getting patient compliance data"""
        logger.info("Testing patient compliance retrieval...")
        
        response = requests.get(f"{API_URL}/patients/{self.__class__.patient_id}/compliance")
        self.assertEqual(response.status_code, 200)
        
        compliance_data = response.json()
        self.assertEqual(compliance_data["patient_id"], self.__class__.patient_id)
        self.assertEqual(compliance_data["patient_name"], self.patient_data["name"])
        self.assertTrue(compliance_data["total_sessions"] > 0)
        self.assertTrue(compliance_data["total_duration_minutes"] > 0)
        self.assertTrue(compliance_data["device_connected"])
        
        # Check compliance percentage calculation
        # 120 minutes / (30 days * 8 hours * 60 minutes) * 100 = 0.83%
        expected_compliance = min(100, (120 / (30 * 8 * 60)) * 100)
        self.assertAlmostEqual(compliance_data["compliance_percentage"], expected_compliance, places=1)
        
        logger.info("Patient compliance retrieval successful.")
        
    def test_08_get_doctor_patients(self):
        """Test getting doctor's patients overview"""
        logger.info("Testing doctor patient overview...")
        
        response = requests.get(f"{API_URL}/doctors/{self.__class__.doctor_id}/patients")
        self.assertEqual(response.status_code, 200)
        
        patients = response.json()
        self.assertIsInstance(patients, list)
        
        # Find our test patient in the list
        found_patient = False
        for patient in patients:
            if patient["patient_id"] == self.__class__.patient_id:
                found_patient = True
                self.assertEqual(patient["patient_name"], self.patient_data["name"])
                self.assertTrue(patient["total_sessions"] > 0)
                self.assertTrue(patient["device_connected"])
                break
                
        self.assertTrue(found_patient, "Test patient not found in doctor's patient list")
        
        logger.info(f"Doctor patient overview successful. Found {len(patients)} patients.")
        
    def test_09_login_existing_user(self):
        """Test login with existing user"""
        logger.info("Testing login with existing user...")
        
        # Try to login with the same patient data
        response = requests.post(f"{API_URL}/auth/login", json=self.patient_data)
        self.assertEqual(response.status_code, 200)
        
        data = response.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["user"]["id"], self.__class__.patient_id)
        
        logger.info("Login with existing user successful.")
        
    def start_websocket_client(self):
        """Start a WebSocket client to test real-time updates"""
        ws_url = f"{BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://')}/api/ws/{self.__class__.patient_id}"
        
        def on_message(ws, message):
            logger.info(f"WebSocket received: {message}")
            self.__class__.ws_message_received = True
            self.__class__.ws_received_data = message
            
        def on_error(ws, error):
            logger.error(f"WebSocket error: {error}")
            
        def on_close(ws, close_status_code, close_msg):
            logger.info("WebSocket connection closed")
            
        def on_open(ws):
            logger.info("WebSocket connection opened")
            
        def run_websocket():
            ws = websocket.WebSocketApp(
                ws_url,
                on_open=on_open,
                on_message=on_message,
                on_error=on_error,
                on_close=on_close
            )
            ws.run_forever()
            
        # Start WebSocket client in a separate thread
        threading.Thread(target=run_websocket, daemon=True).start()

if __name__ == "__main__":
    # Install required packages if not already installed
    try:
        import websocket
    except ImportError:
        os.system("pip install websocket-client")
        
    try:
        import requests
    except ImportError:
        os.system("pip install requests")
    
    # Run the tests with more verbose output
    import sys
    runner = unittest.TextTestRunner(verbosity=2)
    suite = unittest.TestLoader().loadTestsFromTestCase(TestDoctorPatientDashboard)
    result = runner.run(suite)
    
    # Print summary
    print("\n=== TEST SUMMARY ===")
    print(f"Total tests: {result.testsRun}")
    print(f"Failures: {len(result.failures)}")
    print(f"Errors: {len(result.errors)}")
    
    # Print failures and errors
    if result.failures:
        print("\n=== FAILURES ===")
        for test, error in result.failures:
            print(f"\n{test}")
            print(error)
    
    if result.errors:
        print("\n=== ERRORS ===")
        for test, error in result.errors:
            print(f"\n{test}")
            print(error)
            
    # Exit with appropriate code
    sys.exit(len(result.failures) + len(result.errors))