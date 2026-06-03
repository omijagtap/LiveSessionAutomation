/**
 * upGrad Live Session Reminder - Frontend Application
 * Handles UI interactions, API calls, and email management
 */

// Application State
let gradersData = {};
let allSmeEmails = [];
let smeEmails = [];
let oboIndex = 0;
let currentTab = 'tab-preview';
let reportData = [];
let configData = {};
let smeStatuses = {};
let currentUser = null;
let allLogs = [];
let currentLogsPage = 1;
const logsPerPage = 15;
let dashboardHistory = [];

// Session-only App Password (never persisted)
let sessionAppPassword = "";
let pendingActionCallback = null;

// Cookie Keys
const LS_SENDER_EMAIL = "upgrad_sender_email";
const LS_CC_EMAILS = "upgrad_cc_emails";
const LS_ONBOARDED = "upgrad_onboarded";
const LS_VERIFIED = "upgrad_verified";
const LS_REPORT = "upgrad_report";
const LS_SME_STATUSES = "upgrad_sme_statuses";
const LS_APP_PASSWORD = "upgrad_app_password";
const LS_SIG_NAME = "upgrad_sig_name";
const LS_SIG_TITLE = "upgrad_sig_title";
const LS_SIG_PHONE = "upgrad_sig_phone";
const LS_SIG_EMAIL = "upgrad_sig_email";

// Cookie Helpers
function setCookie(name, value, days = 365) {
    const d = new Date();
    d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
    const expires = "expires=" + d.toUTCString();
    document.cookie = name + "=" + encodeURIComponent(value) + ";" + expires + ";path=/;SameSite=Lax";
}

function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return decodeURIComponent(c.substring(nameEQ.length, c.length));
    }
    return null;
}

// Storage Helpers (Cookie first with LocalStorage fallback)
const getStoredSenderEmail = () => getCookie(LS_SENDER_EMAIL) || localStorage.getItem(LS_SENDER_EMAIL) || "";
const getStoredCcEmails = () => getCookie(LS_CC_EMAILS) || localStorage.getItem(LS_CC_EMAILS) || "";
const getStoredAppPassword = () => getCookie(LS_APP_PASSWORD) || localStorage.getItem(LS_APP_PASSWORD) || "";
const getStoredSigName = () => getCookie(LS_SIG_NAME) || localStorage.getItem(LS_SIG_NAME) || "";
const getStoredSigTitle = () => getCookie(LS_SIG_TITLE) || localStorage.getItem(LS_SIG_TITLE) || "";
const getStoredSigPhone = () => getCookie(LS_SIG_PHONE) || localStorage.getItem(LS_SIG_PHONE) || "";
const getStoredSigEmail = () => getCookie(LS_SIG_EMAIL) || localStorage.getItem(LS_SIG_EMAIL) || "";
const isOnboarded = () => getCookie(LS_ONBOARDED) === "yes" || localStorage.getItem(LS_ONBOARDED) === "yes";
const markOnboarded = () => {
    setCookie(LS_ONBOARDED, "yes");
    localStorage.setItem(LS_ONBOARDED, "yes");
};
const isVerified = () => getCookie(LS_VERIFIED) === "yes" || localStorage.getItem(LS_VERIFIED) === "yes";
const markVerified = () => {
    setCookie(LS_VERIFIED, "yes");
    localStorage.setItem(LS_VERIFIED, "yes");
};

// Calendar State
let currentStartCalDate = new Date();
let currentEndCalDate = new Date();
let selectedStartDate = null;
let selectedEndDate = null;

// Format Date YYYY-MM-DD
function formatDateString(date) {
    if (!date || isNaN(date.getTime())) return "";
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

// Format Date for Display (e.g. 24 May 2026)
function formatDateDisplay(date) {
    if (!date || isNaN(date.getTime())) return "Select Date";
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

// Parse YYYY-MM-DD safely
function parseDateISO(str) {
    if (!str || typeof str !== "string") return null;
    const parts = str.split("-");
    if (parts.length !== 3) return null;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
    const date = new Date(y, m, d);
    return isNaN(date.getTime()) ? null : date;
}

function getMondayBasedDay(date) {
    const day = date.getDay(); // 0 is Sunday, 1 is Monday, ..., 6 is Saturday
    return day === 0 ? 6 : day - 1;
}

function isSameDate(d1, d2) {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
}

// Render dynamic custom calendar popup
function renderPopupCalendar(type) {
    const isStart = (type === 'start');
    const daysGrid = document.getElementById(isStart ? "start-cal-days" : "end-cal-days");
    const monthLabel = document.getElementById(isStart ? "start-month-name" : "end-month-name");
    if (!daysGrid || !monthLabel) return;

    daysGrid.innerHTML = "";

    const targetDate = isStart ? currentStartCalDate : currentEndCalDate;
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth();

    const monthNameStrings = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    monthLabel.innerText = `${monthNameStrings[month]} ${year}`;

    // Monday-based calendar index
    const firstDayIndex = getMondayBasedDay(new Date(year, month, 1));
    const totalDays = new Date(year, month + 1, 0).getDate();

    // Previous month info
    const prevYear = month === 0 ? year - 1 : year;
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevTotalDays = new Date(prevYear, prevMonth + 1, 0).getDate();

    // Next month info
    const nextYear = month === 11 ? year + 1 : year;
    const nextMonth = month === 11 ? 0 : month + 1;

    // Total slots to render (42 cells to cover a consistent grid height)
    const totalSlots = 42;

    // 1. Leading faded days from previous month
    for (let i = firstDayIndex - 1; i >= 0; i--) {
        const dayNum = prevTotalDays - i;
        const cellDate = new Date(prevYear, prevMonth, dayNum);
        const cell = createDateCell(dayNum, cellDate, true, type);
        daysGrid.appendChild(cell);
    }

    // 2. Current month days
    for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
        const cellDate = new Date(year, month, dayNum);
        const cell = createDateCell(dayNum, cellDate, false, type);
        daysGrid.appendChild(cell);
    }

    // 3. Trailing faded days from next month
    const renderedSoFar = firstDayIndex + totalDays;
    const trailingCount = totalSlots - renderedSoFar;
    for (let dayNum = 1; dayNum <= trailingCount; dayNum++) {
        const cellDate = new Date(nextYear, nextMonth, dayNum);
        const cell = createDateCell(dayNum, cellDate, true, type);
        daysGrid.appendChild(cell);
    }
}

function createDateCell(dayNum, date, isFaded, type) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "date";
    button.innerText = dayNum;

    if (isFaded) {
        button.classList.add("faded");
    }

    // Check if this date is currently selected
    const selectedDate = (type === 'start') ? selectedStartDate : selectedEndDate;
    if (selectedDate && isSameDate(date, selectedDate)) {
        button.classList.add("current-day");
    }

    button.addEventListener("click", (e) => {
        e.stopPropagation();
        selectDate(type, date);
    });

    return button;
}

function selectDate(type, date) {
    if (type === 'start') {
        selectedStartDate = date;
        document.getElementById("start_date").value = formatDateString(date);
        document.getElementById("start-date-text").innerText = formatDateDisplay(date);
        
        // If end date is set and before start date, adjust it
        if (selectedEndDate && selectedEndDate < selectedStartDate) {
            selectedEndDate = null;
            document.getElementById("end_date").value = "";
            document.getElementById("end-date-text").innerText = "Select Date";
        }
        closeDatepicker('start');
    } else {
        selectedEndDate = date;
        document.getElementById("end_date").value = formatDateString(date);
        document.getElementById("end-date-text").innerText = formatDateDisplay(date);
        
        // If start date is set and after end date, adjust it
        if (selectedStartDate && selectedStartDate > selectedEndDate) {
            selectedStartDate = null;
            document.getElementById("start_date").value = "";
            document.getElementById("start-date-text").innerText = "Select Date";
        }
        closeDatepicker('end');
    }
}

function changeMonth(type, delta) {
    if (type === 'start') {
        currentStartCalDate.setMonth(currentStartCalDate.getMonth() + delta);
    } else {
        currentEndCalDate.setMonth(currentEndCalDate.getMonth() + delta);
    }
    renderPopupCalendar(type);
}

function selectQuickDate(type, selection) {
    const date = new Date();
    if (selection === 'tomorrow') {
        date.setDate(date.getDate() + 1);
    } else if (selection === 'in2days') {
        date.setDate(date.getDate() + 2);
    }
    selectDate(type, date);
}

function toggleDatepicker(type, event) {
    if (event) event.stopPropagation();
    
    const targetId = (type === 'start') ? "start-datepicker" : "end-datepicker";
    const otherId = (type === 'start') ? "end-datepicker" : "start-datepicker";
    
    // Hide other popup
    const otherEl = document.getElementById(otherId);
    if (otherEl) otherEl.classList.add("hidden");
    
    // Toggle current popup
    const targetEl = document.getElementById(targetId);
    if (targetEl) {
        const isHidden = targetEl.classList.contains("hidden");
        if (isHidden) {
            targetEl.classList.remove("hidden");
            // Set current calendar month view to match selected date if set
            const selectedDate = (type === 'start') ? selectedStartDate : selectedEndDate;
            if (selectedDate) {
                if (type === 'start') {
                    currentStartCalDate = new Date(selectedDate);
                } else {
                    currentEndCalDate = new Date(selectedDate);
                }
            } else {
                if (type === 'start') {
                    currentStartCalDate = new Date();
                } else {
                    currentEndCalDate = new Date();
                }
            }
            renderPopupCalendar(type);
        } else {
            targetEl.classList.add("hidden");
        }
    }
}

// Global click-out handler
document.addEventListener("click", (event) => {
    const startBtn = document.getElementById("start-date-btn");
    const endBtn = document.getElementById("end-date-btn");
    const startPopup = document.getElementById("start-datepicker");
    const endPopup = document.getElementById("end-datepicker");

    if (startPopup && !startPopup.classList.contains("hidden")) {
        if (!startPopup.contains(event.target) && startBtn && !startBtn.contains(event.target)) {
            startPopup.classList.add("hidden");
        }
    }
    
    if (endPopup && !endPopup.classList.contains("hidden")) {
        if (!endPopup.contains(event.target) && endBtn && !endBtn.contains(event.target)) {
            endPopup.classList.add("hidden");
        }
    }
});

function closeDatepicker(type) {
    const targetId = (type === 'start') ? "start-datepicker" : "end-datepicker";
    const targetEl = document.getElementById(targetId);
    if (targetEl) {
        targetEl.classList.add("hidden");
    }
}

// Fetch dates from sheet
async function fetchSheetDates() {
    try {
        const response = await fetchWithAuth("/api/get-sheet-dates");
        const data = await response.json();
        if (data.status === "success") {
            const parsedStart = parseDateISO(data.start_date);
            if (parsedStart) {
                selectedStartDate = parsedStart;
                document.getElementById("start_date").value = data.start_date;
                document.getElementById("start-date-text").innerText = formatDateDisplay(selectedStartDate);
                currentStartCalDate = new Date(selectedStartDate);
            } else {
                selectedStartDate = null;
                document.getElementById("start_date").value = "";
                document.getElementById("start-date-text").innerText = "Select Date";
                currentStartCalDate = new Date();
            }
            const parsedEnd = parseDateISO(data.end_date);
            if (parsedEnd) {
                selectedEndDate = parsedEnd;
                document.getElementById("end_date").value = data.end_date;
                document.getElementById("end-date-text").innerText = formatDateDisplay(selectedEndDate);
                currentEndCalDate = new Date(selectedEndDate);
            } else {
                selectedEndDate = null;
                document.getElementById("end_date").value = "";
                document.getElementById("end-date-text").innerText = "Select Date";
                currentEndCalDate = new Date();
            }
            const startVal = data.start_date || 'None';
            const endVal = data.end_date || 'None';
            logToTerminal(`Loaded dates: ${startVal} to ${endVal}`, "info");
        }
    } catch (err) {
        logToTerminal(`Could not fetch dates: ${err.message}`, "warning");
    }
}

// Terminal logging
function logToTerminal(message, type = "info") {
    const term = document.getElementById("terminal-log");
    if (!term) return;
    
    const timeStr = new Date().toLocaleTimeString();
    const styles = {
        info: { color: "text-white/60", prefix: ">" },
        success: { color: "text-[#4ade80]", prefix: "[SUCCESS]" },
        error: { color: "text-[#f87171]", prefix: "[ERROR]" },
        warning: { color: "text-[#f59e0b]", prefix: "[WARN]" }
    };
    
    const style = styles[type] || styles.info;
    const newLog = document.createElement("p");
    newLog.className = `${style.color} leading-relaxed`;
    newLog.innerHTML = `<span class="text-white/20 select-none">[${timeStr}]</span> <span class="font-bold">${style.prefix}</span> ${message}`;
    term.appendChild(newLog);
    term.scrollTop = term.scrollHeight;
}

