"""
upGrad Live Session Reminder - Flask Backend Server
Handles Google Sheets integration, email sending, and configuration management
"""

import os
import json
import time
import smtplib
import urllib.parse
from datetime import datetime, timezone, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import gspread
from oauth2client.service_account import ServiceAccountCredentials
from dotenv import load_dotenv
import requests
from itsdangerous import URLSafeTimedSerializer


# Load environment variables from .env file
load_dotenv()

class SupabaseClient:
    def __init__(self):
        self.url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        self.service_key = os.environ.get("SUPABASE_SERVICE_KEY", "")
        self.enabled = bool(self.url and self.service_key and "YOUR_SUPABASE" not in self.service_key)
        
        if self.enabled:
            self.headers = {
                "apikey": self.service_key,
                "Authorization": f"Bearer {self.service_key}",
                "Content-Type": "application/json",
                "Prefer": "return=representation"
            }
            print(f"[OK] Supabase client initialized for: {self.url}")
        else:
            print("[WARNING] Supabase credentials not found in env. Supabase features will be disabled.")
            
    def is_configured(self):
        return self.enabled

    # AUTH API
    def login(self, email, password):
        if not self.enabled:
            return None, "Supabase integration not enabled"
        try:
            auth_url = f"{self.url}/auth/v1/token?grant_type=password"
            resp = requests.post(auth_url, json={"email": email.strip(), "password": password}, headers={"apikey": self.service_key})
            if resp.status_code == 200:
                data = resp.json()
                return data, None
            else:
                err_msg = resp.json().get("error_description") or resp.json().get("msg") or f"Auth failed ({resp.status_code})"
                return None, err_msg
        except Exception as e:
            return None, str(e)

    def admin_create_user(self, email, password, name):
        if not self.enabled:
            return None, "Supabase integration not enabled"
        try:
            url = f"{self.url}/auth/v1/admin/users"
            payload = {
                "email": email.strip(),
                "password": password,
                "email_confirm": True,
                "user_metadata": {"name": name}
            }
            resp = requests.post(url, json=payload, headers=self.headers)
            if resp.status_code in (200, 201):
                return resp.json(), None
            else:
                err_msg = resp.json().get("msg") or resp.json().get("error") or f"Failed to create user ({resp.status_code})"
                return None, err_msg
        except Exception as e:
            return None, str(e)

    def admin_update_user(self, user_id, email=None, password=None, name=None):
        if not self.enabled:
            return None, "Supabase integration not enabled"
        try:
            url = f"{self.url}/auth/v1/admin/users/{user_id}"
            payload = {}
            if email:
                payload["email"] = email.strip()
            if password:
                payload["password"] = password
            if name:
                payload["user_metadata"] = {"name": name}
            
            resp = requests.put(url, json=payload, headers=self.headers)
            if resp.status_code == 200:
                return resp.json(), None
            else:
                err_msg = resp.json().get("msg") or f"Failed to update user ({resp.status_code})"
                return None, err_msg
        except Exception as e:
            return None, str(e)

    def admin_delete_user(self, user_id):
        if not self.enabled:
            return None, "Supabase integration not enabled"
        try:
            url = f"{self.url}/auth/v1/admin/users/{user_id}"
            resp = requests.delete(url, headers=self.headers)
            if resp.status_code in (200, 204):
                return True, None
            else:
                err_msg = resp.json().get("msg") or f"Failed to delete user ({resp.status_code})"
                return False, err_msg
        except Exception as e:
            return False, str(e)

    def get_auth_user_by_email(self, email):
        if not self.enabled:
            return None
        try:
            url = f"{self.url}/auth/v1/admin/users"
            resp = requests.get(url, headers=self.headers)
            if resp.status_code == 200:
                users_list = resp.json().get("users", [])
                for u in users_list:
                    if u.get("email", "").lower() == email.lower():
                        return u
            return None
        except Exception as e:
            print(f"Error fetching auth users: {e}")
            return None

    # DATABASE API
    def get_user_profiles(self):
        if not self.enabled:
            return []
        try:
            url = f"{self.url}/rest/v1/user_profiles?select=*"
            resp = requests.get(url, headers=self.headers)
            if resp.status_code == 200:
                return resp.json()
            return []
        except Exception as e:
            print(f"Error fetching user profiles: {e}")
            return []

    def get_user_profile(self, email):
        if not self.enabled:
            return None
        try:
            url = f"{self.url}/rest/v1/user_profiles?email=eq.{email.lower()}&select=*"
            resp = requests.get(url, headers=self.headers)
            if resp.status_code == 200:
                rows = resp.json()
                return rows[0] if rows else None
            return None
        except Exception as e:
            print(f"Error fetching profile: {e}")
            return None

    def upsert_user_profile(self, user_id, email, name, role):
        if not self.enabled:
            return False
        try:
            profile = self.get_user_profile(email)
            payload = {
                "id": user_id,
                "email": email.lower(),
                "name": name,
                "role": role
            }
            if profile:
                url = f"{self.url}/rest/v1/user_profiles?id=eq.{user_id}"
                resp = requests.patch(url, json=payload, headers=self.headers)
            else:
                url = f"{self.url}/rest/v1/user_profiles"
                resp = requests.post(url, json=payload, headers=self.headers)
            return resp.status_code in (200, 201, 204)
        except Exception as e:
            print(f"Error upserting profile: {e}")
            return False

    def update_user_profile(self, user_id, name=None, role=None):
        if not self.enabled:
            return False
        try:
            payload = {}
            if name: payload["name"] = name
            if role: payload["role"] = role
            url = f"{self.url}/rest/v1/user_profiles?id=eq.{user_id}"
            resp = requests.patch(url, json=payload, headers=self.headers)
            return resp.status_code in (200, 201, 204)
        except Exception as e:
            print(f"Error updating profile: {e}")
            return False

    def delete_user_profile(self, user_id):
        if not self.enabled:
            return False
        try:
            url = f"{self.url}/rest/v1/user_profiles?id=eq.{user_id}"
            resp = requests.delete(url, headers=self.headers)
            return resp.status_code in (200, 204)
        except Exception as e:
            print(f"Error deleting profile: {e}")
            return False

    # SETTINGS API
    def get_settings(self, email):
        if not self.enabled:
            return None
        try:
            url = f"{self.url}/rest/v1/user_settings?email=eq.{email.lower()}&select=*"
            resp = requests.get(url, headers=self.headers)
            if resp.status_code == 200:
                rows = resp.json()
                return rows[0] if rows else None
            return None
        except Exception as e:
            print(f"Error getting settings: {e}")
            return None

    def get_all_settings(self):
        if not self.enabled:
            return []
        try:
            url = f"{self.url}/rest/v1/user_settings?select=*"
            resp = requests.get(url, headers=self.headers)
            if resp.status_code == 200:
                return resp.json()
            return []
        except Exception as e:
            print(f"Error getting all settings: {e}")
            return []

    def upsert_settings(self, email, sender_email, app_password, sig_name, sig_title, sig_address, sig_phone, sig_email, cc_emails, test_mode):
        if not self.enabled:
            return False
        try:
            existing = self.get_settings(email)
            payload = {
                "email": email.lower(),
                "sender_email": sender_email,
                "app_password": app_password,
                "signature_name": sig_name,
                "signature_title": sig_title,
                "signature_address": sig_address,
                "signature_phone": sig_phone,
                "signature_email": sig_email,
                "cc_emails": cc_emails,
                "test_mode": False
            }
            if existing:
                url = f"{self.url}/rest/v1/user_settings?email=eq.{email.lower()}"
                resp = requests.patch(url, json=payload, headers=self.headers)
            else:
                url = f"{self.url}/rest/v1/user_settings"
                resp = requests.post(url, json=payload, headers=self.headers)
            return resp.status_code in (200, 201, 204)
        except Exception as e:
            print(f"Error upserting settings: {e}")
            return False

    # SYSTEM SETTINGS API
    def get_system_setting(self, key):
        if not self.enabled:
            return None
        try:
            url = f"{self.url}/rest/v1/system_settings?key=eq.{key}&select=value"
            resp = requests.get(url, headers=self.headers)
            if resp.status_code == 200:
                rows = resp.json()
                return rows[0]["value"] if rows else None
            return None
        except Exception as e:
            print(f"Error getting system setting {key}: {e}")
            return None

    def get_all_system_settings(self):
        if not self.enabled:
            return {}
        try:
            url = f"{self.url}/rest/v1/system_settings?select=key,value"
            resp = requests.get(url, headers=self.headers)
            if resp.status_code == 200:
                return {row["key"]: row["value"] for row in resp.json() if "key" in row}
            return {}
        except Exception as e:
            print(f"Error getting all system settings: {e}")
            return {}

    def set_system_setting(self, key, value):
        if not self.enabled:
            return False
        try:
            existing = self.get_system_setting(key)
            payload = {"key": key, "value": str(value)}
            if existing is not None:
                url = f"{self.url}/rest/v1/system_settings?key=eq.{key}"
                resp = requests.patch(url, json=payload, headers=self.headers)
            else:
                url = f"{self.url}/rest/v1/system_settings"
                resp = requests.post(url, json=payload, headers=self.headers)
            return resp.status_code in (200, 201, 204)
        except Exception as e:
            print(f"Error setting system setting {key}: {e}")
            return False

    # ACTIVITY LOGS API
    def log_activity(self, user_name, email, role, activity_type, activity_details):
        if not self.enabled:
            return False
        try:
            url = f"{self.url}/rest/v1/activity_logs"
            payload = {
                "user_name": user_name,
                "email": email.lower() if email else None,
                "role": role,
                "activity_type": activity_type,
                "activity_details": activity_details
            }
            resp = requests.post(url, json=payload, headers=self.headers)
            return resp.status_code in (200, 201, 204)
        except Exception as e:
            print(f"Error logging activity: {e}")
            return False

    def get_logs(self):
        if not self.enabled:
            return []
        try:
            url = f"{self.url}/rest/v1/activity_logs?select=*&order=timestamp.desc"
            resp = requests.get(url, headers=self.headers)
            if resp.status_code == 200:
                return resp.json()
            return []
        except Exception as e:
            print(f"Error getting logs: {e}")
            return []

    def delete_logs(self, log_ids=None):
        if not self.enabled:
            return False
        try:
            if log_ids:
                ids_str = ",".join([f'"{lid}"' for lid in log_ids])
                url = f"{self.url}/rest/v1/activity_logs?id=in.({ids_str})"
            else:
                url = f"{self.url}/rest/v1/activity_logs?id=not.is.null"
            resp = requests.delete(url, headers=self.headers)
            return resp.status_code in (200, 204)
        except Exception as e:
            print(f"Error deleting logs: {e}")
            return False

    # EMAIL HISTORY API
    def log_email_sent(self, sender_email, recipient_email, subject, spoc_email, status, details):
        if not self.enabled:
            return False
        try:
            url = f"{self.url}/rest/v1/email_history"
            payload = {
                "sender_email": sender_email,
                "recipient_email": recipient_email,
                "subject": subject,
                "spoc_email": spoc_email.lower(),
                "status": status,
                "details": details
            }
            resp = requests.post(url, json=payload, headers=self.headers)
            return resp.status_code in (200, 201, 204)
        except Exception as e:
            print(f"Error logging email: {e}")
            return False

    def get_email_history(self):
        if not self.enabled:
            return []
        try:
            url = f"{self.url}/rest/v1/email_history?select=*&order=sent_at.desc"
            resp = requests.get(url, headers=self.headers)
            if resp.status_code == 200:
                return resp.json()
            return []
        except Exception as e:
            print(f"Error getting email history: {e}")
            return []

    def is_email_already_sent(self, recipient_email, subject):
        if not self.enabled:
            return False
        try:
            q_email = urllib.parse.quote(recipient_email.lower())
            q_subject = urllib.parse.quote(subject)
            url = f"{self.url}/rest/v1/email_history?recipient_email=eq.{q_email}&status=eq.Success&subject=eq.{q_subject}&select=id"
            resp = requests.get(url, headers=self.headers)
            if resp.status_code == 200:
                rows = resp.json()
                return len(rows) > 0
            return False
        except Exception as e:
            print(f"Error checking email sent status: {e}")
            return False

    def delete_email_history(self, history_ids=None):
        if not self.enabled:
            return False
        try:
            if history_ids:
                ids_str = ",".join([f'"{hid}"' for hid in history_ids])
                url = f"{self.url}/rest/v1/email_history?id=in.({ids_str})"
            else:
                url = f"{self.url}/rest/v1/email_history?id=not.is.null"
            resp = requests.delete(url, headers=self.headers)
            return resp.status_code in (200, 204)
        except Exception as e:
            print(f"Error deleting email history: {e}")
            return False

    # DRAFT HISTORY API
    def log_drafts_generated(self, spoc_email, grader_name, grader_email, session_count, subject):
        if not self.enabled:
            return False
        try:
            url = f"{self.url}/rest/v1/draft_history"
            payload = {
                "spoc_email": spoc_email.lower(),
                "grader_name": grader_name,
                "grader_email": grader_email,
                "session_count": session_count,
                "subject": subject
            }
            resp = requests.post(url, json=payload, headers=self.headers)
            return resp.status_code in (200, 201, 204)
        except Exception as e:
            print(f"Error logging draft: {e}")
            return False

    def get_draft_history(self):
        if not self.enabled:
            return []
        try:
            url = f"{self.url}/rest/v1/draft_history?select=*&order=created_at.desc"
            resp = requests.get(url, headers=self.headers)
            if resp.status_code == 200:
                return resp.json()
            return []
        except Exception as e:
            print(f"Error getting draft history: {e}")
            return []

