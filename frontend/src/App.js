import React, { useState, useEffect, useRef } from "react";
import "./App.css";
import axios from "axios";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { format, parseISO, subDays } from 'date-fns';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Login Component
const Login = ({ onLogin }) => {
  const [formData, setFormData] = useState({
    name: "",
    patient_id: "",
    doctor_id: "",
    user_type: "patient"
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const loginData = {
        name: formData.name,
        user_type: formData.user_type,
        ...(formData.user_type === "patient" ? { patient_id: formData.patient_id } : { doctor_id: formData.doctor_id })
      };

      const response = await axios.post(`${API}/auth/login`, loginData);
      if (response.data.success) {
        onLogin(response.data.user);
      }
    } catch (error) {
      console.error("Login failed:", error);
      alert("Login failed. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Medical Device Monitor</h1>
          <p className="text-gray-600">Sign in to your dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Account Type</label>
            <div className="flex space-x-4">
              <button
                type="button"
                onClick={() => setFormData({...formData, user_type: "patient", doctor_id: ""})}
                className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                  formData.user_type === "patient" 
                    ? "bg-blue-600 text-white" 
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                Patient
              </button>
              <button
                type="button"
                onClick={() => setFormData({...formData, user_type: "doctor", patient_id: ""})}
                className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                  formData.user_type === "doctor" 
                    ? "bg-blue-600 text-white" 
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                Doctor
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter your full name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {formData.user_type === "patient" ? "Patient ID" : "Doctor ID"}
            </label>
            <input
              type="text"
              required
              value={formData.user_type === "patient" ? formData.patient_id : formData.doctor_id}
              onChange={(e) => setFormData({
                ...formData, 
                [formData.user_type === "patient" ? "patient_id" : "doctor_id"]: e.target.value
              })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder={`Enter your ${formData.user_type} ID`}
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
};

// Bluetooth Connection Component
const BluetoothConnection = ({ patientId, onDeviceConnected }) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [deviceData, setDeviceData] = useState([]);

  const connectBluetooth = async () => {
    setIsConnecting(true);
    try {
      // Check if Web Bluetooth is supported
      if (!navigator.bluetooth) {
        alert("Web Bluetooth is not supported in this browser. Please use Chrome or Edge.");
        return;
      }

      // Request Bluetooth device
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: "ESP" },
          { namePrefix: "Device" }
        ],
        optionalServices: ['device_information']
      });

      console.log("Connected to device:", device.name);
      setConnectedDevice(device);

      // Register device in backend
      await axios.post(`${API}/patients/${patientId}/devices`, {
        name: device.name,
        id: device.id
      });

      onDeviceConnected && onDeviceConnected(device);

      // Simulate receiving data from ESP device
      simulateDeviceData(device);

    } catch (error) {
      console.error("Bluetooth connection failed:", error);
      alert("Failed to connect to Bluetooth device. Make sure your device is discoverable.");
    } finally {
      setIsConnecting(false);
    }
  };

  const simulateDeviceData = (device) => {
    // Simulate ESP device sending usage data every 30 seconds
    const interval = setInterval(async () => {
      const mockData = {
        patient_id: patientId,
        device_id: device.id,
        usage_duration: Math.floor(Math.random() * 480) + 60, // 1-8 hours
        time_of_day: Math.random() > 0.5 ? "day" : "night"
      };

      try {
        await axios.post(`${API}/bluetooth/data`, mockData);
        setDeviceData(prev => [...prev, { ...mockData, timestamp: new Date() }]);
      } catch (error) {
        console.error("Failed to send device data:", error);
      }
    }, 30000); // Every 30 seconds

    // Clean up interval when component unmounts
    return () => clearInterval(interval);
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
        <svg className="w-5 h-5 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
        </svg>
        Bluetooth Device Connection
      </h3>

      {!connectedDevice ? (
        <div className="text-center py-8">
          <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
            </svg>
          </div>
          <p className="text-gray-600 mb-4">Connect your ESP device via Bluetooth</p>
          <button
            onClick={connectBluetooth}
            disabled={isConnecting}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isConnecting ? "Connecting..." : "Connect Device"}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
            <div>
              <p className="font-medium text-green-800">{connectedDevice.name}</p>
              <p className="text-sm text-green-600">Connected</p>
            </div>
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          </div>
          
          {deviceData.length > 0 && (
            <div className="mt-4">
              <h4 className="font-medium text-gray-800 mb-2">Recent Data</h4>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {deviceData.slice(-3).map((data, index) => (
                  <div key={index} className="text-sm p-2 bg-gray-50 rounded">
                    <span className="font-medium">{data.usage_duration} minutes</span> - {data.time_of_day}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Usage Trend Chart Component
const UsageTrendChart = ({ analytics }) => {
  if (!analytics || !analytics.time_series || analytics.time_series.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Usage Trend</h3>
        <div className="text-center py-8 text-gray-500">
          No usage data available yet
        </div>
      </div>
    );
  }

  const chartData = {
    labels: analytics.time_series.map(item => format(parseISO(item.date + 'T00:00:00'), 'MMM dd')),
    datasets: [
      {
        label: 'Daily Usage (hours)',
        data: analytics.time_series.map(item => item.usage_hours),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.4,
        fill: true,
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'Daily Usage Trend',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Hours'
        }
      }
    },
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Usage Trend</h3>
      <div className="h-64">
        <Line data={chartData} options={options} />
      </div>
    </div>
  );
};

// Day/Night Usage Distribution Chart
const DayNightChart = ({ analytics }) => {
  if (!analytics || !analytics.day_night_distribution) {
    return null;
  }

  const chartData = {
    labels: ['Day Usage', 'Night Usage'],
    datasets: [
      {
        data: [
          Math.round(analytics.day_night_distribution.day / 60 * 10) / 10,
          Math.round(analytics.day_night_distribution.night / 60 * 10) / 10
        ],
        backgroundColor: [
          'rgba(255, 193, 7, 0.8)',
          'rgba(75, 192, 192, 0.8)',
        ],
        borderColor: [
          'rgba(255, 193, 7, 1)',
          'rgba(75, 192, 192, 1)',
        ],
        borderWidth: 2,
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: 'bottom',
      },
      title: {
        display: true,
        text: 'Day vs Night Usage (Hours)',
      },
    },
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Usage Distribution</h3>
      <div className="h-64">
        <Doughnut data={chartData} options={options} />
      </div>
    </div>
  );
};

// Patient Dashboard Component
const PatientDashboard = ({ user }) => {
  const [usageData, setUsageData] = useState([]);
  const [compliance, setCompliance] = useState(null);
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    fetchUsageData();
    fetchCompliance();
    fetchAnalytics();
    
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    
    // Set up daily reminder
    setDailyReminder();
  }, [user.id]);

  const fetchUsageData = async () => {
    try {
      const response = await axios.get(`${API}/patients/${user.id}/usage`);
      setUsageData(response.data);
    } catch (error) {
      console.error("Failed to fetch usage data:", error);
    }
  };

  const fetchCompliance = async () => {
    try {
      const response = await axios.get(`${API}/patients/${user.id}/compliance`);
      setCompliance(response.data);
    } catch (error) {
      console.error("Failed to fetch compliance:", error);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const response = await axios.get(`${API}/patients/${user.id}/analytics`);
      setAnalytics(response.data);
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
    }
  };

  const setDailyReminder = () => {
    // Show notification reminder every 24 hours
    if ('Notification' in window && Notification.permission === 'granted') {
      const showReminder = () => {
        new Notification("Device Reminder", {
          body: "Don't forget to connect your medical device today!",
          icon: "/favicon.ico"
        });
      };

      // Show reminder in 1 minute for demo, then every 24 hours
      setTimeout(showReminder, 60000);
      setInterval(showReminder, 24 * 60 * 60 * 1000);
    }
  };

  const getTrendIcon = (trend) => {
    if (!trend) return null;
    
    switch (trend.direction) {
      case 'increasing':
        return <span className="text-green-600">↗ +{trend.percentage}%</span>;
      case 'decreasing':
        return <span className="text-red-600">↘ -{trend.percentage}%</span>;
      default:
        return <span className="text-gray-600">→ {trend.percentage}%</span>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Patient Dashboard</h1>
              <p className="text-gray-600">{user.name} • ID: {user.patient_id}</p>
            </div>
            <div className="flex items-center space-x-6">
              {compliance && (
                <>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {Math.round(compliance.compliance_percentage)}%
                    </div>
                    <div className="text-sm text-gray-600">Compliance</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {compliance.average_daily_hours}h
                    </div>
                    <div className="text-sm text-gray-600">Daily Average</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-semibold">
                      {getTrendIcon(compliance.usage_trend)}
                    </div>
                    <div className="text-sm text-gray-600">Trend</div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Bluetooth Connection */}
          <BluetoothConnection 
            patientId={user.id}
            onDeviceConnected={() => {
              fetchUsageData();
              fetchCompliance();
              fetchAnalytics();
            }}
          />

          {/* Compliance Summary */}
          {compliance && (
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Compliance Summary</h3>
              <div className="grid grid-cols-1 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {compliance.total_sessions}
                  </div>
                  <div className="text-sm text-gray-600">Total Sessions</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {Math.round(compliance.total_duration_minutes / 60)}h
                  </div>
                  <div className="text-sm text-gray-600">Total Hours</div>
                </div>
              </div>
            </div>
          )}

          {/* Usage Statistics */}
          {analytics && (
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Usage Statistics</h3>
              <div className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-gray-600">Active Days:</span>
                  <span className="font-semibold">{analytics.active_days}/{analytics.total_days}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Daily Average:</span>
                  <span className="font-semibold">{analytics.average_daily_hours}h</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Activity Rate:</span>
                  <span className="font-semibold">
                    {Math.round((analytics.active_days / analytics.total_days) * 100)}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <UsageTrendChart analytics={analytics} />
          <DayNightChart analytics={analytics} />
        </div>
      </div>
    </div>
  );
};

// Doctor Dashboard Component
const DoctorDashboard = ({ user }) => {
  const [patients, setPatients] = useState([]);
  const [dashboardData, setDashboardData] = useState(null);

  useEffect(() => {
    fetchPatients();
    fetchDashboardData();
  }, [user.id]);

  const fetchPatients = async () => {
    try {
      const response = await axios.get(`${API}/doctors/${user.id}/patients`);
      setPatients(response.data);
    } catch (error) {
      console.error("Failed to fetch patients:", error);
    }
  };

  const fetchDashboardData = async () => {
    try {
      const response = await axios.get(`${API}/doctors/${user.id}/dashboard`);
      setDashboardData(response.data);
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    }
  };

  const getComplianceColor = (percentage) => {
    if (percentage >= 80) return 'text-green-600';
    if (percentage >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getAlertBadge = (severity) => {
    const colors = {
      high: 'bg-red-100 text-red-800',
      medium: 'bg-yellow-100 text-yellow-800',
      low: 'bg-orange-100 text-orange-800'
    };
    return colors[severity] || colors.medium;
  };

  const getTrendIcon = (trend) => {
    if (!trend) return null;
    
    switch (trend.direction) {
      case 'increasing':
        return <span className="text-green-600 text-sm">↗ +{trend.percentage}%</span>;
      case 'decreasing':
        return <span className="text-red-600 text-sm">↘ -{trend.percentage}%</span>;
      default:
        return <span className="text-gray-600 text-sm">→ {trend.percentage}%</span>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Doctor Dashboard</h1>
              <p className="text-gray-600">Dr. {user.name} • ID: {user.doctor_id}</p>
            </div>
            <div className="flex items-center space-x-6">
              {dashboardData && (
                <>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{dashboardData.total_patients}</div>
                    <div className="text-sm text-gray-600">Total Patients</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{dashboardData.active_today}</div>
                    <div className="text-sm text-gray-600">Active Today</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">{dashboardData.alert_count}</div>
                    <div className="text-sm text-gray-600">Alerts</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">{dashboardData.activity_rate}%</div>
                    <div className="text-sm text-gray-600">Activity Rate</div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Alerts Section */}
        {dashboardData && dashboardData.alerts && dashboardData.alerts.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
              <svg className="w-5 h-5 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 13.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              Patient Alerts ({dashboardData.alerts.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {dashboardData.alerts.map((alert) => (
                <div key={alert.patient_id} className="border border-red-200 rounded-lg p-4 bg-red-50">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-medium text-gray-800">{alert.patient_name}</h3>
                      <p className="text-sm text-gray-600">
                        {alert.days_inactive} days inactive
                      </p>
                      {alert.last_session && (
                        <p className="text-xs text-gray-500">
                          Last: {new Date(alert.last_session).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getAlertBadge(alert.severity)}`}>
                      {alert.severity}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Patients List */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800">Patient Compliance Overview</h2>
          </div>
          
          <div className="divide-y divide-gray-200">
            {patients.map((patient) => (
              <div key={patient.patient_id} className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 font-medium">
                        {patient.patient_name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-800">{patient.patient_name}</h3>
                      <p className="text-sm text-gray-600">ID: {patient.patient_id}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-6">
                    <div className="text-center">
                      <div className="text-lg font-semibold text-gray-800">
                        {patient.total_sessions}
                      </div>
                      <div className="text-xs text-gray-600">Sessions</div>
                    </div>
                    
                    <div className="text-center">
                      <div className="text-lg font-semibold text-gray-800">
                        {patient.average_daily_hours}h
                      </div>
                      <div className="text-xs text-gray-600">Daily Avg</div>
                    </div>
                    
                    <div className="text-center">
                      <div className="text-lg font-semibold text-gray-800">
                        {Math.round(patient.total_duration_minutes / 60)}h
                      </div>
                      <div className="text-xs text-gray-600">Total Hours</div>
                    </div>
                    
                    <div className="text-center">
                      <div className={`text-lg font-semibold ${getComplianceColor(patient.compliance_percentage)}`}>
                        {Math.round(patient.compliance_percentage)}%
                      </div>
                      <div className="text-xs text-gray-600">Compliance</div>
                    </div>
                    
                    <div className="text-center">
                      {getTrendIcon(patient.usage_trend)}
                      <div className="text-xs text-gray-600">Trend</div>
                    </div>
                    
                    <div className="flex items-center">
                      <div className={`w-3 h-3 rounded-full ${
                        patient.device_connected ? 'bg-green-500' : 'bg-red-500'
                      }`}></div>
                      <span className="ml-2 text-sm text-gray-600">
                        {patient.device_connected ? 'Connected' : 'Disconnected'}
                      </span>
                    </div>
                    
                    {patient.compliance_percentage < 60 && (
                      <div className="px-3 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full">
                        Needs Attention
                      </div>
                    )}
                  </div>
                </div>
                
                {patient.last_session && (
                  <div className="mt-3 text-sm text-gray-600">
                    Last session: {new Date(patient.last_session).toLocaleDateString()}
                  </div>
                )}
              </div>
            ))}
          </div>
          
          {patients.length === 0 && (
            <div className="p-12 text-center text-gray-500">
              No patients found
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Main App Component
function App() {
  const [user, setUser] = useState(null);

  const handleLogin = (userData) => {
    setUser(userData);
  };

  const handleLogout = () => {
    setUser(null);
  };

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="App">
      {user.user_type === "patient" ? (
        <PatientDashboard user={user} />
      ) : (
        <DoctorDashboard user={user} />
      )}
      
      {/* Logout Button */}
      <button
        onClick={handleLogout}
        className="fixed bottom-4 right-4 bg-red-600 text-white p-3 rounded-full shadow-lg hover:bg-red-700 transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
      </button>
    </div>
  );
}

export default App;