function clearTerminal() {
    const term = document.getElementById("terminal-log");
    if (term) term.innerHTML = "";
}

// Report persistence (disabled for temporary in-memory reports)
function saveReport() {
    // Disabled
}

function loadReport() {
    reportData = [];
}

// Onboarding banner
function checkOnboardingNotice() {
    const notice = document.getElementById("onboarding-notice");
    if (!notice) return;
    
    if (!isOnboarded() || !getStoredSenderEmail() || !getStoredSigName()) {
        notice.classList.remove("hidden");
        notice.classList.add("flex");
    } else {
        notice.classList.add("hidden");
        notice.classList.remove("flex");
    }
    updateSyncButtonState();
}

// Sync button state management
function updateSyncButtonState() {
    const btn = document.getElementById("fetch-btn");
    const lockIcon = document.getElementById("fetch-btn-lock-icon");
    const btnText = document.getElementById("fetch-btn-text");
    if (!btn) return;
    
    // Always enabled, prompt user if password is not set
    btn.disabled = false;
    if (sessionAppPassword) {
        if (lockIcon) lockIcon.classList.add("hidden");
        if (btnText) btnText.textContent = "Sync & Fetch Live Sessions";
    } else {
        if (lockIcon) lockIcon.classList.remove("hidden");
        if (btnText) btnText.textContent = "Sync & Fetch (Requires Password)";
    }
}

// App Password Verification
async function verifyAppPassword() {
    const senderEmail = document.getElementById("cfg-sender-email").value.trim();
    const appPwd = document.getElementById("cfg-app-password").value.trim();
    const verifyBtn = document.getElementById("verify-pwd-btn");
    const statusDiv = document.getElementById("verify-status");
    const statusText = document.getElementById("verify-status-text");

    if (!senderEmail || !appPwd) {
        alert("Please fill in Sender Email and App Password before verifying.");
        return;
    }

    verifyBtn.disabled = true;
    verifyBtn.innerHTML = '<i data-lucide="loader" class="w-3 h-3 animate-spin"></i> Verifying...';
    lucide.createIcons();

    try {
        const response = await fetchWithAuth("/api/verify-email", {
            method: "POST",
            body: JSON.stringify({ 
                sender_email: senderEmail, 
                sender_password: appPwd, 
                sender_name: document.getElementById("cfg-sig-name").value.trim() || getStoredSigName() || "Team"
            })
        });
        const result = await response.json();

        if (result.status === "success") {
            sessionAppPassword = appPwd;
            markVerified();
            statusDiv.className = "mt-1.5 text-[9px] font-semibold flex items-center gap-1 text-green-400";
            statusText.textContent = "✓ Verified — test email sent to your inbox";
            statusDiv.classList.remove("hidden");
            updateSyncButtonState();
            logToTerminal("SMTP credentials verified. Sync unlocked.", "success");
        } else {
            statusDiv.className = "mt-1.5 text-[9px] font-semibold flex items-center gap-1 text-red-400";
            statusText.textContent = `✗ Verification failed: ${result.message}`;
            statusDiv.classList.remove("hidden");
            logToTerminal(`Verification failed: ${result.message}`, "error");
        }
    } catch (err) {
        statusDiv.className = "mt-1.5 text-[9px] font-semibold flex items-center gap-1 text-red-400";
        statusText.textContent = `✗ Error: ${err.message}`;
        statusDiv.classList.remove("hidden");
        logToTerminal(`Verification error: ${err.message}`, "error");
    } finally {
        verifyBtn.disabled = false;
        verifyBtn.innerHTML = '<i data-lucide="shield-check" class="w-3 h-3"></i> Verify';
        lucide.createIcons();
    }
}

// Password visibility toggle (with support for custom inputs/icons)
function togglePasswordVisibility(inputId = "cfg-app-password", iconId = "pwd-eye-icon") {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (!input) return;
    
    if (input.type === "password") {
        input.type = "text";
        if (icon) icon.setAttribute("data-lucide", "eye-off");
    } else {
        input.type = "password";
        if (icon) icon.setAttribute("data-lucide", "eye");
    }
    lucide.createIcons();
}

// Fetch configuration from server
async function fetchConfig() {
    try {
        const response = await fetchWithAuth("/api/config");
        configData = await response.json();

        // Populate signature fields from local storage
        document.getElementById("cfg-sig-name").value = getStoredSigName();
        document.getElementById("cfg-sig-title").value = getStoredSigTitle();
        document.getElementById("cfg-sig-addr").value = configData.SIGNATURE_ADDRESS || "";
        document.getElementById("cfg-sig-phone").value = getStoredSigPhone();
        document.getElementById("cfg-sig-email").value = getStoredSigEmail();

        // Make Office Address read-only
        const addrInput = document.getElementById("cfg-sig-addr");
        if (addrInput) {
            addrInput.readOnly = true;
            addrInput.classList.add("opacity-60", "bg-black/50", "cursor-not-allowed");
        }

        // Populate credential fields from localStorage
        document.getElementById("cfg-sender-email").value = getStoredSenderEmail();
        document.getElementById("cfg-cc-emails").value = getStoredCcEmails();
        document.getElementById("cfg-app-password").value = getStoredAppPassword();

        logToTerminal("Configuration loaded successfully.", "info");
    } catch (err) {
        logToTerminal(`Failed to load configuration: ${err.message}`, "error");
    }
}

// Settings Modal Controls
function openSettingsModal() {
    document.getElementById("cfg-sig-name").value = getStoredSigName();
    document.getElementById("cfg-sig-title").value = getStoredSigTitle();
    document.getElementById("cfg-sig-phone").value = getStoredSigPhone();
    document.getElementById("cfg-sig-email").value = getStoredSigEmail();
    document.getElementById("cfg-sender-email").value = getStoredSenderEmail();
    document.getElementById("cfg-cc-emails").value = getStoredCcEmails();
    
    const pwd = getStoredAppPassword();
    document.getElementById("cfg-app-password").value = pwd;
    
    const verifyStatus = document.getElementById("verify-status");
    const verifyStatusText = document.getElementById("verify-status-text");
    if (verifyStatus && verifyStatusText) {
        if (pwd) {
            verifyStatus.className = "mt-1.5 text-[9px] font-semibold flex items-center gap-1 text-green-400";
            verifyStatusText.textContent = "Verified (credentials loaded from Supabase)";
            verifyStatus.classList.remove("hidden");
        } else {
            verifyStatus.classList.add("hidden");
        }
    }
    
    document.getElementById("settings-modal").classList.remove("hidden");
}

function closeSettingsModal() {
    document.getElementById("settings-modal").classList.add("hidden");
}

// Save Settings Form
document.getElementById("settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const saveBtn = e.target.querySelector("button[type='submit']");
    saveBtn.innerText = "Saving...";
    saveBtn.disabled = true;

    const senderEmail = document.getElementById("cfg-sender-email").value.trim();
    const ccEmails = document.getElementById("cfg-cc-emails").value.trim();
    const appPwd = document.getElementById("cfg-app-password").value;
    const sigName = document.getElementById("cfg-sig-name").value.trim();
    const sigTitle = document.getElementById("cfg-sig-title").value.trim();
    const sigPhone = document.getElementById("cfg-sig-phone").value.trim();
    const sigEmail = document.getElementById("cfg-sig-email").value.trim();

    // Save to cookies & localStorage
    setCookie(LS_SENDER_EMAIL, senderEmail);
    localStorage.setItem(LS_SENDER_EMAIL, senderEmail);
    setCookie(LS_CC_EMAILS, ccEmails);
    localStorage.setItem(LS_CC_EMAILS, ccEmails);
    setCookie(LS_APP_PASSWORD, appPwd);
    localStorage.setItem(LS_APP_PASSWORD, appPwd);
    sessionAppPassword = appPwd;

    setCookie(LS_SIG_NAME, sigName);
    localStorage.setItem(LS_SIG_NAME, sigName);
    setCookie(LS_SIG_TITLE, sigTitle);
    localStorage.setItem(LS_SIG_TITLE, sigTitle);
    setCookie(LS_SIG_PHONE, sigPhone);
    localStorage.setItem(LS_SIG_PHONE, sigPhone);
    setCookie(LS_SIG_EMAIL, sigEmail);
    localStorage.setItem(LS_SIG_EMAIL, sigEmail);

    // Save personal settings to Supabase
    if (currentUser) {
        try {
            await fetchWithAuth("/api/settings", {
                method: "POST",
                body: JSON.stringify({
                    email: currentUser.email,
                    sender_email: senderEmail,
                    cc_emails: ccEmails,
                    app_password: appPwd,
                    signature_name: sigName,
                    signature_title: sigTitle,
                    signature_address: configData.SIGNATURE_ADDRESS || "",
                    signature_phone: sigPhone,
                    signature_email: sigEmail,
                    test_mode: false
                })
            });
        } catch(e) {
            console.error("Failed to sync SMTP to backend:", e);
        }
    }

    // Save system parameters to server config
    const payload = {
        BASE_SHEET_URL: configData.BASE_SHEET_URL || "",
        TAB_NAME: configData.TAB_NAME || "",
        TEST_MODE: false
    };

    try {
        const response = await fetchWithAuth("/api/config", {
            method: "POST",
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        
        if (result.status === "success") {
            markOnboarded();
            checkOnboardingNotice();
            logToTerminal("Configuration saved successfully.", "success");
            closeSettingsModal();
            await fetchConfig();
        } else {
            logToTerminal(`Config error: ${result.message}`, "error");
        }
    } catch (err) {
        logToTerminal(`Failed to save config: ${err.message}`, "error");
    } finally {
        saveBtn.innerText = "Save Configuration";
        saveBtn.disabled = false;
    }
});


// Fetch Live Sessions Form submit
document.getElementById("fetch-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    
    // Check if App Password is set for session
    if (!sessionAppPassword) {
        showPasswordPopup(() => {
            // Click sync button again
            document.getElementById("fetch-btn").click();
        });
        return;
    }
    
    const btn = document.getElementById("fetch-btn");
    const btnText = document.getElementById("fetch-btn-text");
    const startVal = document.getElementById("start_date").value;
    const endVal = document.getElementById("end_date").value;
    
    if (!startVal || !endVal) {
        alert("Please select a date range on the calendar first.");
        return;
    }
    
    // UI Loading state
    btn.disabled = true;
    btn.classList.add("opacity-50", "pointer-events-none");
    btnText.innerText = "Synchronizing Sheet...";
    
    clearTerminal();
    logToTerminal(`Initiating synchronization from ${startVal} to ${endVal}...`, "info");
    logToTerminal("Connecting to Google Sheets using credentials...", "info");
    
    try {
        const response = await fetchWithAuth("/api/fetch-sessions", {
            method: "POST",
            body: JSON.stringify({ 
                start_date: startVal, 
                end_date: endVal,
                signature_name: getStoredSigName(),
                signature_title: getStoredSigTitle(),
                signature_phone: getStoredSigPhone(),
                signature_email: getStoredSigEmail()
            })
        });
        
        const data = await response.json();
        
        if (data.status === "success") {
            gradersData = data.graders;
            allSmeEmails = Object.keys(gradersData);
            smeEmails = [...allSmeEmails];
            
            // Reset SPOC active filter & Populate SPOC Filter Pills
            activeSpocFilter = "all";
            populateSpocFilter();
            
            logToTerminal("Successfully updated L4 and O4 date variables.", "success");
            logToTerminal("Google Sheets formulas calculated correctly.", "success");
            logToTerminal(`Imported ${data.total_sessions} live sessions across ${smeEmails.length} unique professors.`, "success");
            
            // Populate stats (Total Drafts & Unique Professors)
            const uniqueProfs = new Set();
            Object.values(gradersData).forEach(g => {
                if (g.email) uniqueProfs.add(g.email.toLowerCase());
            });
            document.getElementById("stat-sessions").innerText = smeEmails.length;
            document.getElementById("stat-sessions-sub").innerText = `${data.total_sessions} sessions`;
            document.getElementById("stat-graders").innerText = uniqueProfs.size;
            
            // Format date scope for header display
            const formatShortDate = (d) => {
                try {
                    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                    const pts = d.split("-");
                    return `${pts[2]} ${months[parseInt(pts[1]) - 1]}`;
                } catch {
                    return d;
                }
            };
            document.getElementById("stat-range").innerText = `${formatShortDate(startVal)} - ${formatShortDate(endVal)}`;
            document.getElementById("stat-range").title = `${startVal} to ${endVal}`;
            
            // Initialize Draft previews
            initPreviews();
            
            // Reset Wizard indexes & Clear statuses/reports on a new Sync & Fetch
            oboIndex = 0;
            smeStatuses = {};
            reportData = [];
            localStorage.removeItem(LS_SME_STATUSES);
            localStorage.removeItem(LS_REPORT);
            
            // Reset Report
            document.getElementById("btn-tab-report").classList.add("hidden");
            
            // Go to first tab
            switchTab("tab-preview");
            
        } else {
            logToTerminal(`Error syncing: ${data.message}`, "error");
            alert(`Sync failed: ${data.message}`);
        }
    } catch (err) {
        logToTerminal(`Request failed: ${err.message}`, "error");
        alert(`API Connection Error: ${err.message}`);
    } finally {
        btn.disabled = false;
        btn.classList.remove("opacity-50", "pointer-events-none");
        btnText.innerText = "Sync & Fetch Live Sessions";
        lucide.createIcons();
    }
});