db = SupabaseClient()

def provision_default_admin():
    if not db.is_configured():
        return
    admin_email = "omkar.jagtap@upgrad.com"
    admin_pass = os.environ.get("DEFAULT_ADMIN_PASSWORD")
    if not admin_pass:
        print("[PROVISION] DEFAULT_ADMIN_PASSWORD environment variable not set. Skipping default admin provisioning.")
        return
    admin_name = "Omkar Jagtap"
    
    try:
        profile = db.get_user_profile(admin_email)
        if not profile:
            print(f"[PROVISION] Checking Auth for default admin: {admin_email}")
            user_auth = db.get_auth_user_by_email(admin_email)
            if not user_auth:
                print(f"[PROVISION] Creating user in auth: {admin_email}")
                user_data, err = db.admin_create_user(admin_email, admin_pass, admin_name)
                if err:
                    print(f"[PROVISION] Error creating admin user in auth: {err}")
                    return
                user_id = user_data["id"]
            else:
                user_id = user_auth["id"]
                
            db.upsert_user_profile(user_id, admin_email, admin_name, "Admin")
            db.upsert_settings(
                email=admin_email,
                sender_email=admin_email,
                app_password="",
                sig_name=admin_name,
                sig_title="Admin",
                sig_address=STATIC_OFFICE_ADDRESS,
                sig_phone="",
                sig_email=admin_email,
                cc_emails="",
                test_mode=True
            )
            print("[PROVISION] Default admin created successfully.")
    except Exception as e:
        print(f"[PROVISION] Exception during admin check/creation: {e}")


# Initialize Flask App — use absolute paths so Gunicorn on Render finds the folders
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(
    __name__,
    static_folder=os.path.join(_BASE_DIR, "web", "static"),
    template_folder=os.path.join(_BASE_DIR, "web", "templates")
)
CORS(app)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "upgrad-automation-secret-key-2026")


# Configuration — all paths are absolute so Gunicorn on Render finds them
WORKSPACE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(WORKSPACE_DIR, "config.json")

# Default configuration
DEFAULT_CONFIG = {
    "BASE_SHEET_URL": "",
    "TAB_NAME": "Live Session Reminder",
    "TEST_MODE": False
}

