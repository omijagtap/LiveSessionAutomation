"""
upGrad Live Session Reminder - Flask Backend Server
Handles Google Sheets integration, email sending, and configuration management
"""

import os
import json
import time
import smtplib
import urllib.parse
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import gspread
from oauth2client.service_account import ServiceAccountCredentials

# Initialize Flask App
app = Flask(__name__, static_folder="web/static", template_folder="web/templates")
CORS(app)

# Configuration
CONFIG_FILE = "config.json"
WORKSPACE_DIR = os.path.dirname(os.path.abspath(__file__))

# Default configuration from live_session_reminder.py
DEFAULT_CONFIG = {
    "BASE_SHEET_URL": "https://docs.google.com/spreadsheets/d/1cjigiLzsA8m9fDKMFhqcdmn4GYOFoicCnDsAadjiRDc",
    "TAB_NAME": "Live Session Reminder",
    "TEST_MODE": True
}

STATIC_OFFICE_ADDRESS = "3rd Floor, CTS-796-A | Fleet Bldg. Opp, Marol Fire Station, Marol, Andheri (East)| Mumbai MH 400059"

def load_config():
    """Load configuration from config.json"""
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error reading config.json: {e}")
    
    # Return default configuration
    config = DEFAULT_CONFIG.copy()
    save_config(config)
    return config

def save_config(config):
    """Save configuration to config.json."""
    try:
        with open(CONFIG_FILE, "w") as f:
            json.dump(config, f, indent=4)
        return True
    except Exception as e:
        print(f"Error saving config.json: {e}")
        return False

def find_credentials_file():
    """Auto-detect the Google Service Account credentials JSON file"""
    for f in os.listdir(WORKSPACE_DIR):
        if f.endswith(".json") and f != "config.json":
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