// Initialize Draft Previews (Grid of Cards Layout)
function initPreviews() {
    const gridContainer = document.getElementById("previews-cards-grid");
    const oboStartBtn = document.getElementById("btn-start-obo");
    const bulkStartBtn = document.getElementById("btn-start-bulk");
    gridContainer.innerHTML = "";
    
    if (smeEmails.length === 0) {
        gridContainer.innerHTML = `
            <div id="previews-empty-state" class="col-span-full flex flex-col items-center justify-center text-center text-white/30 text-xs py-12">
                <i data-lucide="mail-open" class="w-8 h-8 mb-2"></i>
                No sessions synced yet. Pick a date range and click Sync to generate drafts.
            </div>
        `;
        if (oboStartBtn) oboStartBtn.classList.add("hidden");
        if (bulkStartBtn) bulkStartBtn.classList.add("hidden");
        lucide.createIcons();
        return;
    }
    
    if (oboStartBtn) oboStartBtn.classList.remove("hidden");
    
    // Hide/show bulk send button based on user role check
    const isUser = currentUser && currentUser.role === "User";
    if (bulkStartBtn) {
        if (isUser) bulkStartBtn.classList.add("hidden");
        else bulkStartBtn.classList.remove("hidden");
    }
    
    smeEmails.forEach((email) => {
        const info = gradersData[email];
        
        // Default status
        if (!smeStatuses[email]) {
            smeStatuses[email] = "Draft";
        }
        
        const status = smeStatuses[email];
        let statusClass = "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20";
        if (status === "Sent") statusClass = "bg-green-500/10 text-green-400 border border-green-500/20";
        if (status === "Failed") statusClass = "bg-red-500/10 text-red-400 border border-red-500/20";
        if (status === "Skipped") statusClass = "bg-white/10 text-white/50 border border-white/10";
        
        // Extract text snippet for preview body
        const bodySnippet = info.body_html
            .replace(/<[^>]*>?/gm, ' ')
            .replace(/\s+/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .substring(0, 110)
            .trim() + "...";
             // Check if SPOC credentials are configured
        const warningBadgeHtml = info.has_credentials 
            ? "" 
            : `<span class="bg-red-500/10 text-red-400 border border-red-500/20 text-[9px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 flex-shrink-0 animate-pulse">
                <i data-lucide="alert-triangle" class="w-3 h-3"></i> Missing Credentials
               </span>`;
            
        const card = document.createElement("div");
        card.className = "bg-white/[0.02] border border-white/5 rounded-2xl p-4 sm:p-5 hover:border-[#EE2C3C]/30 hover:bg-white/[0.04] transition-all flex flex-col justify-between gap-3 card-shine text-left relative min-h-[200px] sm:min-h-[220px] cursor-pointer group";
        card.onclick = () => openOboModalForEmail(email);
        
        card.innerHTML = `
            <div class="flex-1 flex flex-col gap-3">
                <div>
                    <!-- Header Row: Name & Sessions Count -->
                    <div class="flex justify-between items-center gap-2">
                        <h4 class="text-sm font-bold text-white truncate flex-1 group-hover:text-[#EE2C3C] transition-colors">${info.name}</h4>
                        <span class="bg-white/5 text-white/70 text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0">${info.sessions.length} session${info.sessions.length > 1 ? 's' : ''}</span>
                    </div>
                    
                    <!-- Email address -->
                    <p class="text-[10px] text-white/40 truncate mt-1">${info.email}</p>
                    
                    <!-- Badges Row: SPOC & Warning (if any) -->
                    <div class="mt-2 flex flex-wrap items-center gap-1.5">
                        <div class="inline-flex items-center gap-1 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-lg">
                            <i data-lucide="user-check" class="w-3 h-3 text-indigo-400"></i>
                            <span class="text-[10px] text-indigo-400 font-semibold">SPOC: ${info.spoc_display || 'N/A'}</span>
                        </div>
                        ${warningBadgeHtml}
                    </div>
                </div>
                
                <div class="space-y-1 mt-1">
                    <div class="text-[10px] text-white/55 font-semibold truncate">Subject: ${info.subject}</div>
                    <div class="text-[10px] text-white/35 line-clamp-2 leading-relaxed font-light italic">
                        "${bodySnippet}"
                    </div>
                </div>
            </div>
            
            <div class="flex items-center justify-between pt-2.5 border-t border-white/5 gap-2 flex-shrink-0">
                <span class="${statusClass} text-[9px] px-2.5 py-0.5 rounded-full font-mono font-semibold">${status}</span>
                <span class="text-[10px] text-white/30 group-hover:text-white/60 transition-colors flex items-center gap-1 font-medium">
                    Review &amp; Send <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
                </span>
            </div>
        `;
        gridContainer.appendChild(card);
    });
    
    lucide.createIcons();
}

// One-by-One Wizard Modal Logic
function openOboModalForEmail(email) {
    const idx = smeEmails.indexOf(email);
    if (idx !== -1) {
        oboIndex = idx;
    }
    oboModalRenderCurrent();
    document.getElementById("obo-modal").classList.remove("hidden");
}

function startOboWizard() {
    if (smeEmails.length === 0) return;
    oboIndex = 0;
    oboModalRenderCurrent();
    document.getElementById("obo-modal").classList.remove("hidden");
}

function closeOboModal() {
    document.getElementById("obo-modal").classList.add("hidden");
}

function renderOboSidebar() {
    const listContainer = document.getElementById("obo-sidebar-list");
    if (!listContainer) return;
    
    listContainer.innerHTML = "";
    
    smeEmails.forEach((emailKey, idx) => {
        const info = gradersData[emailKey];
        const status = smeStatuses[emailKey] || "Draft";
        
        let statusClass = "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20";
        if (status === "Sent") statusClass = "bg-green-500/10 text-green-400 border border-green-500/20";
        if (status === "Failed") statusClass = "bg-red-500/10 text-red-400 border border-red-500/20";
        if (status === "Skipped") statusClass = "bg-white/10 text-white/50 border border-white/10";
        
        const isActive = (idx === oboIndex);
        const activeClass = isActive 
            ? "bg-white/10 border-l-2 border-[#EE2C3C] text-white" 
            : "hover:bg-white/[0.04] text-white/60 hover:text-white border-l-2 border-transparent";
            
        const item = document.createElement("button");
        item.className = `w-full p-2.5 rounded-xl transition-all flex flex-col gap-1 text-left ${activeClass}`;
        item.onclick = () => selectOboIndex(idx);
        
        item.innerHTML = `
            <div class="flex justify-between items-start gap-1 w-full">
                <span class="text-xs font-bold truncate max-w-[130px]">${info.name}</span>
                <span class="bg-white/5 text-white/70 text-[8px] px-1.5 py-0.5 rounded font-mono font-semibold flex-shrink-0">${info.sessions.length} sessions</span>
            </div>
            <div class="flex justify-between items-center w-full gap-1">
                <span class="text-[9px] text-white/30 truncate max-w-[120px] font-mono">${info.email}</span>
                <span class="${statusClass} text-[7px] px-1.5 py-0.5 rounded font-mono font-semibold uppercase flex-shrink-0">${status}</span>
            </div>
        `;
        listContainer.appendChild(item);
    });
}

function selectOboIndex(idx) {
    if (idx >= 0 && idx < smeEmails.length) {
        oboIndex = idx;
        oboModalRenderCurrent();
    }
}

function oboModalRenderCurrent() {
    if (smeEmails.length === 0) return;
    
    if (oboIndex >= smeEmails.length) {
        logToTerminal("One-by-One manual processing finished. Opening Report.", "success");
        renderReport();
        closeOboModal();
        switchTab("tab-report");
        return;
    }
    
    // Draw the sidebar draft queue list
    renderOboSidebar();
    
    const emailKey = smeEmails[oboIndex];
    const info = gradersData[emailKey];
    
    document.getElementById("obo-modal-title").innerText = info.name;
    document.getElementById("obo-modal-progress").innerText = `${oboIndex + 1} of ${smeEmails.length}`;
    document.getElementById("obo-modal-to").value = info.email;
    
    // Set SPOC badge in One-by-One modal
    const spocBadge = document.getElementById("obo-modal-spoc-badge");
    if (spocBadge) {
        spocBadge.textContent = `SPOC: ${info.spoc_display || 'N/A'}`;
    }
    
    // Set mock inbox headers dynamically from SPOC details to strictly prevent misleading visual fallback
    const spocName = info.spoc_display || (info.spoc_email_display ? extract_name_from_email(info.spoc_email_display) : "SPOC");
    document.getElementById("obo-modal-header-from-name").innerText = spocName;
    
    const senderEmailElement = document.getElementById("obo-modal-header-from-email");
    if (senderEmailElement) {
        if (!info.has_credentials) {
            senderEmailElement.innerHTML = `<span class="text-red-400 font-bold">&lt;${info.spoc_email_display || "Missing Email"}&gt; (Missing SMTP Credentials - Incomplete)</span>`;
        } else {
            senderEmailElement.innerText = info.spoc_email_display ? `<${info.spoc_email_display}>` : "";
        }
    }
    
    // Dynamically set avatar initial from SPOC name
    const avatar = document.getElementById("obo-modal-header-avatar");
    if (avatar) {
        const firstLetter = spocName.trim().charAt(0).toUpperCase();
        avatar.innerText = firstLetter;
    }

    // Disable/Enable send button based on credentials
    const sendBtn = document.getElementById("obo-modal-send-btn");
    if (sendBtn) {
        if (!info.has_credentials) {
            sendBtn.disabled = true;
            sendBtn.innerHTML = '<i data-lucide="alert-triangle" class="w-3 h-3"></i> Missing Credentials';
            sendBtn.className = "px-3.5 py-1.5 bg-red-500/10 text-red-400 text-[11px] font-semibold rounded-lg flex items-center gap-1.5 border border-red-500/20 cursor-not-allowed ml-0.5";
        } else {
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<i data-lucide="send" class="w-3 h-3"></i> Send Email';
            sendBtn.className = "px-3.5 py-1.5 bg-[#EE2C3C] hover:bg-[#d42535] text-white text-[11px] font-semibold rounded-lg flex items-center gap-1.5 btn-press shadow-md shadow-[#EE2C3C]/20 transition-all duration-150 ml-0.5";
        }
    }
    
    const headerTo = document.getElementById("obo-modal-header-to");
    if (headerTo) headerTo.innerText = info.email;
    
    const headerSub = document.getElementById("obo-modal-header-subject");
    if (headerSub) headerSub.innerText = info.subject;
    
    // Only reset the subject field when switching to a different draft
    const subjectField = document.getElementById("obo-modal-subject");
    if (subjectField && subjectField.dataset.forIndex !== String(oboIndex)) {
        subjectField.value = info.subject;
        subjectField.dataset.forIndex = String(oboIndex);
    }
    
    // Populate the subject preview line in the metadata strip
    const subjectPreview = document.getElementById("obo-modal-subject-preview");
    if (subjectPreview) subjectPreview.innerText = info.subject;
    
    document.getElementById("obo-modal-html-preview").innerHTML = info.body_html;
    
    // Format the header status badge dynamically
    const status = smeStatuses[emailKey] || "Draft";
    const statusBadge = document.getElementById("obo-modal-status-badge");
    if (statusBadge) {
        const dotSpan = '<span class="w-1.5 h-1.5 rounded-full bg-current opacity-80"></span>';
        statusBadge.className = "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-bold tracking-widest uppercase font-mono flex-shrink-0";
        if (status === "Draft") {
            statusBadge.classList.add("bg-amber-500/10", "text-amber-400", "border", "border-amber-500/15");
        } else if (status === "Sent") {
            statusBadge.classList.add("bg-green-500/10", "text-green-400", "border", "border-green-500/15");
        } else if (status === "Failed") {
            statusBadge.classList.add("bg-red-500/10", "text-red-400", "border", "border-red-500/15");
        } else if (status === "Skipped") {
            statusBadge.classList.add("bg-white/5", "text-white/40", "border", "border-white/10");
        }
        statusBadge.innerHTML = dotSpan + " " + status;
    }
    
    // Toggle Prev/Next buttons disabled states
    const prevBtn = document.getElementById("obo-modal-prev-btn");
    const nextBtn = document.getElementById("obo-modal-next-btn");
    
    if (prevBtn) {
        if (oboIndex === 0) {
            prevBtn.classList.add("opacity-30", "pointer-events-none");
        } else {
            prevBtn.classList.remove("opacity-30", "pointer-events-none");
        }
    }
    
    if (nextBtn) {
        if (oboIndex === smeEmails.length - 1) {
            nextBtn.classList.add("opacity-30", "pointer-events-none");
        } else {
            nextBtn.classList.remove("opacity-30", "pointer-events-none");
        }
    }
    
    lucide.createIcons();
}

function oboModalPrev() {
    if (oboIndex > 0) {
        oboIndex--;
        oboModalRenderCurrent();
    }
}

function oboModalNext() {
    if (oboIndex < smeEmails.length - 1) {
        oboIndex++;
        oboModalRenderCurrent();
    }
}

async function oboModalSendCurrent() {
    if (oboIndex >= smeEmails.length) return;
    
    const email = smeEmails[oboIndex];
    const info = gradersData[email];
    
    // Block if SPOC has no credentials configured
    if (!info.has_credentials) {
        const spocName = info.spoc_display || info.spoc_email_display || 'this SPOC';
        logToTerminal(`Cannot send: SMTP credentials are not configured for ${spocName}. Please configure them in the Admin Panel.`, "error");
        return;
    }
    
    const to = document.getElementById("obo-modal-to").value;
    const subject = document.getElementById("obo-modal-subject").value;
    const body_html = info.body_html;
    const sentAt = new Date().toLocaleString();
    
    const btn = document.getElementById("obo-modal-send-btn");
    btn.disabled = true;
    btn.innerText = "Sending...";
    
    logToTerminal(`Sending email to ${info.name} (${to}) via ${info.spoc_email_display}...`, "info");
    
    try {
        const response = await fetchWithAuth("/api/send-email", {
            method: "POST",
            body: JSON.stringify({ 
                to, 
                subject, 
                body_html,
                spoc_email: info.spoc_email_display || ""
                // Note: sender credentials are loaded server-side from SPOC's Supabase settings
            })
        });
        const result = await response.json();
        
        if (result.status === "success") {
            logToTerminal(`✓ Email sent to ${info.name} from ${info.spoc_email_display}`, "success");
            reportData.push({ name: info.name, email: to, status: "Success", details: result.message, sentAt });
            setGraderStatus(email, "Sent");
        } else {
            logToTerminal(`✗ Send failed: ${result.message}`, "error");
            reportData.push({ name: info.name, email: to, status: "Failed", details: result.message, sentAt });
            setGraderStatus(email, "Failed");
        }
    } catch (err) {
        logToTerminal(`Connection error: ${err.message}`, "error");
        reportData.push({ name: info.name, email: to, status: "Failed", details: err.message, sentAt });
        setGraderStatus(email, "Failed");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="send" class="w-3.5 h-3.5"></i> Send Email';
        lucide.createIcons();
        saveReport();
        renderReport();
        initPreviews();
        oboIndex++;
        oboModalRenderCurrent();
    }
}


// Render Final execution report (with date sent)
function renderReport() {
    document.getElementById("btn-tab-report").classList.remove("hidden");
    
    const total   = reportData.length;
    const success = reportData.filter(r => r.status === "Success").length;
    const failed  = reportData.filter(r => r.status === "Failed").length;
    const skipped = reportData.filter(r => r.status === "Skipped").length;
    
    document.getElementById("report-total").innerText   = total;
    document.getElementById("report-success").innerText = success;
    document.getElementById("report-failed").innerText  = failed;
    document.getElementById("report-skipped").innerText = skipped;
    
    const list = document.getElementById("report-details-list");
    list.innerHTML = "";
    
    reportData.forEach(r => {
        let icon      = "check-circle2";
        let colorClass = "text-green-400";
        let bgClass   = "bg-green-400/5 border-green-500/10";
        
        if (r.status === "Failed") {
            icon = "x-circle"; colorClass = "text-red-400"; bgClass = "bg-red-400/5 border-red-500/10";
        } else if (r.status === "Skipped") {
            icon = "alert-circle"; colorClass = "text-white/50"; bgClass = "bg-white/5 border-white/5";
        }
        
        const row = document.createElement("div");
        row.className = `p-2.5 rounded-lg border flex items-center justify-between gap-3 ${bgClass}`;
        row.innerHTML = `
            <div class="flex items-center gap-2 min-w-0 flex-1">
                <i data-lucide="${icon}" class="w-4 h-4 flex-shrink-0 ${colorClass}"></i>
                <div class="min-w-0 flex-1">
                    <span class="font-medium text-white/90 text-xs">${r.name}</span>
                    <span class="text-[9px] text-white/40 font-mono ml-2">${r.email}</span>
                    ${r.sentAt ? `<span class="text-[8px] text-white/25 font-mono ml-2">${r.sentAt}</span>` : ""}
                </div>
            </div>
            <span class="text-[10px] ${colorClass} font-semibold flex-shrink-0">${r.status}</span>
        `;
        list.appendChild(row);
    });
    
    lucide.createIcons();
}
    

// Tab Switching
function switchTab(tabId) {
    currentTab = tabId;
    
    // Hide all tabs safely
    const tabs = ["tab-preview", "tab-bulk", "tab-report"];
    tabs.forEach(t => {
        const tabEl = document.getElementById(t);
        if (tabEl) tabEl.classList.add("hidden");
    });
    
    // Show selected safely
    const activeTabEl = document.getElementById(tabId);
    if (activeTabEl) activeTabEl.classList.remove("hidden");
    
    // Reset button styles
    tabs.forEach(t => {
        const btn = document.getElementById(`btn-${t}`);
        if (!btn) return;
        btn.className = "border-b-2 border-transparent text-white/50 hover:text-white hover:border-white/20 py-2 px-1 text-xs font-medium flex items-center gap-1.5 transition-all";
    });
    
    // Set active style
    const activeBtn = document.getElementById(`btn-${tabId}`);
    if (activeBtn) {
        activeBtn.className = "border-b-2 border-[#EE2C3C] text-white py-2 px-1 text-xs font-medium flex items-center gap-1.5 transition-all";
    }
}

// ==========================================
// APP PASSWORD POPUP SYSTEM HANDLERS
// ==========================================
function showPasswordPopup(onSuccessCallback) {
    const senderEmail = getStoredSenderEmail();
    if (!senderEmail) {
        alert("Please configure your Sender Email in Settings first.");
        openSettingsModal();
        return;
    }
    
    pendingActionCallback = onSuccessCallback;
    document.getElementById("popup-app-password").value = "";
    document.getElementById("popup-verify-status").classList.add("hidden");
    document.getElementById("popup-verify-status").innerText = "";
    
    document.getElementById("password-popup-modal").classList.remove("hidden");
    lucide.createIcons();
}

function closePasswordPopup() {
    document.getElementById("password-popup-modal").classList.add("hidden");
    pendingActionCallback = null;
}

function togglePopupPasswordVisibility() {
    const input = document.getElementById("popup-app-password");
    const icon = document.getElementById("popup-pwd-eye-icon");
    if (!input) return;
    
    if (input.type === "password") {
        input.type = "text";
        icon.setAttribute("data-lucide", "eye-off");
    } else {
        input.type = "password";
        icon.setAttribute("data-lucide", "eye");
    }
    lucide.createIcons();
}

async function submitPasswordPopup() {
    const appPwd = document.getElementById("popup-app-password").value.trim();
    const verifyBtn = document.getElementById("popup-verify-btn");
    const statusDiv = document.getElementById("popup-verify-status");
    const senderEmail = getStoredSenderEmail();
    
    if (!appPwd) {
        statusDiv.innerText = "Please enter your App Password.";
        statusDiv.classList.remove("hidden");
        return;
    }
    
    verifyBtn.disabled = true;
    verifyBtn.innerHTML = '<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i> Verifying...';
    lucide.createIcons();
    
    try {
        const response = await fetchWithAuth("/api/verify-email", {
            method: "POST",
            body: JSON.stringify({ 
                sender_email: senderEmail, 
                sender_password: appPwd, 
                sender_name: configData.SIGNATURE_NAME || "Team"
            })
        });
        const result = await response.json();
        
        if (result.status === "success") {
            sessionAppPassword = appPwd;
            markVerified();
            
            // Sync setting form pwd field if it exists
            const cfgPwd = document.getElementById("cfg-app-password");
            if (cfgPwd) cfgPwd.value = appPwd;
            
            const cfgStatus = document.getElementById("verify-status");
            const cfgStatusText = document.getElementById("verify-status-text");
            if (cfgStatus && cfgStatusText) {
                cfgStatus.className = "mt-1.5 text-[9px] font-semibold flex items-center gap-1 text-green-400";
                cfgStatusText.textContent = "✓ Verified — test email sent to your inbox";
                cfgStatus.classList.remove("hidden");
            }
            
            // Proactively persist the verified app password and sender email to Supabase settings
            try {
                const settingsResp = await fetchWithAuth(`/api/settings?email=${currentUser.email}`);
                const currentSettings = await settingsResp.json();
                
                currentSettings.app_password = appPwd;
                currentSettings.sender_email = senderEmail;
                
                await fetchWithAuth("/api/settings", {
                    method: "POST",
                    body: JSON.stringify(currentSettings)
                });
                
                // Also update local storage and cookies so the local app state is updated
                setCookie(LS_APP_PASSWORD, appPwd);
                localStorage.setItem(LS_APP_PASSWORD, appPwd);
                setCookie(LS_SENDER_EMAIL, senderEmail);
                localStorage.setItem(LS_SENDER_EMAIL, senderEmail);
                
                logToTerminal("Automatically saved verified SMTP credentials to Supabase settings.", "success");
            } catch (saveErr) {
                console.error("Failed to auto-save settings to Supabase:", saveErr);
                logToTerminal("Verified but failed to auto-save to Supabase.", "warning");
            }
            
            updateSyncButtonState();
            logToTerminal("SMTP credentials verified successfully via authentication prompt.", "success");
            
            closePasswordPopup();
            
            // Execute the action that triggered the popup
            if (pendingActionCallback) {
                const action = pendingActionCallback;
                pendingActionCallback = null;
                action();
            }
        } else {
            statusDiv.innerText = `Verification failed: ${result.message}`;
            statusDiv.classList.remove("hidden");
            logToTerminal(`Verification failed: ${result.message}`, "error");
            verifyBtn.disabled = false;
            verifyBtn.innerHTML = '<i data-lucide="shield-check" class="w-3.5 h-3.5"></i> Verify & Unlock';
            lucide.createIcons();
        }
    } catch (err) {
        statusDiv.innerText = `Error connecting to server: ${err.message}`;
        statusDiv.classList.remove("hidden");
        logToTerminal(`Server connection error: ${err.message}`, "error");
    } finally {
        verifyBtn.disabled = false;
        verifyBtn.innerHTML = '<i data-lucide="shield-check" class="w-3.5 h-3.5"></i> Verify & Unlock';
        lucide.createIcons();
    }
}

// SPOC Filter functions
let activeSpocFilter = "all";

function populateSpocFilter() {
    const listElement = document.getElementById("spoc-buttons-list");
    const container = document.getElementById("spoc-filter-container");
    if (!listElement || !container) return;
    
    // Hide SPOC filters completely for normal Users
    const isUser = currentUser && currentUser.role === "User";
    if (isUser) {
        container.classList.remove("flex");
        container.classList.add("hidden");
        return;
    }
    
    // Clear list
    listElement.innerHTML = "";
    
    const spocs = new Set();
    Object.values(gradersData).forEach(grader => {
        if (grader.spocs) {
            grader.spocs.forEach(s => {
                if (s && s !== "N/A") spocs.add(s);
            });
        }
    });
    
    const sortedSpocs = Array.from(spocs).sort();
    
    if (sortedSpocs.length > 0) {
        // Create "All SPOCs" pill button
        const allBtn = document.createElement("button");
        allBtn.type = "button";
        allBtn.className = "spoc-pill font-semibold text-[10px] px-3 py-1 rounded-full transition-all cursor-pointer " + 
                            (activeSpocFilter === "all" 
                            ? "bg-[#EE2C3C] text-white shadow-md shadow-[#EE2C3C]/20 border border-transparent" 
                            : "bg-white/[0.03] hover:bg-white/[0.08] text-white/60 border border-white/[0.06]");
        allBtn.innerText = "All SPOCs";
        allBtn.onclick = () => selectSpocFilter("all");
        listElement.appendChild(allBtn);
        
        // Create dynamic pills for each SPOC
        sortedSpocs.forEach(spoc => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "spoc-pill font-semibold text-[10px] px-3 py-1 rounded-full transition-all cursor-pointer " + 
                                (activeSpocFilter === spoc 
                                ? "bg-[#EE2C3C] text-white shadow-md shadow-[#EE2C3C]/20 border border-transparent" 
                                : "bg-white/[0.03] hover:bg-white/[0.08] text-white/60 border border-white/[0.06]");
            btn.innerText = spoc;
            btn.onclick = () => selectSpocFilter(spoc);
            listElement.appendChild(btn);
        });
        
        container.classList.remove("hidden");
        container.classList.add("flex");
    } else {
        container.classList.remove("flex");
        container.classList.add("hidden");
    }
}