STATIC_OFFICE_ADDRESS = "3rd Floor, CTS-796-A | Fleet Bldg. Opp, Marol Fire Station, Marol, Andheri (East)| Mumbai MH 400059"

# In-memory config cache to prevent duplicate database calls
_CONFIG_CACHE = None
_CONFIG_CACHE_TIME = 0
CONFIG_CACHE_TTL = 300  # Cache for 5 minutes

def load_config(force_reload=False):
    """Load configuration from Supabase (system_settings), falling back to config.json"""
    global _CONFIG_CACHE, _CONFIG_CACHE_TIME
    
    now = time.time()
    if not force_reload and _CONFIG_CACHE is not None and (now - _CONFIG_CACHE_TIME) < CONFIG_CACHE_TTL:
        return _CONFIG_CACHE

    config = DEFAULT_CONFIG.copy()
    
    # 1. Try Supabase in a single batch query
    if db.is_configured():
        try:
            settings = db.get_all_system_settings()
            sheet_url = settings.get("BASE_SHEET_URL")
            tab_name = settings.get("TAB_NAME")
            test_mode = settings.get("TEST_MODE")
            
            if sheet_url is not None: config["BASE_SHEET_URL"] = sheet_url
            if tab_name is not None: config["TAB_NAME"] = tab_name
            if test_mode is not None: config["TEST_MODE"] = (test_mode == "true")
            
            if sheet_url is not None or tab_name is not None:
                env_sheet_url = os.environ.get("BASE_SHEET_URL")
                if env_sheet_url:
                    config["BASE_SHEET_URL"] = env_sheet_url
                _CONFIG_CACHE = config
                _CONFIG_CACHE_TIME = now
                return config
        except Exception as e:
            print(f"Error loading config from Supabase: {e}")

    # 2. Fallback to local config.json
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                loaded = json.load(f)
                if isinstance(loaded, dict):
                    config.update(loaded)
        except Exception as e:
            print(f"Error reading config.json: {e}")
            
    env_sheet_url = os.environ.get("BASE_SHEET_URL")
    if env_sheet_url:
        config["BASE_SHEET_URL"] = env_sheet_url
        
    _CONFIG_CACHE = config
    _CONFIG_CACHE_TIME = now
    return config

def save_config(config):
    """Save configuration to Supabase (system_settings) and/or config.json"""
    global _CONFIG_CACHE, _CONFIG_CACHE_TIME
    _CONFIG_CACHE = None  # Invalidate in-memory cache
    _CONFIG_CACHE_TIME = 0
    
    supabase_success = False
    if db.is_configured():
        try:
            if "BASE_SHEET_URL" in config:
                db.set_system_setting("BASE_SHEET_URL", config["BASE_SHEET_URL"])
            if "TAB_NAME" in config:
                db.set_system_setting("TAB_NAME", config["TAB_NAME"])
            if "TEST_MODE" in config:
                db.set_system_setting("TEST_MODE", "true" if config["TEST_MODE"] else "false")
            supabase_success = True
        except Exception as e:
            print(f"Error saving config to Supabase: {e}")

    try:
        to_save = config.copy()
        if "BASE_SHEET_URL" in to_save:
            del to_save["BASE_SHEET_URL"]
            
        with open(CONFIG_FILE, "w") as f:
            json.dump(to_save, f, indent=4)
        return True
    except Exception as e:
        print(f"Error saving config.json: {e}")
        return supabase_success

def find_credentials_file():
    """Auto-detect the Google Service Account credentials JSON file"""
    for f in os.listdir(WORKSPACE_DIR):
        if f.endswith(".json") and f != "config.json" and f != "scratch_find.py" and f != "scratch_find.json":
            full_path = os.path.join(WORKSPACE_DIR, f)
            try:
                with open(full_path, "r") as jf:
                    data = json.load(jf)
                    if "private_key" in data and "client_email" in data:
                        return full_path
            except:
                continue
    return None

def get_google_credentials(scope):
    """Load ServiceAccountCredentials from environment variable dict or local JSON file"""
    # 1. Try loading from environment variable (ideal for Render)
    creds_json = os.environ.get("GOOGLE_CREDS_JSON")
    if creds_json:
        try:
            creds_dict = json.loads(creds_json)
            return ServiceAccountCredentials.from_json_keyfile_dict(creds_dict, scope)
        except Exception as e:
            print(f"Error loading GOOGLE_CREDS_JSON env var: {e}")

    # 2. Try loading from local file
    creds_path = find_credentials_file()
    if creds_path and os.path.exists(creds_path):
        try:
            return ServiceAccountCredentials.from_json_keyfile_name(creds_path, scope)
        except Exception as e:
            print(f"Error loading credentials file {creds_path}: {e}")
            
    return None

def format_date_to_sheet(date_str):
    """Convert YYYY-MM-DD from HTML date-picker to DD-MMM-YYYY for the sheet"""
    try:
        dt = datetime.strptime(date_str.strip(), "%Y-%m-%d")
        return dt.strftime("%d-%b-%Y")
    except Exception as e:
        print(f"Date conversion error for '{date_str}': {e}")
        return date_str

def get_first_name(full_name):
    if not full_name:
        return "Professor"
    name_str = str(full_name).strip()
    titles = ["Dr.", "Dr", "Professor", "Prof.", "Prof"]
    for title in titles:
        if name_str.lower().startswith(title.lower()):
            name_str = name_str[len(title):].strip().lstrip('.').strip()
            break
    parts = name_str.split()
    return parts[0] if parts else "Professor"

def generate_time_link(topic, date_str, time_str):
    try:
        date_str = str(date_str).split()[0]
        dt_obj = None
        for fmt in ('%Y-%m-%d', '%d-%m-%Y', '%d/%m/%Y', '%m/%d/%Y', '%d-%b-%Y', '%Y-%b-%d', '%Y-%m-%d %H:%M:%S'):
            try:
                dt_obj = datetime.strptime(date_str, fmt)
                break
            except:
                continue
        
        if not dt_obj: return ""
            
        time_obj = None
        time_str = str(time_str).strip()
        for fmt in ('%H:%M', '%I:%M %p', '%I:%M%p', '%H:%M:%S'):
            try:
                time_obj = datetime.strptime(time_str, fmt)
                break
            except:
                continue
                
        if not time_obj: return ""
            
        iso_str = dt_obj.strftime('%Y%m%d') + "T" + time_obj.strftime('%H%M')
        encoded_msg = urllib.parse.quote(str(topic))
        return f"https://www.timeanddate.com/worldclock/fixedtime.html?msg={encoded_msg}&iso={iso_str}&p1=54"
    except:
        return ""