def group_sessions_by_grader(data):
    """
    Group all session rows by recipient email (case-insensitive).
    Multiple rows with the same email are merged into ONE draft.
    """
    graders = {}
    for row in data:
        name = str(row.get("Grader", "Professor")).strip()
        email = str(row.get("Grader Email", "")).strip()
        if not email or "@" not in email:
            continue

        # Extract SPOC Name and SPOC Email dynamically
        spoc_name = "N/A"
        spoc_email = ""
        for k, v in row.items():
            k_lower = k.lower()
            if "spoc email" in k_lower or "spoc mail" in k_lower or "spoc_email" in k_lower:
                spoc_email = str(v).strip()
            elif "spoc name" in k_lower or k_lower == "spoc":
                spoc_name = str(v).strip()

        key = email.lower()
        if key not in graders:
            graders[key] = {
                "name": name,
                "email": email,
                "sessions": []
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
    return send_from_directory("web/templates", "index.html")

@app.route('/css/<path:path>')
def serve_css(path):
    return send_from_directory("web/static/css", path)

@app.route('/js/<path:path>')
def serve_js(path):
    return send_from_directory("web/static/js", path)

@app.route('/api/config', methods=['GET'])
def get_config():
    config = load_config()
    client_config = {
        "BASE_SHEET_URL": config.get("BASE_SHEET_URL", DEFAULT_CONFIG["BASE_SHEET_URL"]),
        "TAB_NAME": config.get("TAB_NAME", DEFAULT_CONFIG["TAB_NAME"]),
        "TEST_MODE": config.get("TEST_MODE", DEFAULT_CONFIG["TEST_MODE"]),
        "SIGNATURE_ADDRESS": STATIC_OFFICE_ADDRESS
    }
    return jsonify(client_config)

@app.route('/api/config', methods=['POST'])
def update_config():
    new_data = request.json
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
        
        def parse_to_picker(d_str):
            """Parse various date formats to YYYY-MM-DD"""
            d_str = d_str.strip()
            for fmt in ("%d-%b-%Y", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y"):
                try:
                    dt = datetime.strptime(d_str, fmt)
                    return dt.strftime("%Y-%m-%d")
                except:
                    continue
            return d_str
            
        start_date_picker = parse_to_picker(o4_val)
        end_date_picker = parse_to_picker(p4_val)
        
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
    req = request.json
    start_date_raw = req.get("start_date")
    end_date_raw = req.get("end_date")
    sig_name = req.get("signature_name", "").strip()
    sig_title = req.get("signature_title", "").strip()
    sig_phone = req.get("signature_phone", "").strip()
    sig_email = req.get("signature_email", "").strip()
    
    if not start_date_raw or not end_date_raw:
        return jsonify({"status": "error", "message": "Start and End dates are required"}), 400
        
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
        sheet.update_acell('O4', start_date)
        sheet.update_acell('P4', end_date)
        
        print("Waiting for Google Sheet recalculation...")
        time.sleep(3)
        
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
        
        grader_emails = {}
        for key, info in graders.items():
            first_s = info['sessions'][0]
            cohort = first_s.get('cohort', 'Live Session')
            topic = first_s.get('topic', 'Upcoming Session')
            date = first_s.get('date', '')
            
            subject = f"Reminder: {cohort} | {topic} | {date}"
            if len(info['sessions']) > 1:
                subject += " & More"
                
            body_html = generate_email_body(info['name'], info['sessions'], sig_name, sig_title, sig_phone, sig_email)
            spocs = list(set([s['spoc'] for s in info['sessions'] if s.get('spoc') and s.get('spoc') != "N/A"]))
            spoc_emails = list(set([s['spoc_email'] for s in info['sessions'] if s.get('spoc_email')]))
            spoc_display = ", ".join(spocs) if spocs else "N/A"
            spoc_email_display = ", ".join(spoc_emails) if spoc_emails else ""
            
            grader_emails[key] = {
                "name": info['name'],
                "email": info['email'],
                "subject": subject,
                "body_html": body_html,
                "sessions": info['sessions'],
                "spocs": spocs,
                "spoc_emails": spoc_emails,
                "spoc_display": spoc_display,
                "spoc_email_display": spoc_email_display
            }
            
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
    req = request.json
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

        server = smtplib.SMTP('smtp.office365.com', 587)
        server.starttls()
        server.login(sender_email, sender_password)
        server.sendmail(sender_email, [sender_email], msg.as_string())
        server.quit()
        return jsonify({"status": "success", "message": "Verification email sent successfully!"})
    except Exception as e:
        print(f"Verify SMTP Error: {e}")
        return jsonify({"status": "error", "message": f"SMTP Error: {str(e)}"}), 500

@app.route('/api/send-email', methods=['POST'])
def send_single_email():
    """Send a single email with optional CC recipients"""
    req = request.json
    to_email = req.get("to")
    cc_list_override = req.get("cc")
    subject = req.get("subject")
    body_html = req.get("body_html")
    
    if not to_email or not subject or not body_html:
        return jsonify({"status": "error", "message": "To, Subject, and Email body are required"}), 400
        
    config = load_config()
    sender_email = req.get("sender_email") or config.get("SENDER_EMAIL")
    sender_password = req.get("sender_password") or config.get("SENDER_PASSWORD")
    sender_name = req.get("sender_name") or config.get("SIGNATURE_NAME") or "Team"
    
    if not sender_email or not sender_password:
        return jsonify({"status": "error", "message": "Email credentials not configured or session expired"}), 400
        
    original_to = to_email
    test_mode = config.get("TEST_MODE", True)
    spoc_email = req.get("spoc_email")
    cc_list = []
        
    msg = MIMEMultipart('alternative')
    msg['From'] = formataddr((sender_name, sender_email))
    
    if test_mode:
        # Send to the requested email (Column I) instead of overriding to sender_email, fallback to sender_email
        to_email = spoc_email if spoc_email and "@" in spoc_email else (to_email if to_email else sender_email)
        
        # Include CC in test mode if configured
        if cc_list_override is not None:
            if isinstance(cc_list_override, str):
                cc_list = [e.strip() for e in cc_list_override.split(",") if e.strip()]
            elif isinstance(cc_list_override, list):
                cc_list = [e.strip() for e in cc_list_override if e and e.strip()]
        else:
            cc_list = list(config.get("CC_EMAILS", []))
            
        msg['Subject'] = subject
        msg['To'] = to_email
        cc_list = [email.strip() for email in cc_list if email and email.strip()]
        if cc_list:
            msg['Cc'] = ", ".join(cc_list)
        all_recipients = [to_email] + cc_list
    else:
        if cc_list_override is not None:
            if isinstance(cc_list_override, str):
                cc_list = [e.strip() for e in cc_list_override.split(",") if e.strip()]
            elif isinstance(cc_list_override, list):
                cc_list = [e.strip() for e in cc_list_override if e and e.strip()]
        else:
            cc_list = list(config.get("CC_EMAILS", []))
            
        msg['Subject'] = subject
        msg['To'] = to_email
        cc_list = [email.strip() for email in cc_list if email and email.strip()]
        if cc_list:
            msg['Cc'] = ", ".join(cc_list)
        all_recipients = [to_email] + cc_list
        
    msg.attach(MIMEText(body_html, 'html'))
    
    try:
        server = smtplib.SMTP('smtp.office365.com', 587)
        server.starttls()
        server.login(sender_email, sender_password)
        server.sendmail(sender_email, all_recipients, msg.as_string())
        server.quit()
        if test_mode:
            return jsonify({"status": "success", "message": f"Email sent successfully to {original_to} (Redirected to {to_email})" })
        else:
            return jsonify({"status": "success", "message": f"Email sent successfully to {to_email}" })
    except Exception as e:
        print(f"SMTP Error: {e}")
        return jsonify({"status": "error", "message": f"SMTP Error: {str(e)}"}), 500

if __name__ == '__main__':
    print("="*60)
    print("  upGrad Live Session Reminder - Server Starting")
    print("="*60)
    load_config()
    print("\n[OK] Configuration loaded")
    port = int(os.environ.get("PORT", 5000))
    host = "0.0.0.0" if os.environ.get("PORT") else "127.0.0.1"
    print(f"[OK] Server running at: http://{host}:{port}")
    print("[OK] Press Ctrl+C to stop\n")
    app.run(host=host, port=port, debug=True)