function selectSpocFilter(spoc) {
    activeSpocFilter = spoc;
    
    // Refresh visual pills style
    const listElement = document.getElementById("spoc-buttons-list");
    if (listElement) {
        const buttons = listElement.querySelectorAll("button");
        buttons.forEach(btn => {
            const isTarget = btn.innerText === (spoc === "all" ? "All SPOCs" : spoc);
            if (isTarget) {
                btn.className = "spoc-pill font-semibold text-[10px] px-3 py-1 rounded-full transition-all cursor-pointer bg-[#EE2C3C] text-white shadow-md shadow-[#EE2C3C]/20 border border-transparent";
            } else {
                btn.className = "spoc-pill font-semibold text-[10px] px-3 py-1 rounded-full transition-all cursor-pointer bg-white/[0.03] hover:bg-white/[0.08] text-white/60 border border-white/[0.06]";
            }
        });
    }
    
    // Perform filtering
    if (spoc === "all") {
        smeEmails = [...allSmeEmails];
    } else {
        smeEmails = allSmeEmails.filter(email => {
            const grader = gradersData[email];
            return grader && grader.spocs && grader.spocs.includes(spoc);
        });
    }
    
    // Recalculate stats based on selection
    updateFilteredStats();
    
    // Update SPOC filter summary text
    const summarySpan = document.getElementById("spoc-filter-summary-text");
    if (summarySpan) {
        if (spoc === "all") {
            summarySpan.innerText = "";
            summarySpan.classList.add("hidden");
        } else {
            let totalSessions = 0;
            const uniqueProfs = new Set();
            smeEmails.forEach(email => {
                const grader = gradersData[email];
                if (grader) {
                    if (grader.email) {
                        uniqueProfs.add(grader.email.toLowerCase());
                    }
                    if (grader.sessions) {
                        totalSessions += grader.sessions.length;
                    }
                }
            });
            summarySpan.innerText = `${uniqueProfs.size} profs, ${totalSessions} session${totalSessions !== 1 ? 's' : ''}`;
            summarySpan.classList.remove("hidden");
        }
    }
    
    // Reset One-by-One wizard
    oboIndex = 0;
    
    initPreviews();
    logToTerminal(`Filtered by SPOC: ${spoc}. Matches: ${smeEmails.length} professors.`, "info");
}