def generate_email_body(grader_name, sessions, sig_name, sig_title, sig_phone, sig_email):
    first_name = get_first_name(grader_name)
    
    body_style = "font-family: Arial, sans-serif; font-size: 14px; color: #000000; line-height: 1.5;"
    table_style = "width: 100%; border-collapse: collapse; margin: 15px 0;"
    th_style = "border: 1px solid #dddddd; text-align: left; padding: 8px; background-color: #f2f2f2;"
    td_style = "border: 1px solid #dddddd; text-align: left; padding: 8px;"
    link_style = "color: #1a73e8; text-decoration: underline;"

    html = f"""
    <html>
    <body style="{body_style}">
        <p>Hello Dr. {first_name},</p>
        <p>I hope you’re doing well.</p>
        <p>This is a gentle reminder about the upcoming <strong>Live Session</strong> scheduled for you. I kindly request you to join at least 5 minutes early to complete the necessary hygiene checks.</p>
    """
    
    if len(sessions) == 1:
        s = sessions[0]
        time_link = generate_time_link(s['topic'], s['date'], s['time_from'])
        
        html += f"""
        <p style="margin: 15px 0;">
            <strong>Date:</strong> {s['date']}<br>
            <strong>Time:</strong> {s['time_from']} to {s['time_to']} IST 
            {f'(<a href="{time_link}" style="{link_style}">Check your local time here</a>)' if time_link else ''}<br>
            <strong>Topic:</strong> {s['topic']}<br>
            <strong>Session Link:</strong> <a href="{s['link']}" style="{link_style}">{s['link']}</a>
        </p>
        """
    else:
        html += f"""
        <p style="margin: 15px 0;">Your scheduled sessions are as follows:</p>
        <table style="{table_style}">
            <tr>
                <th style="{th_style}">Date</th>
                <th style="{th_style}">Topic</th>
                <th style="{th_style}">Time (Local / IST)</th>
                <th style="{th_style}">Session & Local Time</th>
            </tr>
        """
        for s in sessions:
            time_link = generate_time_link(s['topic'], s['date'], s['time_from'])
            
            html += f"""
            <tr>
                <td style="{td_style}">{s['date']}</td>
                <td style="{td_style}">{s['topic']}</td>
                <td style="{td_style}">{s['time_from']} - {s['time_to']} IST</td>
                <td style="{td_style}">
                    <a href="{s['link']}" style="{link_style}">Join Session</a><br>
                    {f'<a href="{time_link}" style="{link_style}">Check Local Time</a>' if time_link else ''}
                </td>
            </tr>
            """
        html += "</table>"

    html += f"""
        <p>If you require any assistance, please feel free to reach out. We look forward to your participation.</p>
        
        <div style="font-size: 13px; color: #333333; margin-top: 20px;">
            <p style="margin: 0 0 2px 0;">Best Regards,</p>
            <p style="margin: 0 0 2px 0; font-weight: bold; color: #000000; font-size: 14px;">{sig_name}</p>
            <p style="margin: 0 0 2px 0;">{sig_title}</p>
            <p style="margin: 0 0 2px 0;">{STATIC_OFFICE_ADDRESS}</p>
            <p style="margin: 8px 0 0 0;"></p>
            <p style="margin: 0 0 2px 0;">M  {sig_phone}</p>
            <p style="margin: 0 0 2px 0;">E-mail : <a href="mailto:{sig_email}" style="{link_style}">{sig_email}</a> | <a href="https://www.upgrad.com/" style="{link_style}">https://www.upgrad.com/</a></p>
            <p style="margin: 0 0 2px 0;">Follow us: <a href="https://facebook.com/upgrad" style="{link_style}">Facebook</a> | <a href="https://twitter.com/upgrad" style="{link_style}">Twitter</a> | <a href="https://linkedin.com/company/upgrad" style="{link_style}">LinkedIn</a> | <a href="https://youtube.com/upgrad" style="{link_style}">YouTube</a></p>
            <p style="margin: 8px 0 0 0; font-size: 11px; color: #666666;">Customer Care: 1800 210 2020 (Toll-free)</p>
        </div>
    </body>
    </html>
    """
    return html

def extract_name_from_email(email_str):
    if not email_str or "@" not in email_str:
        return "N/A"
    local_part = email_str.split("@")[0]
    first_part = local_part.split(".")[0]
    return first_part.capitalize()

def group_sessions_by_grader(data):
    """
    Group all session rows by recipient email AND SPOC email.
    If SPOC differs, always generate separate drafts.
    """
    graders = {}
    for row in data:
        name = str(row.get("Grader", "Professor")).strip()
        email = str(row.get("Grader Email", "")).strip()
        if not email or "@" not in email:
            continue

        # Extract SPOC Email from Column A (first key of dict)
        spoc_email = ""
        keys = list(row.keys())
        if keys:
            first_key = keys[0]
            val = str(row.get(first_key, "")).strip()
            if "@" in val:
                spoc_email = val
                
        # Fallback to search key if not found
        if not spoc_email:
            for k, v in row.items():
                k_lower = k.lower()
                if "spoc email" in k_lower or "spoc mail" in k_lower or "spoc_email" in k_lower or k_lower == "spoc":
                    if "@" in str(v):
                        spoc_email = str(v).strip()
                        break

        spoc_name = extract_name_from_email(spoc_email)

        # Unique key grouping grader email AND spoc email
        key = f"{email.lower()}:{spoc_email.lower()}"
        if key not in graders:
            graders[key] = {
                "name": name,
                "email": email,
                "sessions": [],
                "spoc_email": spoc_email,
                "spoc_name": spoc_name
            }

        graders[key]["sessions"].append({
            "date": row.get("Date"),
            "course": row.get("Course"),
            "cohort": row.get("Cohort"),
            "topic": row.get("Topic"),
            "time_from": row.get("Time From"),
            "time_to": row.get("Time to"),
            "link": row.get("Session Link"),
            "spoc": spoc_name,
            "spoc_email": spoc_email
        })
    return graders

# API Routes
@app.route('/')
def serve_index():
    """Serve the main application page"""
    return send_from_directory(os.path.join(WORKSPACE_DIR, "web", "templates"), "index.html")

@app.route('/css/<path:path>')
def serve_css(path):
    return send_from_directory(os.path.join(WORKSPACE_DIR, "web", "static", "css"), path)

@app.route('/js/<path:path>')
def serve_js(path):
    return send_from_directory(os.path.join(WORKSPACE_DIR, "web", "static", "js"), path)

def get_current_user():
    if not db.is_configured():
        return {
            "id": "local-id",
            "email": "omkar.jagtap@upgrad.com",
            "name": "Local Dev Admin",
            "role": "Admin"
        }, None

    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None, "Missing or invalid token"
    token = auth_header.split(" ")[1]
    
    if token == "local-token":
        return {
            "id": "local-id",
            "email": "omkar.jagtap@upgrad.com",
            "name": "Omkar Jagtap (Dev Mode)",
            "role": "Admin"
        }, None

    # Try custom signed token first
    serializer = URLSafeTimedSerializer(app.secret_key)
    try:
        user_data = serializer.loads(token, max_age=30 * 24 * 3600)
        return user_data, None
    except Exception:
        pass

    url = f"{db.url}/auth/v1/user"
    headers = {
        "apikey": db.service_key,
        "Authorization": f"Bearer {token}"
    }
    try:
        resp = requests.get(url, headers=headers)
        if resp.status_code == 200:
            user_data = resp.json()
            email = user_data.get("email")
            profile = db.get_user_profile(email)
            if not profile:
                if email.lower() == "omkar.jagtap@upgrad.com":
                    db.upsert_user_profile(user_data["id"], email, "Omkar Jagtap", "Admin")
                    profile = db.get_user_profile(email)
                else:
                    return None, f"User profile not found for {email}"
            return {
                "id": user_data.get("id"),
                "email": email,
                "name": profile.get("name") if profile else "User",
                "role": profile.get("role") if profile else "User"
            }, None
        else:
            return None, "Invalid or expired token"
    except Exception as e:
        return None, f"Auth service error: {str(e)}"


@app.route('/api/auth/login', methods=['POST'])
def auth_login():
    req = request.get_json(force=True, silent=True) or {}
    email = req.get("email", "").strip()
    password = req.get("password")
    
    if not email or not password:
        return jsonify({"status": "error", "message": "Email and password are required"}), 400
        
    if not db.is_configured():
        if email == "omkar.jagtap@upgrad.com" and password == "upGrad@2026":
            serializer = URLSafeTimedSerializer(app.secret_key)
            user_info = {
                "id": "local-id",
                "email": email,
                "name": "Omkar Jagtap (Dev Mode)",
                "role": "Admin"
            }
            token = serializer.dumps(user_info)
            return jsonify({
                "status": "success",
                "token": token,
                "user": user_info
            })
        return jsonify({"status": "error", "message": "Dev Mode: Invalid credentials"}), 401
        
    data, err = db.login(email, password)
    if err:
        db.log_activity("Unknown", email, "User", "Login Failed", f"Error: {err}")
        return jsonify({"status": "error", "message": err}), 401
        
    user_id = data["user"]["id"]
    profile = db.get_user_profile(email)
    if not profile:
        if email.lower() == "omkar.jagtap@upgrad.com":
            db.upsert_user_profile(user_id, email, "Omkar Jagtap", "Admin")
            profile = db.get_user_profile(email)
        else:
            return jsonify({"status": "error", "message": "User profile not found"}), 403
            
    db.log_activity(profile["name"], email, profile["role"], "Successful logins", "User logged in successfully")
    
    serializer = URLSafeTimedSerializer(app.secret_key)
    user_info = {
        "id": user_id,
        "email": email,
        "name": profile["name"],
        "role": profile["role"]
    }
    custom_token = serializer.dumps(user_info)
    
    return jsonify({
        "status": "success",
        "token": custom_token,
        "user": user_info
    })

