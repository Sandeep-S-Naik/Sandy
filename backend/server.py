from fastapi import FastAPI, APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timedelta
import json
import asyncio
from collections import defaultdict
from datetime import datetime, timedelta

# Custom JSON encoder to handle datetime objects
class DateTimeEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Security
security = HTTPBearer(auto_error=False)

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        self.active_connections[user_id] = websocket

    def disconnect(self, user_id: str):
        if user_id in self.active_connections:
            del self.active_connections[user_id]

    async def send_personal_message(self, message: dict, user_id: str):
        if user_id in self.active_connections:
            await self.active_connections[user_id].send_text(json.dumps(message, cls=DateTimeEncoder))

manager = ConnectionManager()

# Models
class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    user_type: str  # "patient" or "doctor"
    patient_id: Optional[str] = None  # Only for patients
    doctor_id: Optional[str] = None   # Only for doctors
    created_at: datetime = Field(default_factory=datetime.utcnow)

class UserLogin(BaseModel):
    name: str
    patient_id: Optional[str] = None
    doctor_id: Optional[str] = None
    user_type: str

class BluetoothDevice(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    patient_id: str
    device_name: str
    device_id: str  # Bluetooth device ID
    is_connected: bool = False
    last_connected: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class DeviceUsageSession(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    patient_id: str
    device_id: str
    start_time: datetime
    end_time: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    time_of_day: str  # "day" or "night"
    compliance_score: Optional[float] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class BluetoothData(BaseModel):
    patient_id: str
    device_id: str
    usage_duration: int  # in minutes
    time_of_day: str  # "day" or "night"
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class PatientCompliance(BaseModel):
    patient_id: str
    patient_name: str
    total_sessions: int
    total_duration_minutes: int
    average_daily_usage: float
    compliance_percentage: float
    last_session: Optional[datetime] = None
    device_connected: bool

# Authentication helper
async def get_user_by_login(login_data: UserLogin) -> Optional[User]:
    if login_data.user_type == "patient" and login_data.patient_id:
        user_data = await db.users.find_one({
            "name": login_data.name,
            "patient_id": login_data.patient_id,
            "user_type": "patient"
        })
    elif login_data.user_type == "doctor" and login_data.doctor_id:
        user_data = await db.users.find_one({
            "name": login_data.name,
            "doctor_id": login_data.doctor_id,
            "user_type": "doctor"
        })
    else:
        return None
    
    if user_data:
        return User(**user_data)
    return None

# Routes
@api_router.post("/auth/login")
async def login(login_data: UserLogin):
    """Login for both patients and doctors"""
    # Check if user exists
    user = await get_user_by_login(login_data)
    
    if not user:
        # Create new user if doesn't exist
        user_dict = login_data.dict()
        user = User(**user_dict)
        await db.users.insert_one(user.dict())
    
    return {
        "success": True,
        "user": user.dict(),
        "token": f"user_{user.id}"  # Simple token for demo
    }

@api_router.get("/patients/{patient_id}/devices")
async def get_patient_devices(patient_id: str):
    """Get all devices for a patient"""
    devices = await db.bluetooth_devices.find({"patient_id": patient_id}).to_list(100)
    return [BluetoothDevice(**device) for device in devices]

@api_router.post("/patients/{patient_id}/devices")
async def add_patient_device(patient_id: str, device_data: dict):
    """Add a new Bluetooth device for a patient"""
    device = BluetoothDevice(
        patient_id=patient_id,
        device_name=device_data.get("name", "ESP Device"),
        device_id=device_data.get("id", str(uuid.uuid4())),
        is_connected=True,
        last_connected=datetime.utcnow()
    )
    await db.bluetooth_devices.insert_one(device.dict())
    return device

@api_router.post("/bluetooth/data")
async def receive_bluetooth_data(data: BluetoothData):
    """Receive data from Bluetooth device"""
    # Create usage session
    session = DeviceUsageSession(
        patient_id=data.patient_id,
        device_id=data.device_id,
        start_time=data.timestamp - timedelta(minutes=data.usage_duration),
        end_time=data.timestamp,
        duration_minutes=data.usage_duration,
        time_of_day=data.time_of_day,
        compliance_score=min(100, (data.usage_duration / 480) * 100)  # 8 hours = 100%
    )
    
    await db.usage_sessions.insert_one(session.dict())
    
    # Update device status
    await db.bluetooth_devices.update_one(
        {"device_id": data.device_id, "patient_id": data.patient_id},
        {"$set": {"is_connected": True, "last_connected": datetime.utcnow()}}
    )
    
    # Send real-time update to patient
    await manager.send_personal_message({
        "type": "usage_update",
        "data": session.dict()
    }, data.patient_id)
    
    return {"success": True, "session": session.dict()}

@api_router.get("/patients/{patient_id}/usage")
async def get_patient_usage(patient_id: str, days: int = 7):
    """Get patient usage data for graphs"""
    start_date = datetime.utcnow() - timedelta(days=days)
    
    sessions = await db.usage_sessions.find({
        "patient_id": patient_id,
        "created_at": {"$gte": start_date}
    }).sort("created_at", -1).to_list(1000)
    
    return [DeviceUsageSession(**session) for session in sessions]

@api_router.get("/patients/{patient_id}/compliance")
async def get_patient_compliance(patient_id: str):
    """Get patient compliance summary with enhanced metrics"""
    # Get user info
    user = await db.users.find_one({"id": patient_id})
    if not user:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    # Get usage sessions from last 30 days
    start_date = datetime.utcnow() - timedelta(days=30)
    sessions = await db.usage_sessions.find({
        "patient_id": patient_id,
        "created_at": {"$gte": start_date}
    }).to_list(1000)
    
    # Check device connection status
    device = await db.bluetooth_devices.find_one({"patient_id": patient_id})
    device_connected = device and device.get("is_connected", False) if device else False
    
    # Calculate compliance metrics
    total_duration = sum(session.get("duration_minutes", 0) for session in sessions)
    total_sessions = len(sessions)
    average_daily_usage_minutes = total_duration / 30 if total_duration > 0 else 0
    average_daily_hours = average_daily_usage_minutes / 60
    
    # Compliance percentage (assuming 8 hours/day target)
    target_minutes_per_month = 30 * 8 * 60  # 30 days * 8 hours * 60 minutes
    compliance_percentage = min(100, (total_duration / target_minutes_per_month) * 100)
    
    last_session = max((datetime.fromisoformat(session["created_at"].replace("Z", "+00:00")) if isinstance(session["created_at"], str) else session["created_at"]) for session in sessions) if sessions else None
    
    # Calculate usage trend (last 7 days vs previous 7 days)
    trend = await calculate_usage_trend(patient_id)
    
    return {
        "patient_id": patient_id,
        "patient_name": user["name"],
        "total_sessions": total_sessions,
        "total_duration_minutes": total_duration,
        "average_daily_usage": average_daily_usage_minutes,
        "average_daily_hours": round(average_daily_hours, 2),
        "compliance_percentage": compliance_percentage,
        "last_session": last_session,
        "device_connected": device_connected,
        "usage_trend": trend
    }

async def calculate_usage_trend(patient_id: str):
    """Calculate usage trend comparing recent vs previous period"""
    now = datetime.utcnow()
    
    # Last 7 days
    last_week_start = now - timedelta(days=7)
    last_week_sessions = await db.usage_sessions.find({
        "patient_id": patient_id,
        "created_at": {"$gte": last_week_start}
    }).to_list(1000)
    
    # Previous 7 days
    prev_week_start = now - timedelta(days=14)
    prev_week_end = now - timedelta(days=7)
    prev_week_sessions = await db.usage_sessions.find({
        "patient_id": patient_id,
        "created_at": {"$gte": prev_week_start, "$lt": prev_week_end}
    }).to_list(1000)
    
    last_week_duration = sum(session.get("duration_minutes", 0) for session in last_week_sessions)
    prev_week_duration = sum(session.get("duration_minutes", 0) for session in prev_week_sessions)
    
    if prev_week_duration == 0:
        if last_week_duration > 0:
            return {"direction": "increasing", "percentage": 100}
        else:
            return {"direction": "stable", "percentage": 0}
    
    change_percentage = ((last_week_duration - prev_week_duration) / prev_week_duration) * 100
    
    if change_percentage > 10:
        return {"direction": "increasing", "percentage": round(change_percentage, 1)}
    elif change_percentage < -10:
        return {"direction": "decreasing", "percentage": round(abs(change_percentage), 1)}
    else:
        return {"direction": "stable", "percentage": round(abs(change_percentage), 1)}

@api_router.get("/patients/{patient_id}/analytics")
async def get_patient_analytics(patient_id: str, days: int = 30):
    """Get detailed analytics for patient usage patterns"""
    start_date = datetime.utcnow() - timedelta(days=days)
    
    sessions = await db.usage_sessions.find({
        "patient_id": patient_id,
        "created_at": {"$gte": start_date}
    }).sort("created_at", 1).to_list(1000)
    
    # Group by day for trend analysis
    daily_usage = defaultdict(int)
    day_night_usage = {"day": 0, "night": 0}
    
    for session in sessions:
        date_key = session["created_at"].strftime("%Y-%m-%d")
        daily_usage[date_key] += session.get("duration_minutes", 0)
        day_night_usage[session.get("time_of_day", "day")] += session.get("duration_minutes", 0)
    
    # Create time series data
    time_series = []
    current_date = start_date
    while current_date <= datetime.utcnow():
        date_key = current_date.strftime("%Y-%m-%d")
        time_series.append({
            "date": date_key,
            "usage_minutes": daily_usage.get(date_key, 0),
            "usage_hours": round(daily_usage.get(date_key, 0) / 60, 2)
        })
        current_date += timedelta(days=1)
    
    return {
        "time_series": time_series,
        "day_night_distribution": day_night_usage,
        "total_days": len(daily_usage),
        "active_days": len([d for d in daily_usage.values() if d > 0]),
        "average_daily_minutes": sum(daily_usage.values()) / max(len(daily_usage), 1),
        "average_daily_hours": round(sum(daily_usage.values()) / max(len(daily_usage), 1) / 60, 2)
    }

@api_router.get("/doctors/{doctor_id}/patients")
async def get_doctor_patients(doctor_id: str):
    """Get all patients for a doctor with their compliance"""
    # For demo, get all patients (in real app, you'd have doctor-patient relationships)
    patients = await db.users.find({"user_type": "patient"}).to_list(100)
    
    patient_compliance = []
    for patient in patients:
        try:
            compliance_response = await get_patient_compliance(patient["id"])
            patient_compliance.append(compliance_response)
        except:
            # Handle patients with no data
            patient_compliance.append(PatientCompliance(
                patient_id=patient["id"],
                patient_name=patient["name"],
                total_sessions=0,
                total_duration_minutes=0,
                average_daily_usage=0,
                compliance_percentage=0,
                last_session=None,
                device_connected=False
            ))
    
    return patient_compliance

@api_router.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    """WebSocket for real-time updates"""
    await manager.connect(websocket, user_id)
    try:
        while True:
            data = await websocket.receive_text()
            # Handle incoming WebSocket messages if needed
            message = json.loads(data)
            
            # Echo back for demo
            await manager.send_personal_message({
                "type": "echo",
                "data": message
            }, user_id)
    except WebSocketDisconnect:
        manager.disconnect(user_id)

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()