function updateFilteredStats() {
    let totalSessions = 0;
    const uniqueProfs = new Set();
    smeEmails.forEach(email => {
        const grader = gradersData[email];
        if (grader) {
            if (grader.email) {
                uniqueProfs.add(grader.email.toLowerCase());
            }
            if (grader.sessions) {
                totalSessions += grader.sessions.length;
            }
        }
    });
    
    document.getElementById("stat-sessions").innerText = smeEmails.length;
    document.getElementById("stat-sessions-sub").innerText = `${totalSessions} session${totalSessions !== 1 ? 's' : ''}`;
    document.getElementById("stat-graders").innerText = uniqueProfs.size;
}

function loadSmeStatuses() {
    try {
        const saved = localStorage.getItem(LS_SME_STATUSES);
        if (saved) {
            smeStatuses = JSON.parse(saved);
        } else {
            smeStatuses = {};
        }
    } catch(e) {
        smeStatuses = {};
    }
}

function setGraderStatus(email, status) {
    smeStatuses[email] = status;
    try {
        localStorage.setItem(LS_SME_STATUSES, JSON.stringify(smeStatuses));
    } catch(e) {
        console.error("Failed to save status:", e);
    }
}


// Bulk Wizard State
let bulkWizardIndex = 0;
let bulkEmailsList = []; // The active subset of emails being processed in bulk

function openBulkWizard() {
    if (smeEmails.length === 0) return;
    
    // Check if App Password is set for session
    if (!sessionAppPassword) {
        showPasswordPopup(() => {
            openBulkWizard();
        });
        return;
    }

    bulkWizardIndex = 0;
    bulkEmailsList = [...smeEmails]; // Copy the filtered list of emails
    
    // Show preview state, hide confirm, sending and completed states
    document.getElementById("bulk-modal-preview-state").classList.remove("hidden");
    document.getElementById("bulk-modal-confirm-state").classList.add("hidden");
    document.getElementById("bulk-modal-sending-state").classList.add("hidden");
    document.getElementById("bulk-modal-completed-state").classList.add("hidden");
    
    // Reset next button text
    document.getElementById("bulk-modal-next-btn-text").textContent = "Next";
    document.getElementById("bulk-modal-prev-btn").classList.remove("hidden");
    document.getElementById("bulk-modal-next-btn").classList.remove("hidden");
    
    bulkWizardRenderCurrent();
    
    document.getElementById("bulk-wizard-modal").classList.remove("hidden");
    lucide.createIcons();
}

function closeBulkWizard() {
    document.getElementById("bulk-wizard-modal").classList.add("hidden");
}

function bulkWizardRenderCurrent() {
    if (bulkEmailsList.length === 0) return;
    
    const emailKey = bulkEmailsList[bulkWizardIndex];
    const info = gradersData[emailKey];
    
    document.getElementById("bulk-modal-title").innerText = info.name;
    document.getElementById("bulk-modal-progress").innerText = `${bulkWizardIndex + 1} of ${bulkEmailsList.length}`;
    document.getElementById("bulk-modal-to").innerText = info.email;
    document.getElementById("bulk-modal-subject").innerText = info.subject;
    document.getElementById("bulk-modal-html-preview").innerHTML = info.body_html;
    
    // Set SPOC badge
    const spocBadge = document.getElementById("bulk-modal-spoc-badge");
    if (spocBadge) {
        spocBadge.textContent = `SPOC: ${info.spoc_display || 'N/A'}`;
    }
    
    // Set mock headers from actual SPOC details to strictly prevent misleading visual fallback
    const spocName = info.spoc_display || (info.spoc_email_display ? extract_name_from_email(info.spoc_email_display) : "SPOC");
    document.getElementById("bulk-modal-header-from-name").innerText = spocName;
    
    const senderEmailElement = document.getElementById("bulk-modal-header-from-email");
    if (senderEmailElement) {
        if (!info.has_credentials) {
            senderEmailElement.innerHTML = `<span class="text-red-400 font-bold">&lt;${info.spoc_email_display || "Missing Email"}&gt; (Missing SMTP Credentials - Incomplete)</span>`;
        } else {
            senderEmailElement.innerText = info.spoc_email_display ? `<${info.spoc_email_display}>` : "";
        }
    }
    
    // Set avatar from SPOC name
    const avatar = document.getElementById("bulk-modal-header-avatar");
    if (avatar) {
        const firstLetter = spocName.trim().charAt(0).toUpperCase();
        avatar.innerText = firstLetter;
    }
    
    // Prev button state
    const prevBtn = document.getElementById("bulk-modal-prev-btn");
    if (prevBtn) {
        if (bulkWizardIndex === 0) {
            prevBtn.classList.add("opacity-30", "pointer-events-none");
        } else {
            prevBtn.classList.remove("opacity-30", "pointer-events-none");
        }
    }
    
    // Next button label
    const nextBtnText = document.getElementById("bulk-modal-next-btn-text");
    if (nextBtnText) {
        if (bulkWizardIndex === bulkEmailsList.length - 1) {
            nextBtnText.textContent = "Review Complete";
        } else {
            nextBtnText.textContent = "Next";
        }
    }
    
    lucide.createIcons();
}

function bulkWizardPrev() {
    if (bulkWizardIndex > 0) {
        // If we were on confirmation, go back to last preview
        if (!document.getElementById("bulk-modal-confirm-state").classList.contains("hidden")) {
            document.getElementById("bulk-modal-confirm-state").classList.add("hidden");
            document.getElementById("bulk-modal-preview-state").classList.remove("hidden");
            document.getElementById("bulk-modal-next-btn").classList.remove("hidden");
            bulkWizardIndex = bulkEmailsList.length - 1;
        } else {
            bulkWizardIndex--;
        }
        bulkWizardRenderCurrent();
    }
}

function bulkWizardNext() {
    if (bulkWizardIndex < bulkEmailsList.length - 1) {
        bulkWizardIndex++;
        bulkWizardRenderCurrent();
    } else {
        // We reached the end of the previews, show confirmation state
        document.getElementById("bulk-modal-preview-state").classList.add("hidden");
        document.getElementById("bulk-modal-confirm-state").classList.remove("hidden");
        document.getElementById("bulk-modal-next-btn").classList.add("hidden"); // Hide next since we are on confirmation
        
        // Show Prev button for going back
        const prevBtn = document.getElementById("bulk-modal-prev-btn");
        if (prevBtn) prevBtn.classList.remove("opacity-30", "pointer-events-none");
        
        // Fill confirmation details
        document.getElementById("bulk-modal-confirm-spoc").innerText = activeSpocFilter === "all" ? "All SPOCs" : activeSpocFilter;
        document.getElementById("bulk-modal-confirm-count").innerText = `${bulkEmailsList.length} Emails`;
        
        lucide.createIcons();
    }
}

function bulkWizardBackToReview() {
    document.getElementById("bulk-modal-confirm-state").classList.add("hidden");
    document.getElementById("bulk-modal-preview-state").classList.remove("hidden");
    document.getElementById("bulk-modal-next-btn").classList.remove("hidden");
    bulkWizardIndex = bulkEmailsList.length - 1;
    bulkWizardRenderCurrent();
}