@app.route('/api/auth/logout', methods=['POST'])
def auth_logout():
    user, _ = get_current_user()
    if user:
        db.log_activity(user["name"], user["email"], user["role"], "Logout actions", "User logged out")
    return jsonify({"status": "success", "message": "Logged out successfully"})

@app.route('/api/auth/session', methods=['GET'])
def auth_session():
    user, err = get_current_user()
    if err:
        return jsonify({"status": "error", "message": err}), 401
    return jsonify({"status": "success", "user": user})

@app.route('/api/admin/users', methods=['GET'])
def list_users():
    user, err = get_current_user()
    if err or user["role"] not in ("Admin", "Co-Admin"):
        return jsonify({"status": "error", "message": "Unauthorized"}), 403
        
    if not db.is_configured():
        return jsonify({"status": "success", "users": [
            {"id": "local-id", "name": "Local Dev Admin", "email": "omkar.jagtap@upgrad.com", "role": "Admin", "created_at": "2026-05-31T00:00:00Z"}
        ]})
        
    profiles = db.get_user_profiles()
    return jsonify({"status": "success", "users": profiles})

@app.route('/api/admin/users', methods=['POST'])
def create_user():
    user, err = get_current_user()
    if err or user["role"] not in ("Admin", "Co-Admin"):
        return jsonify({"status": "error", "message": "Unauthorized"}), 403
        
    req = request.get_json(force=True, silent=True) or {}
    name = req.get("name", "").strip()
    email = req.get("email", "").strip()
    password = req.get("password")
    role = req.get("role", "User").strip()
    
    if not name or not email or not password or not role:
        return jsonify({"status": "error", "message": "All fields are required"}), 400
        
    if role not in ("Co-Admin", "User"):
        return jsonify({"status": "error", "message": "Role must be Co-Admin or User"}), 400
        
    if not db.is_configured():
        return jsonify({"status": "error", "message": "Supabase not configured"}), 503
        
    existing = db.get_user_profile(email)
    if existing:
        return jsonify({"status": "error", "message": "Email already registered"}), 400
        
    auth_data, err = db.admin_create_user(email, password, name)
    if err:
        return jsonify({"status": "error", "message": f"Auth creation failed: {err}"}), 500
        
    user_id = auth_data["id"]
    db.upsert_user_profile(user_id, email, name, role)
    
    db.log_activity(user["name"], user["email"], user["role"], "User creation", f"Created user {name} ({email}) as {role}")
    return jsonify({"status": "success", "message": f"User {name} created successfully!"})

@app.route('/api/admin/users/<user_id>', methods=['PUT', 'DELETE'])
def manage_user_endpoints(user_id):
    user, err = get_current_user()
    if err or user["role"] not in ("Admin", "Co-Admin"):
        return jsonify({"status": "error", "message": "Unauthorized"}), 403
        
    if not db.is_configured():
        return jsonify({"status": "error", "message": "Supabase not configured"}), 503
        
    profiles = db.get_user_profiles()
    target_profile = None
    for p in profiles:
        if p["id"] == user_id:
            target_profile = p
            break
            
    if not target_profile:
        return jsonify({"status": "error", "message": "User not found"}), 404
        
    if target_profile["role"] == "Admin" and user["role"] != "Admin":
        return jsonify({"status": "error", "message": "Co-Admins cannot modify or delete Admin accounts"}), 403
        
    if request.method == 'PUT':
        req = request.get_json(force=True, silent=True) or {}
        name = req.get("name", "").strip()
        role = req.get("role", "").strip()
        password = req.get("password")
        
        if target_profile["role"] == "Admin" and role != "Admin":
            return jsonify({"status": "error", "message": "Cannot remove Admin permissions"}), 403
            
        if role == "Admin" and user["role"] != "Admin":
            return jsonify({"status": "error", "message": "Cannot assign Admin role"}), 403
            
        db.update_user_profile(user_id, name=name or None, role=role or None)
        db.admin_update_user(user_id, password=password if password else None, name=name or None)
        
        db.log_activity(user["name"], user["email"], user["role"], "User updates", f"Updated user {target_profile['email']}")
        return jsonify({"status": "success", "message": "User updated successfully"})
        
    elif request.method == 'DELETE':
        if target_profile["role"] == "Admin":
            return jsonify({"status": "error", "message": "Admin accounts cannot be deleted"}), 403
            
        success, err = db.admin_delete_user(user_id)
        if not success:
            return jsonify({"status": "error", "message": f"Auth deletion failed: {err}"}), 500
            
        db.delete_user_profile(user_id)
        db.log_activity(user["name"], user["email"], user["role"], "User updates", f"Deleted user {target_profile['email']}")
        return jsonify({"status": "success", "message": "User deleted successfully"})

@app.route('/api/settings', methods=['GET', 'POST'])
def settings_endpoints():
    user, err = get_current_user()
    if err:
        return jsonify({"status": "error", "message": err}), 401
        
    if request.method == 'GET':
        target_email = request.args.get("email", user["email"]).strip()
        
        if target_email.lower() != user["email"].lower() and user["role"] not in ("Admin", "Co-Admin"):
            return jsonify({"status": "error", "message": "Permission denied"}), 403
            
        settings = None
        if db.is_configured():
            settings = db.get_settings(target_email)
            
        if not settings:
            return jsonify({
                "email": target_email,
                "sender_email": "",
                "app_password": "",
                "signature_name": "",
                "signature_title": "",
                "signature_address": STATIC_OFFICE_ADDRESS,
                "signature_phone": "",
                "signature_email": target_email,
                "cc_emails": "",
                "test_mode": False
            })
            
        return jsonify(settings)
        
    elif request.method == 'POST':
        req = request.get_json(force=True, silent=True) or {}
        target_email = req.get("email", user["email"]).strip()
        
        if target_email.lower() != user["email"].lower() and user["role"] not in ("Admin", "Co-Admin"):
            return jsonify({"status": "error", "message": "Permission denied"}), 403
            
        sender_email = req.get("sender_email", "").strip()
        app_password = req.get("app_password", "").strip()
        sig_name = req.get("signature_name", "").strip()
        sig_title = req.get("signature_title", "").strip()
        sig_address = req.get("signature_address", STATIC_OFFICE_ADDRESS).strip()
        sig_phone = req.get("signature_phone", "").strip()
        sig_email = req.get("signature_email", "").strip()
        cc_emails = req.get("cc_emails", "").strip()
        test_mode = False
        
        if db.is_configured():
            db.upsert_settings(
                email=target_email,
                sender_email=sender_email,
                app_password=app_password,
                sig_name=sig_name,
                sig_title=sig_title,
                sig_address=sig_address,
                sig_phone=sig_phone,
                sig_email=sig_email,
                cc_emails=cc_emails,
                test_mode=test_mode
            )
            db.log_activity(user["name"], user["email"], user["role"], "Settings updates", f"Updated SMTP settings for {target_email}")
            
        return jsonify({"status": "success", "message": "Settings saved successfully"})