async function bulkWizardExecute() {
    document.getElementById("bulk-modal-confirm-state").classList.add("hidden");
    document.getElementById("bulk-modal-sending-state").classList.remove("hidden");
    
    // Hide header prev/next navigation during execution
    document.getElementById("bulk-modal-prev-btn").classList.add("hidden");
    document.getElementById("bulk-modal-next-btn").classList.add("hidden");
    
    const consoleLog = document.getElementById("bulk-modal-console");
    consoleLog.innerHTML = "<p class='text-white/40'>> Initializing automated queue loop...</p>";
    
    const progressText = document.getElementById("bulk-modal-sending-progress");
    
    reportData = []; // Clear in-memory report at start of bulk execute
    
    for (let i = 0; i < bulkEmailsList.length; i++) {
        const email = bulkEmailsList[i];
        const info = gradersData[email];
        const sentAt = new Date().toLocaleString();
        
        consoleLog.innerHTML += `<p class="text-white/60">> Queue [${i+1}/${bulkEmailsList.length}]: ${info.name} (SPOC: ${info.spoc_display || info.spoc_email_display})...</p>`;
        consoleLog.scrollTop = consoleLog.scrollHeight;
        
        // Update stats progress
        const percent = Math.round(((i) / bulkEmailsList.length) * 100);
        progressText.innerText = `${i} / ${bulkEmailsList.length} Emails (${percent}%)`;

        // Fail if SPOC has no credentials configured (strictly enforce credentials presence)
        if (!info.has_credentials) {
            const spocId = info.spoc_display || info.spoc_email_display || 'Unknown SPOC';
            consoleLog.innerHTML += `<p class="text-red-400 font-bold">› INCOMPLETE: No SMTP credentials for SPOC ${spocId}. Email NOT sent. Please configure credentials in Admin Panel.</p>`;
            consoleLog.scrollTop = consoleLog.scrollHeight;
            reportData.push({ name: info.name, email: info.email, status: "Failed", details: `Incomplete: Missing SMTP credentials for SPOC ${spocId}`, sentAt });
            setGraderStatus(email, "Failed");
            continue;
        }
        
        try {
            const payload = {
                to: info.email,
                subject: info.subject,
                body_html: info.body_html,
                spoc_email: info.spoc_email_display || ""
                // Credentials are resolved server-side from SPOC's Supabase settings
            };
            
            const response = await fetchWithAuth("/api/send-email", {
                method: "POST",
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            
            if (result.status === "success") {
                consoleLog.innerHTML += `<p class="text-[#4ade80]">› Sent: ${info.email} ← from ${info.spoc_email_display}</p>`;
                reportData.push({ name: info.name, email: info.email, status: "Success", details: result.message, sentAt });
                setGraderStatus(email, "Sent");
            } else {
                consoleLog.innerHTML += `<p class="text-[#f87171]">› Failed: ${result.message}</p>`;
                reportData.push({ name: info.name, email: info.email, status: "Failed", details: result.message, sentAt });
                setGraderStatus(email, "Failed");
            }
        } catch (err) {
            consoleLog.innerHTML += `<p class="text-[#f87171]">› Error: ${err.message}</p>`;
            reportData.push({ name: info.name, email: info.email, status: "Failed", details: err.message, sentAt });
            setGraderStatus(email, "Failed");
        }
        initPreviews();
        consoleLog.scrollTop = consoleLog.scrollHeight;
        
        // Wait 1 second between sends to respect SMTP rate limits
        await new Promise(r => setTimeout(r, 1000));
    }
    
    progressText.innerText = `${bulkEmailsList.length} / ${bulkEmailsList.length} Emails (100%)`;
    consoleLog.innerHTML += `<p class="text-[#4ade80] font-bold">> Bulk send finished successfully!</p>`;
    consoleLog.scrollTop = consoleLog.scrollHeight;
    
    // Switch to completed view
    setTimeout(() => {
        document.getElementById("bulk-modal-sending-state").classList.add("hidden");
        document.getElementById("bulk-modal-completed-state").classList.remove("hidden");
        document.getElementById("bulk-modal-completed-summary").innerText = 
            `Successfully processed all ${bulkEmailsList.length} email queue drafts.`;
        lucide.createIcons();
    }, 1000);
}

function bulkWizardViewReport() {
    closeBulkWizard();
    
    // Reset modal header buttons visibility in case it is re-opened
    document.getElementById("bulk-modal-prev-btn").classList.remove("hidden");
    document.getElementById("bulk-modal-next-btn").classList.remove("hidden");
    
    renderReport();
    switchTab("tab-report");
}

// ── AUTHENTICATION & SIDEBAR NAVIGATION INTEGRATION ──

function getAuthHeaders() {
    const token = localStorage.getItem("upgrad_token");
    return token ? { "Authorization": `Bearer ${token}` } : {};
}

async function fetchWithAuth(url, options = {}) {
    if (!options.headers) {
        options.headers = {};
    }
    const authHeaders = getAuthHeaders();
    Object.assign(options.headers, authHeaders);
    if (!options.headers["Content-Type"] && !(options.body instanceof FormData)) {
        options.headers["Content-Type"] = "application/json";
    }
    return fetch(url, options);
}

async function checkSession() {
    const token = localStorage.getItem("upgrad_token");
    if (!token) {
        showLoginOverlay();
        return;
    }
    try {
        const response = await fetchWithAuth("/api/auth/session");
        const data = await response.json();
        if (data.status === "success") {
            currentUser = data.user;
            
            // Populate profile info
            const firstLetter = currentUser.name.trim().charAt(0).toUpperCase();
            document.getElementById("sb-profile-avatar").innerText = firstLetter;
            document.getElementById("sb-profile-name").innerText = currentUser.name;
            document.getElementById("sb-profile-role").innerText = currentUser.role;
            
            // Show/hide admin sidebar tab based on roles
            const adminNavBtn = document.getElementById("sb-nav-admin-panel");
            if (currentUser.role === "Admin" || currentUser.role === "Co-Admin") {
                adminNavBtn.classList.remove("hidden");
            } else {
                adminNavBtn.classList.add("hidden");
            }
            
            // Role Based UI tweaks (disable/hide bulk send for regular users)
            const bulkBtn = document.getElementById("btn-start-bulk");
            if (currentUser.role === "User") {
                if (bulkBtn) bulkBtn.classList.add("hidden");
            } else {
                if (bulkBtn) bulkBtn.classList.remove("hidden");
            }
            
            // Hide login screen and show main content
            hideLoginOverlay();
            
            // Load initial config
            fetchConfig();
            fetchSheetDates();
            
            // Auto open settings if SMTP settings are not configured yet
            const personalSettings = await fetchWithAuth(`/api/settings?email=${currentUser.email}`);
            const pData = await personalSettings.json();
            if (!pData.sender_email || !pData.app_password) {
                openSettingsModal();
            } else {
                // Settings are already configured! Sync them to local state so the user doesn't need to verify again
                sessionAppPassword = pData.app_password;
                setCookie(LS_SENDER_EMAIL, pData.sender_email);
                localStorage.setItem(LS_SENDER_EMAIL, pData.sender_email);
                setCookie(LS_APP_PASSWORD, pData.app_password);
                localStorage.setItem(LS_APP_PASSWORD, pData.app_password);
                setCookie(LS_CC_EMAILS, pData.cc_emails || "");
                localStorage.setItem(LS_CC_EMAILS, pData.cc_emails || "");
                setCookie(LS_SIG_NAME, pData.signature_name || "");
                localStorage.setItem(LS_SIG_NAME, pData.signature_name || "");
                setCookie(LS_SIG_TITLE, pData.signature_title || "");
                localStorage.setItem(LS_SIG_TITLE, pData.signature_title || "");
                setCookie(LS_SIG_PHONE, pData.signature_phone || "");
                localStorage.setItem(LS_SIG_PHONE, pData.signature_phone || "");
                setCookie(LS_SIG_EMAIL, pData.signature_email || "");
                localStorage.setItem(LS_SIG_EMAIL, pData.signature_email || "");
                
                markVerified();
            }
        } else {
            showLoginOverlay();
        }
    } catch (err) {
        console.error("Session check error:", err);
        showLoginOverlay();
    }
}

function showLoginOverlay() {
    const splash = document.getElementById("splash-overlay");
    if (splash) splash.classList.add("hidden");
    
    document.getElementById("login-overlay").classList.remove("hidden");
    document.getElementById("app-sidebar").classList.add("hidden");
    document.getElementById("main-content-wrapper").classList.add("pl-0");
}

function hideLoginOverlay() {
    const splash = document.getElementById("splash-overlay");
    if (splash) splash.classList.add("hidden");
    
    document.getElementById("login-overlay").classList.add("hidden");
    document.getElementById("app-sidebar").classList.remove("hidden");
    document.getElementById("main-content-wrapper").classList.remove("pl-0");
}

// Password toggle functionality handled by global togglePasswordVisibility

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    const errorEl = document.getElementById("login-error");
    
    errorEl.classList.add("hidden");
    errorEl.innerText = "";
    
    try {
        const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        if (data.status === "success") {
            localStorage.setItem("upgrad_token", data.token);
            await checkSession();
        } else {
            errorEl.innerText = data.message || "Invalid email or password.";
            errorEl.classList.remove("hidden");
        }
    } catch (err) {
        errorEl.innerText = "Error connecting to authentication service.";
        errorEl.classList.remove("hidden");
    }
}

async function handleLogout() {
    try {
        await fetchWithAuth("/api/auth/logout", { method: "POST" });
    } catch (e) {
        console.error("Logout failed:", e);
    }
    localStorage.removeItem("upgrad_token");
    currentUser = null;
    showLoginOverlay();
}

function navigateSidebar(viewName) {
    const liveSessionsView = document.getElementById("live-sessions-view");
    const adminPanelView = document.getElementById("admin-panel-view");
    const navLiveSessions = document.getElementById("sb-nav-live-sessions");
    const navAdminPanel = document.getElementById("sb-nav-admin-panel");
    
    if (viewName === "live-sessions") {
        liveSessionsView.classList.remove("hidden");
        adminPanelView.classList.add("hidden");
        
        navLiveSessions.className = "w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold rounded-xl transition-all cursor-pointer bg-[#EE2C3C] text-white shadow-md shadow-[#EE2C3C]/10 border border-transparent btn-press";
        navAdminPanel.className = "w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold rounded-xl transition-all cursor-pointer text-white/50 hover:text-white/85 hover:bg-white/[0.03] border border-transparent btn-press";
    } else if (viewName === "admin-panel") {
        adminPanelView.classList.remove("hidden");
        liveSessionsView.classList.add("hidden");
        
        navAdminPanel.className = "w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold rounded-xl transition-all cursor-pointer bg-[#EE2C3C] text-white shadow-md shadow-[#EE2C3C]/10 border border-transparent btn-press";
        navLiveSessions.className = "w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold rounded-xl transition-all cursor-pointer text-white/50 hover:text-white/85 hover:bg-white/[0.03] border border-transparent btn-press";
        
        switchAdminTab("user-mgr");
    }
}

function switchAdminTab(tabId) {
    const tabs = ["user-mgr", "smtp-mgr", "logs-mgr", "stats-mgr"];
    tabs.forEach(t => {
        const pane = document.getElementById(`panel-${t}`);
        const btn = document.getElementById(`admin-tab-${t}`);
        if (pane) pane.classList.add("hidden");
        if (btn) {
            btn.className = "px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white/60 hover:text-white transition-all cursor-pointer";
        }
    });
    
    const activePane = document.getElementById(`panel-${tabId}`);
    const activeBtn = document.getElementById(`admin-tab-${tabId}`);
    if (activePane) activePane.classList.remove("hidden");
    if (activeBtn) {
        activeBtn.className = "px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#EE2C3C] transition-all cursor-pointer";
    }
    
    if (tabId === "user-mgr") {
        loadUsers();
    } else if (tabId === "smtp-mgr") {
        loadSmtpConfigs();
    } else if (tabId === "logs-mgr") {
        loadLogs();
    } else if (tabId === "stats-mgr") {
        loadDashboardStats("today");
    }
}

// ── USER MANAGEMENT FUNCTIONS ──
async function loadUsers() {
    try {
        const response = await fetchWithAuth("/api/admin/users");
        const data = await response.json();
        const tbody = document.getElementById("admin-users-table-body");
        tbody.innerHTML = "";
        
        if (data.status === "success") {
            data.users.forEach(u => {
                const tr = document.createElement("tr");
                tr.className = "border-b border-white/5 hover:bg-white/[0.01]";
                
                const isTargetAdmin = u.role === "Admin";
                const isCurrentAdmin = currentUser.role === "Admin";
                const canModify = isCurrentAdmin || (!isTargetAdmin);
                const canDelete = isCurrentAdmin && (!isTargetAdmin) && (u.id !== currentUser.id);
                
                const actionsHtml = `
                    <div class="flex justify-end gap-2">
                        <button onclick="openUserModal(${JSON.stringify(u).replace(/"/g, '&quot;')})" 
                            ${canModify ? "" : "disabled"} 
                            class="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-[10px] font-semibold rounded-lg border border-white/5 disabled:opacity-30 disabled:pointer-events-none transition-all btn-press cursor-pointer">
                            Edit
                        </button>
                        <button onclick="deleteUser('${u.id}', '${u.name.replace(/'/g, "\\'")}')" 
                            ${canDelete ? "" : "disabled"} 
                            class="px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 text-[10px] font-semibold rounded-lg border border-red-500/15 disabled:opacity-30 disabled:pointer-events-none transition-all btn-press cursor-pointer">
                            Delete
                        </button>
                    </div>
                `;
                
                tr.innerHTML = `
                    <td class="p-3.5 pl-5 font-semibold text-white">${u.name}</td>
                    <td class="p-3.5 text-white/60 font-mono">${u.email}</td>
                    <td class="p-3.5">
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold font-mono tracking-wide ${
                            u.role === 'Admin' ? 'bg-[#EE2C3C]/10 text-[#EE2C3C] border border-[#EE2C3C]/15' : 
                            u.role === 'Co-Admin' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 
                            'bg-green-500/10 text-green-400 border border-green-500/20'
                        }">
                            ${u.role}
                        </span>
                    </td>
                    <td class="p-3.5 pr-5 text-right">${actionsHtml}</td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (err) {
        console.error("Failed to load users:", err);
    }
}

function openUserModal(user) {
    const titleEl = document.getElementById("user-modal-title");
    const idInput = document.getElementById("user-modal-id");
    const nameInput = document.getElementById("user-modal-name");
    const emailInput = document.getElementById("user-modal-email");
    const passInput = document.getElementById("user-modal-password");
    const passLabel = document.getElementById("user-modal-pass-label");
    const roleSelect = document.getElementById("user-modal-role");
    
    idInput.value = "";
    nameInput.value = "";
    emailInput.value = "";
    passInput.value = "";
    roleSelect.value = "User";
    roleSelect.disabled = false;
    
    const hasAdminOpt = Array.from(roleSelect.options).some(o => o.value === "Admin");
    if (currentUser.role === "Admin") {
        if (!hasAdminOpt) {
            const opt = document.createElement("option");
            opt.value = "Admin";
            opt.text = "Admin (Full System Access)";
            opt.className = "bg-[#121212] text-white";
            roleSelect.appendChild(opt);
        }
    } else {
        if (hasAdminOpt) {
            for (let i = 0; i < roleSelect.options.length; i++) {
                if (roleSelect.options[i].value === "Admin") {
                    roleSelect.remove(i);
                    break;
                }
            }
        }
    }
    
    if (!user) {
        titleEl.textContent = "Create New User";
        emailInput.readOnly = false;
        emailInput.classList.remove("opacity-60", "bg-black/50");
        passInput.required = true;
        passLabel.innerHTML = 'Password';
        passInput.placeholder = "Enter password";
    } else {
        titleEl.textContent = "Edit User";
        idInput.value = user.id;
        nameInput.value = user.name;
        emailInput.value = user.email;
        emailInput.readOnly = true;
        emailInput.classList.add("opacity-60", "bg-black/50");
        passInput.required = false;
        passLabel.innerHTML = 'Password <span class="text-white/30 font-light">(Leave blank to keep current)</span>';
        passInput.placeholder = "••••••••";
        roleSelect.value = user.role;
        
        if (user.id === currentUser.id) {
            roleSelect.disabled = true;
        } else {
            roleSelect.disabled = false;
        }
    }
    
    document.getElementById("user-modal").classList.remove("hidden");
    lucide.createIcons();
}

function closeUserModal() {
    document.getElementById("user-modal").classList.add("hidden");
}

document.getElementById("user-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("user-modal-id").value;
    const name = document.getElementById("user-modal-name").value.trim();
    const email = document.getElementById("user-modal-email").value.trim();
    const password = document.getElementById("user-modal-password").value;
    const role = document.getElementById("user-modal-role").value;
    
    const isEdit = !!id;
    const url = isEdit ? `/api/admin/users/${id}` : "/api/admin/users";
    const method = isEdit ? "PUT" : "POST";
    
    const payload = { name, role };
    if (!isEdit) payload.email = email;
    if (password) payload.password = password;
    
    try {
        const response = await fetchWithAuth(url, {
            method,
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (data.status === "success") {
            alert(data.message || "User saved successfully.");
            closeUserModal();
            loadUsers();
        } else {
            alert("Error: " + data.message);
        }
    } catch (err) {
        alert("Request failed: " + err.message);
    }
});

async function deleteUser(id, name) {
    const confirmDel = confirm(`Are you sure you want to delete user: ${name}?`);
    if (!confirmDel) return;
    
    try {
        const response = await fetchWithAuth(`/api/admin/users/${id}`, { method: "DELETE" });
        const data = await response.json();
        if (data.status === "success") {
            alert("User deleted successfully.");
            loadUsers();
        } else {
            alert("Error: " + data.message);
        }
    } catch (err) {
        alert("Request failed: " + err.message);
    }
}

// ── SMTP MANAGEMENT FUNCTIONS ──
async function loadSmtpConfigs() {
    try {
        const response = await fetchWithAuth("/api/admin/users");
        const data = await response.json();
        const tbody = document.getElementById("admin-smtp-table-body");
        tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-white/30 text-xs"><i data-lucide="loader" class="w-4 h-4 animate-spin inline-block mr-2"></i>Loading configurations...</td></tr>`;
        lucide.createIcons();
        
        if (data.status === "success" && data.users.length > 0) {
            // Fetch all user settings in parallel for performance
            const settingsPromises = data.users.map(u =>
                fetchWithAuth(`/api/settings?email=${encodeURIComponent(u.email)}`)
                    .then(r => r.json())
                    .catch(() => ({}))
            );
            const allSettings = await Promise.all(settingsPromises);
            
            tbody.innerHTML = "";
            data.users.forEach((u, idx) => {
                const sData = allSettings[idx] || {};
                
                const tr = document.createElement("tr");
                tr.className = "border-b border-white/5 hover:bg-white/[0.01]";
                
                const isConfigured = !!sData.sender_email;
                // Mask app password: show bullets if set
                const maskedPwd = sData.app_password 
                    ? `<span class="bg-white/5 px-2 py-1 rounded text-white/80 font-mono tracking-[0.3em]">●●●●●●●●</span>` 
                    : '<span class="text-white/20 italic">—</span>';
                
                tr.innerHTML = `
                    <td class="p-3.5 pl-5 font-semibold text-white">${u.name}</td>
                    <td class="p-3.5 text-white/60 font-mono">${
                        isConfigured ? sData.sender_email : '<span class="text-amber-400/50 italic text-[10px]">Not Configured</span>'
                    }</td>
                    <td class="p-3.5 text-white/60 font-mono">
                        ${maskedPwd}
                    </td>
                    <td class="p-3.5 text-white/60">
                        ${sData.signature_name ? `<div class="font-medium text-white">${sData.signature_name}</div><div class="text-[9.5px] text-white/40">${sData.signature_title || ''}</div>` : '<span class="text-white/20 italic">—</span>'}
                    </td>
                    <td class="p-3.5 text-white/50 font-mono">${sData.cc_emails || '—'}</td>
                    <td class="p-3.5 pr-5 text-right">
                        <button onclick="openAdminSettingsModal('${u.email}', '${u.name.replace(/'/g, "\\'")}')" class="px-2.5 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 hover:text-indigo-300 text-[10px] font-semibold rounded-lg border border-indigo-500/15 transition-all btn-press cursor-pointer flex items-center gap-1 ml-auto">
                            <i data-lucide="pencil" class="w-3 h-3"></i> Edit
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
            lucide.createIcons();
        } else {
            tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-white/30 text-xs">No users found.</td></tr>`;
        }
    } catch (err) {
        console.error("Failed to load SMTP configs:", err);
        const tbody = document.getElementById("admin-smtp-table-body");
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-red-400/60 text-xs">Failed to load configurations.</td></tr>`;
    }
}

async function openAdminSettingsModal(email, name) {
    document.getElementById("admin-settings-title").textContent = `Edit SMTP Config: ${name}`;
    document.getElementById("admin-settings-email").value = email;
    
    document.getElementById("admin-cfg-sender-email").value = "";
    document.getElementById("admin-cfg-cc-emails").value = "";
    document.getElementById("admin-cfg-app-password").value = "";
    document.getElementById("admin-cfg-sig-name").value = "";
    document.getElementById("admin-cfg-sig-title").value = "";
    document.getElementById("admin-cfg-sig-phone").value = "";
    document.getElementById("admin-cfg-sig-email").value = "";
    
    const addr = document.getElementById("admin-cfg-sig-addr");
    addr.value = "3rd Floor, CTS-796-A | Fleet Bldg. Opp, Marol Fire Station, Marol, Andheri (East)| Mumbai MH 400059";
    addr.readOnly = true;
    
    try {
        const response = await fetchWithAuth(`/api/settings?email=${encodeURIComponent(email)}`);
        const data = await response.json();
        
        document.getElementById("admin-cfg-sender-email").value = data.sender_email || "";
        document.getElementById("admin-cfg-cc-emails").value = data.cc_emails || "";
        document.getElementById("admin-cfg-app-password").value = data.app_password || "";
        document.getElementById("admin-cfg-sig-name").value = data.signature_name || name;
        document.getElementById("admin-cfg-sig-title").value = data.signature_title || "Associate Program Manager";
        document.getElementById("admin-cfg-sig-phone").value = data.signature_phone || "";
        document.getElementById("admin-cfg-sig-email").value = data.signature_email || email;
    } catch (err) {
        console.error("Failed to fetch settings:", err);
    }
    
    document.getElementById("admin-settings-modal").classList.remove("hidden");
    lucide.createIcons();
}

function closeAdminSettingsModal() {
    document.getElementById("admin-settings-modal").classList.add("hidden");
}

document.getElementById("admin-settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("admin-settings-email").value;
    const sender_email = document.getElementById("admin-cfg-sender-email").value.trim();
    const cc_emails = document.getElementById("admin-cfg-cc-emails").value.trim();
    const app_password = document.getElementById("admin-cfg-app-password").value.trim();
    const signature_name = document.getElementById("admin-cfg-sig-name").value.trim();
    const signature_title = document.getElementById("admin-cfg-sig-title").value.trim();
    const signature_address = document.getElementById("admin-cfg-sig-addr").value.trim();
    const signature_phone = document.getElementById("admin-cfg-sig-phone").value.trim();
    const signature_email = document.getElementById("admin-cfg-sig-email").value.trim();
    
    const payload = {
        email,
        sender_email,
        cc_emails,
        app_password,
        signature_name,
        signature_title,
        signature_address,
        signature_phone,
        signature_email,
        test_mode: false  // Always live mode
    };
    
    const saveBtn = e.target.querySelector("button[type='submit']");
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving..."; }
    
    try {
        const response = await fetchWithAuth("/api/settings", {
            method: "POST",
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (data.status === "success") {
            closeAdminSettingsModal();
            loadSmtpConfigs();
            logToTerminal(`SMTP config updated for ${signature_name || email}.`, "success");
        } else {
            alert("Error saving settings: " + data.message);
        }
    } catch (err) {
        alert("Request failed: " + err.message);
    } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Save Configurations"; }
    }
});

// ── ACTIVITY LOGS FUNCTIONS ──
async function loadLogs() {
    try {
        const response = await fetchWithAuth("/api/admin/logs");
        const data = await response.json();
        if (data.status === "success") {
            allLogs = data.logs;
            filterLogs();
        }
    } catch (err) {
        console.error("Failed to load activity logs:", err);
    }
}

function filterLogs(resetPage = true) {
    if (resetPage === true) {
        currentLogsPage = 1;
    }

    const searchVal = document.getElementById("admin-logs-search").value.toLowerCase();
    const typeVal = document.getElementById("admin-logs-type-filter").value;
    const consoleEl = document.getElementById("admin-logs-console");
    const infoEl = document.getElementById("admin-logs-pagination-info");
    const buttonsEl = document.getElementById("admin-logs-pagination-buttons");
    
    consoleEl.innerHTML = "";
    if (buttonsEl) buttonsEl.innerHTML = "";
    
    let filtered = allLogs;
    
    if (typeVal !== "all") {
        filtered = filtered.filter(l => l.activity_type === typeVal);
    }
    
    if (searchVal) {
        filtered = filtered.filter(l => 
            (l.user_name && l.user_name.toLowerCase().includes(searchVal)) ||
            (l.email && l.email.toLowerCase().includes(searchVal)) ||
            (l.activity_details && l.activity_details.toLowerCase().includes(searchVal)) ||
            (l.activity_type && l.activity_type.toLowerCase().includes(searchVal))
        );
    }
    
    const totalLogs = filtered.length;
    
    if (totalLogs === 0) {
        consoleEl.innerHTML = "<p class='text-white/30 italic text-center py-4'>No matching log entries found.</p>";
        if (infoEl) infoEl.innerText = "Showing 0-0 of 0 logs";
        return;
    }
    
    const totalPages = Math.ceil(totalLogs / logsPerPage) || 1;
    if (currentLogsPage > totalPages) currentLogsPage = totalPages;
    if (currentLogsPage < 1) currentLogsPage = 1;
    
    const startIndex = (currentLogsPage - 1) * logsPerPage;
    const endIndex = Math.min(startIndex + logsPerPage, totalLogs);
    
    if (infoEl) {
        infoEl.innerText = `Showing ${startIndex + 1}-${endIndex} of ${totalLogs} logs`;
    }
    
    const pageLogs = filtered.slice(startIndex, endIndex);
    
    pageLogs.forEach(log => {
        const date = new Date(log.timestamp);
        const formattedTime = date.toLocaleString();
        
        const logLine = document.createElement("div");
        logLine.className = "py-1.5 border-b border-white/[0.04] last:border-0 flex justify-between items-start gap-4 hover:bg-white/[0.01]";
        
        let typeColor = "text-[#EE2C3C]";
        if (log.activity_type.includes("Login")) typeColor = "text-green-400";
        if (log.activity_type.includes("Failed")) typeColor = "text-red-400";
        if (log.activity_type.includes("Sync")) typeColor = "text-indigo-400";
        
        logLine.innerHTML = `
            <div class="min-w-0 flex-1">
                <span class="text-white/20 select-none">[${formattedTime}]</span>
                <span class="${typeColor} font-bold select-none">[${log.activity_type}]</span>
                <span class="text-white/80">${log.activity_details}</span>
            </div>
            <span class="text-white/30 text-[9px] font-semibold flex-shrink-0 bg-white/5 px-2 py-0.5 rounded">${
                log.user_name ? `${log.user_name} (${log.role})` : 'System'
            }</span>
        `;
        consoleEl.appendChild(logLine);
    });
    
    // Render pagination buttons
    if (buttonsEl) {
        // Prev button
        const prevBtn = document.createElement("button");
        prevBtn.type = "button";
        prevBtn.disabled = currentLogsPage === 1;
        prevBtn.className = currentLogsPage === 1
            ? "px-2 py-1 bg-white/[0.02] text-white/20 rounded border border-white/[0.02] cursor-not-allowed text-[9px]"
            : "px-2 py-1 bg-white/5 hover:bg-white/10 rounded border border-white/5 cursor-pointer text-[9px] font-semibold transition-all btn-press text-white/85";
        prevBtn.innerText = "Prev";
        prevBtn.onclick = () => goToLogsPage(currentLogsPage - 1);
        buttonsEl.appendChild(prevBtn);
        
        // Page numbers
        let startPage = Math.max(1, currentLogsPage - 2);
        let endPage = Math.min(totalPages, startPage + 4);
        if (endPage - startPage < 4) {
            startPage = Math.max(1, endPage - 4);
        }
        
        for (let p = startPage; p <= endPage; p++) {
            const pBtn = document.createElement("button");
            pBtn.type = "button";
            pBtn.className = p === currentLogsPage
                ? "px-2.5 py-1 bg-[#EE2C3C] text-white rounded border border-[#EE2C3C] text-[9px] font-bold btn-press cursor-pointer"
                : "px-2.5 py-1 bg-white/5 hover:bg-white/10 rounded border border-white/5 cursor-pointer text-[9px] font-semibold transition-all btn-press text-white/80";
            pBtn.innerText = p;
            pBtn.onclick = () => goToLogsPage(p);
            buttonsEl.appendChild(pBtn);
        }
        
        // Next button
        const nextBtn = document.createElement("button");
        nextBtn.type = "button";
        nextBtn.disabled = currentLogsPage === totalPages;
        nextBtn.className = currentLogsPage === totalPages
            ? "px-2 py-1 bg-white/[0.02] text-white/20 rounded border border-white/[0.02] cursor-not-allowed text-[9px]"
            : "px-2 py-1 bg-white/5 hover:bg-white/10 rounded border border-white/5 cursor-pointer text-[9px] font-semibold transition-all btn-press text-white/85";
        nextBtn.innerText = "Next";
        nextBtn.onclick = () => goToLogsPage(currentLogsPage + 1);
        buttonsEl.appendChild(nextBtn);
    }
}

function goToLogsPage(page) {
    currentLogsPage = page;
    filterLogs(false);
}

async function clearSystemLogs() {
    const confirmClear = confirm("Are you sure you want to permanently clear all system activity logs? Only Admin can do this.");
    if (!confirmClear) return;
    
    try {
        const response = await fetchWithAuth("/api/admin/logs", { method: "DELETE" });
        const data = await response.json();
        if (data.status === "success") {
            alert("Logs cleared successfully.");
            loadLogs();
        } else {
            alert("Error: " + data.message);
        }
    } catch (err) {
        alert("Request failed: " + err.message);
    }
}

// ── DASHBOARD ANALYTICS FUNCTIONS ──
function filterDashboardStats(range) {
    loadDashboardStats(range);
}

async function loadDashboardStats(range = "today") {
    const ranges = ["today", "weekly"];
    ranges.forEach(r => {
        const btn = document.getElementById(`dash-filter-${r}`);
        if (btn) {
            btn.className = r === range 
                ? "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold text-white bg-[#EE2C3C] transition-all cursor-pointer" 
                : "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold text-white/60 hover:text-white transition-all cursor-pointer";
        }
    });
    
    try {
        let url = `/api/admin/dashboard-stats?range=${range}`;
        if (range === "custom") {
            const startVal = document.getElementById("dash-start-date").value;
            const endVal = document.getElementById("dash-end-date").value;
            if (!startVal || !endVal) {
                alert("Please select both start and end dates.");
                return;
            }
            url += `&start_date=${startVal}&end_date=${endVal}`;
        }
        const response = await fetchWithAuth(url);
        const data = await response.json();
            // Save dashboard history globally
            dashboardHistory = data.history || [];
            
            const m = data.metrics;
            document.getElementById("dash-stat-total").innerText = m.total_emails;
            document.getElementById("dash-stat-sent").innerText = m.total_sent;
            document.getElementById("dash-stat-failed").innerText = m.total_failed;
            document.getElementById("dash-stat-rate").innerText = m.success_rate + "%";
            
            document.getElementById("dash-users-total").innerText = m.total_users;
            document.getElementById("dash-users-coadmins").innerText = m.active_coadmins;
            document.getElementById("dash-users-active").innerText = m.active_users;
            
            document.getElementById("dash-act-syncs").innerText = m.sync_operations;
            document.getElementById("dash-act-drafts").innerText = m.draft_generations;
            document.getElementById("dash-act-bulks").innerText = m.bulk_sends;
            
            const tbody = document.getElementById("admin-spoc-stats-body");
            tbody.innerHTML = "";
            
            if (data.spoc_stats.length === 0) {
                tbody.innerHTML = "<tr><td colspan='5' class='p-4 text-center text-white/30 italic'>No email transmission history.</td></tr>";
            } else {
                data.spoc_stats.forEach(spoc => {
                    const total = spoc.sent + spoc.failed;
                    const rate = total > 0 ? Math.round((spoc.sent / total) * 100) : 100;
                    
                    const tr = document.createElement("tr");
                    tr.className = "border-b border-white/5 hover:bg-white/[0.02] cursor-pointer transition-colors group";
                    tr.title = `Click to view transmission history for ${spoc.name}`;
                    tr.onclick = () => showSpocHistoryModal(spoc.email, spoc.name);
                    tr.innerHTML = `
                        <td class="p-2.5 pl-4 font-semibold text-white flex items-center gap-1.5">
                            <i data-lucide="eye" class="w-3.5 h-3.5 text-white/20 group-hover:text-white/60"></i>
                            <span>${spoc.name}</span>
                        </td>
                        <td class="p-2.5 text-white/50 font-mono">${spoc.email}</td>
                        <td class="p-2.5 text-green-400 font-bold">${spoc.sent}</td>
                        <td class="p-2.5 text-red-400 font-bold">${spoc.failed}</td>
                        <td class="p-2.5 pr-4 text-right">
                            <span class="font-bold text-white font-mono">${rate}%</span>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            }
            lucide.createIcons();
    } catch (err) {
        console.error("Failed to load dashboard metrics:", err);
    }
}

async function resetDashboardMetrics() {
    const confirmReset = confirm("Are you sure you want to reset all system dashboard metrics? This will clear all logged email history. Only Admins can do this.");
    if (!confirmReset) return;
    
    try {
        const response = await fetchWithAuth("/api/admin/dashboard-stats", { method: "DELETE" });
        const data = await response.json();
        if (data.status === "success") {
            alert("Dashboard metrics reset successfully.");
            loadDashboardStats("today");
        } else {
            alert("Error: " + data.message);
        }
    } catch (err) {
        alert("Request failed: " + err.message);
    }
}

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    checkSession();
    clearTerminal();
    loadSmeStatuses();
    sessionAppPassword = getStoredAppPassword();
    initPreviews();
    loadReport();
    
    const startPop = document.getElementById("start-datepicker");
    if (startPop) startPop.addEventListener("click", (e) => e.stopPropagation());
    const endPop = document.getElementById("end-datepicker");
    if (endPop) endPop.addEventListener("click", (e) => e.stopPropagation());
    
    document.getElementById("login-form").addEventListener("submit", handleLogin);
    
    const cfgPwd = document.getElementById("cfg-app-password");
    if (cfgPwd) {
        cfgPwd.addEventListener("input", () => {
            const verifyStatus = document.getElementById("verify-status");
            if (verifyStatus) verifyStatus.classList.add("hidden");
        });
    }
    const cfgSender = document.getElementById("cfg-sender-email");
    if (cfgSender) {
        cfgSender.addEventListener("input", () => {
            const verifyStatus = document.getElementById("verify-status");
            if (verifyStatus) verifyStatus.classList.add("hidden");
        });
    }
});

// SPOC History Modal functions
function formatTimestamp(tsStr) {
    if (!tsStr || tsStr === "N/A") return "N/A";
    try {
        const date = new Date(tsStr);
        if (isNaN(date.getTime())) return tsStr;
        
        const day = date.getDate();
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const month = months[date.getMonth()];
        const year = date.getFullYear();
        
        let hours = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        
        return `${day} ${month} ${year}, ${hours}:${minutes} ${ampm}`;
    } catch (e) {
        return tsStr;
    }
}

function showSpocHistoryModal(email, name) {
    const modal = document.getElementById("spoc-history-modal");
    if (!modal) return;
    
    document.getElementById("spoc-history-title").innerText = `Transmission History — ${name}`;
    document.getElementById("spoc-history-email").innerText = email;
    
    // Filter dashboard history for this SPOC
    const spocHistory = dashboardHistory.filter(h => h.spoc_email && h.spoc_email.toLowerCase() === email.toLowerCase());
    
    // Calculate stats
    const total = spocHistory.length;
    const success = spocHistory.filter(h => h.status === "Success").length;
    const failed = total - success;
    
    document.getElementById("spoc-history-stat-total").innerText = total;
    document.getElementById("spoc-history-stat-success").innerText = success;
    document.getElementById("spoc-history-stat-failed").innerText = failed;
    
    const tbody = document.getElementById("spoc-history-table-body");
    tbody.innerHTML = "";
    
    if (spocHistory.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-white/30 italic">No transmissions found for this SPOC.</td></tr>`;
    } else {
        spocHistory.forEach(h => {
            const tr = document.createElement("tr");
            tr.className = "border-b border-white/5 hover:bg-white/[0.01]";
            
            let statusClass = "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20";
            if (h.status === "Success") statusClass = "bg-green-500/10 text-green-400 border border-green-500/20";
            if (h.status === "Failed") statusClass = "bg-red-500/10 text-red-400 border border-red-500/20";
            
            const timeStr = formatTimestamp(h.sent_at || h.created_at);
            
            tr.innerHTML = `
                <td class="p-3 pl-4 font-semibold text-white truncate max-w-[110px] sm:max-w-[180px]" title="${h.recipient_email}">${h.recipient_email}</td>
                <td class="p-3 text-white/60 truncate max-w-[130px] sm:max-w-[280px]" title="${h.subject}">${h.subject}</td>
                <td class="p-3">
                    <span class="${statusClass} text-[8px] px-2 py-0.5 rounded-full font-mono font-semibold uppercase">${h.status}</span>
                </td>
                <td class="p-3 pr-4 text-right font-mono text-white/40 text-[9px] whitespace-nowrap">${timeStr}</td>
            `;
            tbody.appendChild(tr);
        });
    }
    
    modal.classList.remove("hidden");
    lucide.createIcons();
}

function closeSpocHistoryModal() {
    const modal = document.getElementById("spoc-history-modal");
    if (modal) modal.classList.add("hidden");
}

// Light/Dark Theme controls
function initTheme() {
    const savedTheme = localStorage.getItem("theme") || "dark";
    if (savedTheme === "light") {
        document.documentElement.classList.remove("dark");
        document.documentElement.classList.add("light");
        
        const sunIcon = document.getElementById("theme-sun-icon");
        const moonIcon = document.getElementById("theme-moon-icon");
        if (sunIcon) sunIcon.classList.remove("hidden");
        if (moonIcon) moonIcon.classList.add("hidden");
    } else {
        document.documentElement.classList.add("dark");
        document.documentElement.classList.remove("light");
        
        const sunIcon = document.getElementById("theme-sun-icon");
        const moonIcon = document.getElementById("theme-moon-icon");
        if (sunIcon) sunIcon.classList.add("hidden");
        if (moonIcon) moonIcon.classList.remove("hidden");
    }
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function toggleTheme() {
    const currentTheme = document.documentElement.classList.contains("light") ? "light" : "dark";
    if (currentTheme === "light") {
        localStorage.setItem("theme", "dark");
    } else {
        localStorage.setItem("theme", "light");
    }
    initTheme();
}