@app.route('/api/admin/logs', methods=['GET', 'DELETE'])
def manage_logs():
    user, err = get_current_user()
    if err or user["role"] not in ("Admin", "Co-Admin"):
        return jsonify({"status": "error", "message": "Unauthorized"}), 403
        
    if request.method == 'GET':
        if not db.is_configured():
            return jsonify({"status": "success", "logs": []})
        logs = db.get_logs()
        return jsonify({"status": "success", "logs": logs})
        
    elif request.method == 'DELETE':
        if user["role"] != "Admin":
            return jsonify({"status": "error", "message": "Only Admins can clear activity logs"}), 403
            
        if not db.is_configured():
            return jsonify({"status": "success", "message": "Logs cleared"})
            
        req = request.get_json(force=True, silent=True) or {}
        log_ids = req.get("log_ids")
        
        db.delete_logs(log_ids)
        db.log_activity(user["name"], user["email"], user["role"], "Settings updates", "Deleted activity logs")
        return jsonify({"status": "success", "message": "Logs deleted successfully"})

@app.route('/api/admin/dashboard-stats', methods=['GET', 'DELETE'])
def get_dashboard_stats():
    user, err = get_current_user()
    if err or user["role"] not in ("Admin", "Co-Admin"):
        return jsonify({"status": "error", "message": "Unauthorized"}), 403
        
    if request.method == 'DELETE':
        if user["role"] != "Admin":
            return jsonify({"status": "error", "message": "Only Admins can reset dashboard metrics"}), 403
        if db.is_configured():
            db.delete_email_history()
            db.delete_logs()
            db.log_activity(user["name"], user["email"], user["role"], "Settings updates", "Reset dashboard stats and email history")
        return jsonify({"status": "success", "message": "Dashboard metrics reset successfully"})

    if not db.is_configured():
        return jsonify({
            "status": "success",
            "metrics": {
                "total_sent": 0,
                "total_failed": 0,
                "success_rate": 100,
                "total_emails": 0,
                "active_users": 1,
                "active_coadmins": 0,
                "total_users": 1,
                "draft_generations": 0,
                "sync_operations": 0,
                "bulk_sends": 0
            },
            "history": [],
            "spoc_stats": []
        })
        
    email_history = db.get_email_history()
    activity_logs = db.get_logs()
    profiles = db.get_user_profiles()
    
    # Parse query filters
    range_type = request.args.get("range", "today").lower()
    local_offset = datetime.now() - datetime.utcnow()
    
    def parse_to_local(ts_str):
        if not ts_str:
            return None
        ts_str = ts_str.replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(ts_str)
            if dt.tzinfo is not None:
                dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
            return dt + local_offset
        except:
            try:
                dt = datetime.strptime(ts_str[:19], "%Y-%m-%dT%H:%M:%S")
                return dt + local_offset
            except:
                return None

    local_now = datetime.now()
    start_limit = None
    end_limit = None
    
    if range_type == "today":
        start_limit = datetime(local_now.year, local_now.month, local_now.day, 0, 0, 0)
        end_limit = datetime(local_now.year, local_now.month, local_now.day, 23, 59, 59)
    elif range_type == "weekly":
        # Monday to Sunday of the current week
        monday = local_now - timedelta(days=local_now.weekday())
        start_limit = datetime(monday.year, monday.month, monday.day, 0, 0, 0)
        sunday = start_limit + timedelta(days=6)
        end_limit = datetime(sunday.year, sunday.month, sunday.day, 23, 59, 59)
    elif range_type == "custom":
        start_str = request.args.get("start_date")
        end_str = request.args.get("end_date")
        try:
            s_dt = datetime.strptime(start_str, "%Y-%m-%d")
            start_limit = datetime(s_dt.year, s_dt.month, s_dt.day, 0, 0, 0)
        except:
            pass
        try:
            e_dt = datetime.strptime(end_str, "%Y-%m-%d")
            end_limit = datetime(e_dt.year, e_dt.month, e_dt.day, 23, 59, 59)
        except:
            pass

    # Filter Email History
    filtered_emails = []
    for e in email_history:
        ts_local = parse_to_local(e.get("sent_at"))
        if ts_local:
            if start_limit and ts_local < start_limit:
                continue
            if end_limit and ts_local > end_limit:
                continue
        filtered_emails.append(e)

    # Filter Activity Logs
    filtered_logs = []
    for l in activity_logs:
        ts_local = parse_to_local(l.get("timestamp"))
        if ts_local:
            if start_limit and ts_local < start_limit:
                continue
            if end_limit and ts_local > end_limit:
                continue
        filtered_logs.append(l)

    total_sent = sum(1 for e in filtered_emails if e["status"] == "Success")
    total_failed = sum(1 for e in filtered_emails if e["status"] == "Failed")
    total_emails = len(filtered_emails)
    success_rate = round((total_sent / total_emails * 100) if total_emails > 0 else 100, 1)
    
    active_users = sum(1 for p in profiles if p["role"] == "User")
    active_coadmins = sum(1 for p in profiles if p["role"] == "Co-Admin")
    total_users = len(profiles)
    
    draft_generations = sum(1 for l in filtered_logs if l["activity_type"] == "Draft Generations")
    sync_operations = sum(1 for l in filtered_logs if l["activity_type"] == "Sync Operations")
    bulk_sends = sum(1 for l in filtered_logs if l["activity_type"] == "Bulk Sends")
    
    spoc_counts = {}
    for e in filtered_emails:
        spoc = e.get("spoc_email", "Unknown").lower()
        if spoc not in spoc_counts:
            spoc_counts[spoc] = {"sent": 0, "failed": 0}
        if e["status"] == "Success":
            spoc_counts[spoc]["sent"] += 1
        else:
            spoc_counts[spoc]["failed"] += 1
            
    spoc_stats = []
    # Build in-memory profiles lookup dictionary to completely avoid duplicate profile network requests
    profiles_dict = {p["email"].lower(): p for p in profiles if "email" in p}
    
    for spoc_email, counts in spoc_counts.items():
        p = profiles_dict.get(spoc_email.lower())
        spoc_name = p["name"] if p else extract_name_from_email(spoc_email)
        spoc_stats.append({
            "email": spoc_email,
            "name": spoc_name,
            "sent": counts["sent"],
            "failed": counts["failed"]
        })
        
    return jsonify({
        "status": "success",
        "metrics": {
            "total_sent": total_sent,
            "total_failed": total_failed,
            "success_rate": success_rate,
            "total_emails": total_emails,
            "active_users": active_users,
            "active_coadmins": active_coadmins,
            "total_users": total_users,
            "draft_generations": draft_generations,
            "sync_operations": sync_operations,
            "bulk_sends": bulk_sends
        },
        "history": filtered_emails,
        "spoc_stats": spoc_stats
    })

@app.route('/api/config', methods=['GET'])
def get_config():
    try:
        config = load_config()
        client_config = {
            "BASE_SHEET_URL": config.get("BASE_SHEET_URL", DEFAULT_CONFIG["BASE_SHEET_URL"]),
            "TAB_NAME": config.get("TAB_NAME", DEFAULT_CONFIG["TAB_NAME"]),
            "TEST_MODE": config.get("TEST_MODE", DEFAULT_CONFIG["TEST_MODE"]),
            "SIGNATURE_ADDRESS": STATIC_OFFICE_ADDRESS
        }
        return jsonify(client_config)
    except Exception as e:
        print(f"[ERROR] /api/config failed: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/config', methods=['POST'])
def update_config():
    new_data = request.get_json(force=True, silent=True) or {}
    config = load_config()
    
    # Update fields
    for field in ["BASE_SHEET_URL", "TAB_NAME", "TEST_MODE"]:
        if field in new_data:
            config[field] = new_data[field]
            
    save_config(config)
    return jsonify({"status": "success", "message": "Configuration saved!"})

@app.route('/api/get-sheet-dates', methods=['GET'])
def get_sheet_dates():
    """Read cells N4 and O4 from Google Sheets and parse them to YYYY-MM-DD for UI calendar"""
    user, err = get_current_user()
    if err:
        return jsonify({"status": "error", "message": err}), 401
    try:
        config = load_config()
        scope = [
            "https://spreadsheets.google.com/feeds",
            'https://www.googleapis.com/auth/spreadsheets',
            "https://www.googleapis.com/auth/drive.file",
            "https://www.googleapis.com/auth/drive"
        ]
        creds = get_google_credentials(scope)
        if not creds:
            return jsonify({"status": "error", "message": "Google credentials not found"}), 400
            
        client = gspread.authorize(creds)
        
        sheet_url = config["BASE_SHEET_URL"]
        sheet_id = sheet_url.split("/d/")[1].split("/")[0] if "/d/" in sheet_url else sheet_url
        sheet = client.open_by_key(sheet_id).worksheet(config["TAB_NAME"])
        
        o4_val = sheet.acell('O4').value or ""
        p4_val = sheet.acell('P4').value or ""
        
        def parse_to_picker(d_str, default_date=None):
            """Parse various date formats to YYYY-MM-DD"""
            d_str = (d_str or "").strip()
            if not d_str:
                return default_date or datetime.now().strftime("%Y-%m-%d")
            for fmt in ("%d-%b-%Y", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y"):
                try:
                    dt = datetime.strptime(d_str, fmt)
                    return dt.strftime("%Y-%m-%d")
                except:
                    continue
            return default_date or datetime.now().strftime("%Y-%m-%d")
            
        today = datetime.now()
        monday = today - timedelta(days=today.weekday())
        default_start = monday.strftime("%Y-%m-%d")
        default_end = (monday + timedelta(days=6)).strftime("%Y-%m-%d")
            
        start_date_picker = parse_to_picker(o4_val, default_start)
        end_date_picker = parse_to_picker(p4_val, default_end)
        
        return jsonify({
            "status": "success",
            "start_date": start_date_picker,
            "end_date": end_date_picker
        })
    except Exception as e:
        print(f"Error fetching sheet dates: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/fetch-sessions', methods=['POST'])
def fetch_sessions():
    """Fetch and filter sessions from Google Sheets based on date range"""
    user, err = get_current_user()
    if err:
        return jsonify({"status": "error", "message": err}), 401

    req = request.get_json(force=True, silent=True) or {}
    start_date_raw = req.get("start_date")
    end_date_raw = req.get("end_date")
    sig_name = req.get("signature_name", "").strip()
    sig_title = req.get("signature_title", "").strip()
    sig_phone = req.get("signature_phone", "").strip()
    sig_email = req.get("signature_email", "").strip()
    
    def is_valid_date(d_str):
        if not d_str: return False
        try:
            datetime.strptime(str(d_str).strip(), "%Y-%m-%d")
            return True
        except:
            return False
            
    if not is_valid_date(start_date_raw) or not is_valid_date(end_date_raw):
        return jsonify({"status": "error", "message": "Start and End dates must be valid YYYY-MM-DD strings"}), 400
        
    config = load_config()
    start_date = format_date_to_sheet(start_date_raw)
    end_date = format_date_to_sheet(end_date_raw)
    
    try:
        scope = [
            "https://spreadsheets.google.com/feeds",
            'https://www.googleapis.com/auth/spreadsheets',
            "https://www.googleapis.com/auth/drive.file",
            "https://www.googleapis.com/auth/drive"
        ]
        
        creds = get_google_credentials(scope)
        if not creds:
            return jsonify({"status": "error", "message": "Google credentials not found"}), 400
            
        client = gspread.authorize(creds)
        
        sheet_url = config["BASE_SHEET_URL"]
        sheet_id = sheet_url.split("/d/")[1].split("/")[0] if "/d/" in sheet_url else sheet_url
        sheet = client.open_by_key(sheet_id).worksheet(config["TAB_NAME"])
        
        print(f"Updating Sheet cells: O4 = {start_date}, P4 = {end_date}")
        # Use single batch update instead of 2 sequential update calls to save Sheets API requests
        sheet.batch_update([
            {'range': 'O4', 'values': [[start_date]]},
            {'range': 'P4', 'values': [[end_date]]}
        ])
        
        print("Waiting for Google Sheet recalculation...")
        time.sleep(1) # Reduced recalculation sleep time to 1 second
        
        all_rows = sheet.get_all_values()
        
        valid_records = []
        if all_rows and len(all_rows) > 1:
            headers = [str(h).strip() for h in all_rows[0]]
            headers_limit = headers[:10]
            
            for row in all_rows[1:]:
                row_dict = {}
                for idx, h in enumerate(headers_limit):
                    if idx < len(row):
                        row_dict[h] = str(row[idx]).strip()
                    else:
                        row_dict[h] = ""
                
                if row_dict.get("Date", "") != "" or row_dict.get("Grader Email", "") != "":
                    valid_records.append(row_dict)
                
        graders = group_sessions_by_grader(valid_records)
        
        # Fetch successful email history once in a single query to prevent duplicate queries inside the loop
        successful_sends = db.get_email_history() if db.is_configured() else []
        sent_set = set()
        for e in successful_sends:
            if e.get("status") == "Success" and e.get("recipient_email") and e.get("subject"):
                sent_set.add((e["recipient_email"].lower(), e["subject"]))
                
        grader_emails = {}
        for key, info in graders.items():
            spoc_email = info["spoc_email"].lower()
            
            # Role based filtering: normal User can only see/send drafts where they are SPOC
            if user["role"] == "User" and spoc_email != user["email"].lower():
                continue
                
            # Check if SPOC has SMTP credentials saved
            spoc_settings = None
            if db.is_configured():
                spoc_settings = db.get_settings(spoc_email)
                
            has_credentials = False
            if spoc_settings and spoc_settings.get("sender_email") and spoc_settings.get("app_password"):
                has_credentials = True
                
            # Determine signature details to use for body generation
            if spoc_email.strip().lower() == user["email"].strip().lower():
                # Current user is the SPOC
                s_name = (spoc_settings.get("signature_name") if spoc_settings else None) or sig_name or info["spoc_name"]
                s_title = (spoc_settings.get("signature_title") if spoc_settings else None) or sig_title or "Associate Program Manager"
                s_phone = (spoc_settings.get("signature_phone") if spoc_settings else None) or sig_phone or ""
                s_email = (spoc_settings.get("signature_email") if spoc_settings else None) or sig_email or spoc_email
            else:
                # Different SPOC: do not fallback to current user's session signature
                s_name = (spoc_settings.get("signature_name") if spoc_settings else None) or info["spoc_name"] or extract_name_from_email(spoc_email)
                s_title = (spoc_settings.get("signature_title") if spoc_settings else None) or "Associate Program Manager"
                s_phone = (spoc_settings.get("signature_phone") if spoc_settings else None) or ""
                s_email = (spoc_settings.get("signature_email") if spoc_settings else None) or spoc_email

            # Format multiple dates in subject line
            dates = []
            for s in info['sessions']:
                d = s.get('date')
                if d and d not in dates:
                    dates.append(d)
            
            if len(dates) == 1:
                date_str = dates[0]
            elif len(dates) == 2:
                date_str = f"{dates[0]} & {dates[1]}"
            elif len(dates) > 2:
                date_str = ", ".join(dates[:-1]) + f" & {dates[-1]}"
            else:
                date_str = ""

            if len(info['sessions']) > 1:
                subject = f"Reminder: Live Sessions with {info['name']}"
            else:
                first_s = info['sessions'][0]
                cohort = first_s.get('cohort', 'Live Session')
                topic = first_s.get('topic', 'Upcoming Session')
                subject = f"Reminder: {cohort} | {topic}"
            if date_str:
                subject += f" | {date_str}"
                
            body_html = generate_email_body(info['name'], info['sessions'], s_name, s_title, s_phone, s_email)
            spoc_name_val = info.get('spoc_name', extract_name_from_email(spoc_email))
            spoc_display = spoc_name_val
            
            # Check if this email has already been sent successfully (Lookup in sent_set in memory instead of db API calls)
            already_sent = (info['email'].lower(), subject) in sent_set
            
            grader_emails[key] = {
                "name": info['name'],
                "email": info['email'],
                "subject": subject,
                "body_html": body_html,
                "sessions": info['sessions'],
                "spocs": [spoc_name_val],
                "spoc_emails": [spoc_email],
                "spoc_display": spoc_display,
                "spoc_email_display": spoc_email,
                "has_credentials": has_credentials,
                "status": "Sent" if already_sent else "Draft"
            }
            
            # Log draft generation to history
            if db.is_configured():
                db.log_drafts_generated(
                    spoc_email=spoc_email,
                    grader_name=info['name'],
                    grader_email=info['email'],
                    session_count=len(info['sessions']),
                    subject=subject
                )
                
        # Log active sync activity
        if db.is_configured():
            db.log_activity(
                user["name"], 
                user["email"], 
                user["role"], 
                "Sync operations", 
                f"Fetched {len(valid_records)} sessions for date range: {start_date_raw} to {end_date_raw}"
            )
            db.log_activity(
                user["name"], 
                user["email"], 
                user["role"], 
                "Draft Generations", 
                f"Generated drafts for {len(grader_emails)} unique graders"
            )

        return jsonify({
            "status": "success",
            "total_sessions": len(valid_records),
            "graders": grader_emails,
            "raw_data": valid_records
        })
        
    except Exception as e:
        print(f"Error fetching from Google sheet: {e}")
        return jsonify({"status": "error", "message": f"Google Sheet Error: {str(e)}"}), 500

@app.route('/api/verify-email', methods=['POST'])
def verify_email():
    """Send a test email to the sender to verify SMTP credentials."""
    user, err = get_current_user()
    if err:
        return jsonify({"status": "error", "message": err}), 401

    req = request.get_json(force=True, silent=True) or {}
    sender_email = req.get("sender_email", "").strip()
    sender_password = req.get("sender_password", "").strip()
    sender_name = req.get("sender_name", "Team").strip()

    if not sender_email or not sender_password:
        return jsonify({"status": "error", "message": "Sender email and password are required."}), 400

    subject = "✅ upGrad Automation — Email Verified"
    body_html = f"""
    <html><body style="font-family:Arial,sans-serif;font-size:14px;color:#000;">
        <p>Hi {sender_name},</p>
        <p>Your email credentials have been <strong>verified successfully</strong>.</p>
        <p>You are now authorized to use the <strong>upGrad Live Session Reminder</strong> automation.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">
        <p style="font-size:12px;color:#666;">This is an automated verification email. No action needed.</p>
    </body></html>
    """

    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = formataddr((sender_name, sender_email))
        msg['To'] = sender_email
        msg.attach(MIMEText(body_html, 'html'))

        # timeout=15 prevents Render proxy from killing the request with HTML 502/504
        server = smtplib.SMTP('smtp.office365.com', 587, timeout=15)
        server.starttls()
        server.login(sender_email, sender_password)
        server.sendmail(sender_email, [sender_email], msg.as_string())
        server.quit()
        return jsonify({"status": "success", "message": "Verification email sent successfully!"})
    except smtplib.SMTPAuthenticationError:
        return jsonify({"status": "error", "message": "SMTP Error: Authentication failed. Check your email and App Password."}), 401
    except (TimeoutError, ConnectionRefusedError, OSError) as e:
        return jsonify({"status": "error", "message": f"SMTP connection failed (port blocked or timeout): {str(e)}"}), 503
    except Exception as e:
        print(f"Verify SMTP Error: {e}")
        return jsonify({"status": "error", "message": f"SMTP Error: {str(e)}"}), 500

@app.route('/api/send-email', methods=['POST'])
def send_single_email():
    """
    Send a single email.
    SECURITY RULE: Credentials are ALWAYS loaded from the SPOC's saved Supabase settings.
    The frontend must never pass sender credentials — only spoc_email matters.
    """
    user, err = get_current_user()
    if err:
        return jsonify({"status": "error", "message": err}), 401

    req = request.get_json(force=True, silent=True) or {}
    to_email = req.get("to", "").strip()
    subject = req.get("subject", "").strip()
    body_html = req.get("body_html", "")
    spoc_email_input = req.get("spoc_email", "").strip().lower()

    if not to_email or not subject or not body_html:
        return jsonify({"status": "error", "message": "To, Subject, and Email body are required"}), 400

    # Determine which SPOC's credentials to use
    spoc_email = spoc_email_input or user["email"].lower()

    # Security: User-role accounts can only send emails where THEY are the SPOC
    if user["role"] == "User" and spoc_email != user["email"].lower():
        return jsonify({"status": "error", "message": "Permission denied: You can only send emails as your own SPOC account."}), 403

    # Load credentials STRICTLY from Supabase — never from the request body
    spoc_settings = None
    if db.is_configured():
        spoc_settings = db.get_settings(spoc_email)

    # Hard block: if SPOC has no saved credentials, we cannot send
    if not spoc_settings or not spoc_settings.get("sender_email") or not spoc_settings.get("app_password"):
        profile = db.get_user_profile(spoc_email) if db.is_configured() else None
        spoc_name_display = profile["name"] if profile else spoc_email
        return jsonify({
            "status": "error",
            "message": f"Cannot send: SMTP credentials are not configured for {spoc_name_display} ({spoc_email}). Please configure them in the Admin Panel → SPOC SMTP."
        }), 400

    # Credentials come ONLY from Supabase settings
    sender_email = spoc_settings["sender_email"]
    sender_password = spoc_settings["app_password"]
    sender_name = spoc_settings.get("signature_name") or extract_name_from_email(spoc_email)

    # CC emails come from SPOC's own settings, not from the request
    cc_list = []
    cc_str = spoc_settings.get("cc_emails", "")
    if cc_str:
        cc_list = [e.strip() for e in cc_str.split(",") if e.strip()]

    original_to = to_email

    msg = MIMEMultipart('alternative')
    msg['From'] = formataddr((sender_name, sender_email))
    msg['Subject'] = subject
    msg['To'] = to_email
    if cc_list:
        msg['Cc'] = ", ".join(cc_list)
    all_recipients = [to_email] + cc_list

    msg.attach(MIMEText(body_html, 'html'))

    try:
        server = smtplib.SMTP('smtp.office365.com', 587, timeout=15)
        server.starttls()
        server.login(sender_email, sender_password)
        server.sendmail(sender_email, all_recipients, msg.as_string())
        server.quit()

        if db.is_configured():
            db.log_email_sent(sender_email, original_to, subject, spoc_email, "Success", f"Sent to {original_to}")
            db.log_activity(user["name"], user["email"], user["role"], "Email sending actions", f"Sent email to {original_to} via {sender_email}")

        return jsonify({"status": "success", "message": f"Email sent to {to_email} from {sender_email}"})

    except smtplib.SMTPAuthenticationError:
        err_msg = f"SMTP Authentication failed for {sender_email}. Check the App Password in Admin Panel."
        if db.is_configured():
            db.log_email_sent(sender_email, original_to, subject, spoc_email, "Failed", err_msg)
        return jsonify({"status": "error", "message": err_msg}), 401
    except Exception as e:
        err_msg = str(e)
        if db.is_configured():
            db.log_email_sent(sender_email, original_to, subject, spoc_email, "Failed", err_msg)
        return jsonify({"status": "error", "message": f"SMTP Error: {err_msg}"}), 500

# Global error handlers — always return JSON so the frontend never receives HTML
@app.errorhandler(404)
def not_found(e):
    return jsonify({"status": "error", "message": "Not found", "code": 404}), 404

@app.errorhandler(500)
def server_error(e):
    return jsonify({"status": "error", "message": str(e), "code": 500}), 500

if __name__ == '__main__':
    print("="*60)
    print("  upGrad Live Session Reminder - Server Starting")
    print("="*60)
    provision_default_admin()
    load_config()
    print("\n[OK] Configuration loaded")
    port = int(os.environ.get("PORT", 5000))
    host = "0.0.0.0" if os.environ.get("PORT") else "127.0.0.1"
    print(f"[OK] Server running at: http://{host}:{port}")
    print("[OK] Press Ctrl+C to stop\n")
    app.run(host=host, port=port, debug=True)
