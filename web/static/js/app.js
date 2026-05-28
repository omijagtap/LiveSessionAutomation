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
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

// Format Date for Display (e.g. 24 May 2026)
function formatDateDisplay(date) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
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
        const response = await fetch("/api/get-sheet-dates");
        const data = await response.json();
        if (data.status === "success") {
            if (data.start_date) {
                const parts = data.start_date.split("-");
                selectedStartDate = new Date(parts[0], parts[1] - 1, parts[2]);
                document.getElementById("start_date").value = data.start_date;
                document.getElementById("start-date-text").innerText = formatDateDisplay(selectedStartDate);
                currentStartCalDate = new Date(selectedStartDate);
            }
            if (data.end_date) {
                const parts = data.end_date.split("-");
                selectedEndDate = new Date(parts[0], parts[1] - 1, parts[2]);
                document.getElementById("end_date").value = data.end_date;
                document.getElementById("end-date-text").innerText = formatDateDisplay(selectedEndDate);
                currentEndCalDate = new Date(selectedEndDate);
            }
            logToTerminal(`Loaded dates: ${data.start_date || 'None'} to ${data.end_date || 'None'}`, "info");
        }
    } catch (err) {
        logToTerminal(`Could not fetch dates: ${err.message}`, "warning");
    }
}

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
    fetchConfig();
    fetchSheetDates();
    clearTerminal();
    loadSmeStatuses();
    sessionAppPassword = getStoredAppPassword();
    initPreviews();
    checkOnboardingNotice();
    loadReport();
    logToTerminal("System ready. Configure credentials and select date range.", "info");
    
    // Prevent datepicker popup clicks from bubbling to document (which closes them)
    const startPop = document.getElementById("start-datepicker");
    if (startPop) startPop.addEventListener("click", (e) => e.stopPropagation());
    const endPop = document.getElementById("end-datepicker");
    if (endPop) endPop.addEventListener("click", (e) => e.stopPropagation());
    
    // Automatically open settings if not onboarded
    if (!isOnboarded() || !getStoredSenderEmail() || !getStoredSigName()) {
        openSettingsModal();
    }
});

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
        const response = await fetch("/api/verify-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
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

// Password visibility toggle
function togglePasswordVisibility() {
    const input = document.getElementById("cfg-app-password");
    const icon = document.getElementById("pwd-eye-icon");
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

// Fetch configuration from server
async function fetchConfig() {
    try {
        const response = await fetch("/api/config");
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

        // Populate test mode checkbox
        const testModeInput = document.getElementById("cfg-test-mode");
        if (testModeInput) {
            testModeInput.checked = configData.TEST_MODE !== false;
        }

        // Show/hide visual redirect active badge
        const testRedirectBadge = document.getElementById("test-redirect-badge");
        if (testRedirectBadge) {
            if (configData.TEST_MODE !== false) {
                testRedirectBadge.classList.remove("hidden");
                testRedirectBadge.classList.add("inline-flex");
            } else {
                testRedirectBadge.classList.remove("inline-flex");
                testRedirectBadge.classList.add("hidden");
            }
        }

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
    document.getElementById("cfg-app-password").value = getStoredAppPassword();
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

    // Save only system parameters to server
    const payload = {
        BASE_SHEET_URL: configData.BASE_SHEET_URL || "",
        TAB_NAME: configData.TAB_NAME || "",
        TEST_MODE: document.getElementById("cfg-test-mode").checked
    };

    try {
        const response = await fetch("/api/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
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
        const response = await fetch("/api/fetch-sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
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
            
            // Populate stats
            document.getElementById("stat-sessions").innerText = data.total_sessions;
            document.getElementById("stat-graders").innerText = smeEmails.length;
            
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
            
            // Initialize Dashboard Chart
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
    const resetStatusesBtn = document.getElementById("btn-reset-statuses");
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
        if (resetStatusesBtn) resetStatusesBtn.classList.add("hidden");
        lucide.createIcons();
        return;
    }
    
    if (oboStartBtn) oboStartBtn.classList.remove("hidden");
    if (bulkStartBtn) bulkStartBtn.classList.remove("hidden");
    if (resetStatusesBtn) resetStatusesBtn.classList.remove("hidden");
    
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
            
        const card = document.createElement("div");
        card.className = "bg-white/[0.02] border border-white/5 rounded-2xl p-4 hover:border-[#EE2C3C]/30 hover:bg-white/[0.04] transition-all flex flex-col justify-between space-y-3 card-shine text-left relative min-h-[195px] cursor-pointer group";
        card.onclick = () => openOboModalForEmail(email);
        
        card.innerHTML = `
            <div class="space-y-1.5 flex-1 flex flex-col justify-between">
                <div>
                    <div class="flex justify-between items-start gap-2">
                        <h4 class="text-xs font-bold text-white truncate max-w-[150px] group-hover:text-[#EE2C3C] transition-colors">${info.name}</h4>
                        <span class="bg-white/5 text-white/70 text-[9px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0">${info.sessions.length} sessions</span>
                    </div>
                    <p class="text-[9px] text-white/40 truncate">${info.email}</p>
                    <p class="text-[9.5px] text-indigo-400 font-semibold mt-1 flex items-center gap-1">
                        <i data-lucide="user-check" class="w-3 h-3 opacity-70"></i>
                        <span>SPOC: ${info.spoc_display || 'N/A'}</span>
                    </p>
                </div>
                
                <div class="space-y-1 mt-1">
                    <div class="text-[9px] text-white/50 font-semibold truncate">Subject: ${info.subject}</div>
                    <div class="text-[10px] text-white/40 line-clamp-3 leading-relaxed mt-1 font-light italic">
                        "${bodySnippet}"
                    </div>
                </div>
            </div>
            
            <div class="flex items-center justify-between pt-3 border-t border-white/5 gap-2 flex-shrink-0">
                <span class="${statusClass} text-[8px] px-2 py-0.5 rounded-full font-mono font-medium">${status}</span>
                <span class="text-[9px] text-white/30 group-hover:text-white/60 transition-colors flex items-center gap-1">
                    Review & Send <i data-lucide="chevron-right" class="w-3 h-3"></i>
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
    
    // Set mock inbox headers dynamically from config
    document.getElementById("obo-modal-header-from-name").innerText = getStoredSigName() || "Team";
    const senderEmail = getStoredSenderEmail();
    document.getElementById("obo-modal-header-from-email").innerText = senderEmail ? `<${senderEmail}>` : "";
    
    // Dynamically set avatar initial
    const avatar = document.getElementById("obo-modal-header-avatar");
    if (avatar) {
        const firstLetter = (getStoredSigName() || "Team").trim().charAt(0).toUpperCase();
        avatar.innerText = firstLetter;
    }
    
    const headerTo = document.getElementById("obo-modal-header-to");
    if (headerTo) headerTo.innerText = info.email;
    
    const headerSub = document.getElementById("obo-modal-header-subject");
    if (headerSub) headerSub.innerText = info.subject;
    
    // Only reset the subject field when switching to a different draft
    // (preserve user edits if re-rendering the same draft e.g. after send)
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
    
    // Check if App Password is set for session
    if (!sessionAppPassword) {
        showPasswordPopup(() => {
            oboModalSendCurrent();
        });
        return;
    }
    
    const email = smeEmails[oboIndex];
    const info = gradersData[email];
    
    const to = document.getElementById("obo-modal-to").value;
    const subject = document.getElementById("obo-modal-subject").value;
    const body_html = info.body_html;
    const sentAt = new Date().toLocaleString();
    
    const btn = document.getElementById("obo-modal-send-btn");
    btn.disabled = true;
    btn.innerText = "Sending...";
    
    logToTerminal(`Transmitting email to ${info.name} (${to})...`, "info");
    
    try {
        const response = await fetch("/api/send-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                to, 
                cc: getStoredCcEmails(),
                subject, 
                body_html,
                sender_email: getStoredSenderEmail(),
                sender_password: sessionAppPassword,
                sender_name: getStoredSigName() || "Team",
                spoc_email: info.spoc_email_display || ""
            })
        });
        const result = await response.json();
        
        if (result.status === "success") {
            logToTerminal(`Successfully transmitted reminder to ${info.name}!`, "success");
            reportData.push({ name: info.name, email: to, status: "Success", details: "Sent via SMTP", sentAt });
            setGraderStatus(email, "Sent");
        } else {
            logToTerminal(`Send failed: ${result.message}`, "error");
            reportData.push({ name: info.name, email: to, status: "Failed", details: result.message, sentAt });
            setGraderStatus(email, "Failed");
        }
    } catch (err) {
        logToTerminal(`Connection error during send: ${err.message}`, "error");
        reportData.push({ name: info.name, email: to, status: "Failed", details: err.message, sentAt });
        setGraderStatus(email, "Failed");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="send" class="w-3.5 h-3.5"></i> Send Email';
        saveReport();    // persist immediately
        renderReport();  // update report tab instantly
        initPreviews();
        oboIndex++;
        oboModalRenderCurrent();
    }
}

// Navigation logic for obo modal

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
        const response = await fetch("/api/verify-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
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
        } else {
            let totalSessions = 0;
            smeEmails.forEach(email => {
                const grader = gradersData[email];
                if (grader && grader.sessions) {
                    totalSessions += grader.sessions.length;
                }
            });
            summarySpan.innerText = `(${smeEmails.length} profs, ${totalSessions} sessions assigned)`;
        }
    }
    
    // Reset One-by-One wizard
    oboIndex = 0;
    
    initPreviews();
    logToTerminal(`Filtered by SPOC: ${spoc}. Matches: ${smeEmails.length} professors.`, "info");
}

function updateFilteredStats() {
    let totalSessions = 0;
    smeEmails.forEach(email => {
        const grader = gradersData[email];
        if (grader && grader.sessions) {
            totalSessions += grader.sessions.length;
        }
    });
    
    document.getElementById("stat-sessions").innerText = totalSessions;
    document.getElementById("stat-graders").innerText = smeEmails.length;
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

function resetAllStatuses() {
    const confirmReset = confirm("Are you sure you want to reset all email statuses and clear the execution report?");
    if (!confirmReset) return;
    
    smeStatuses = {};
    reportData = [];
    localStorage.removeItem(LS_SME_STATUSES);
    localStorage.removeItem(LS_REPORT);
    
    // Hide report tab
    document.getElementById("btn-tab-report").classList.add("hidden");
    if (currentTab === "tab-report") {
        switchTab("tab-preview");
    }
    
    initPreviews();
    logToTerminal("Statuses and reports reset successfully.", "info");
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
    
    // Set mock headers
    document.getElementById("bulk-modal-header-from-name").innerText = getStoredSigName() || "Mukhtar Ali Sayyed";
    document.getElementById("bulk-modal-header-from-email").innerText = `<${getStoredSenderEmail() || "Mukhtar.sayyed@upgrad.com"}>`;
    
    // Set avatar
    const avatar = document.getElementById("bulk-modal-header-avatar");
    if (avatar) {
        const firstLetter = (getStoredSigName() || "Mukhtar Ali Sayyed").trim().charAt(0).toUpperCase();
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
        
        consoleLog.innerHTML += `<p class="text-white/60">> Queue [${i+1}/${bulkEmailsList.length}]: Connecting to send to ${info.name}...</p>`;
        consoleLog.scrollTop = consoleLog.scrollHeight;
        
        // Update stats progress
        const percent = Math.round(((i) / bulkEmailsList.length) * 100);
        progressText.innerText = `${i} / ${bulkEmailsList.length} Emails (${percent}%)`;
        
        try {
            const storedCc = getStoredCcEmails();
            const payload = {
                to: info.email,
                cc: storedCc,
                subject: info.subject,
                body_html: info.body_html,
                sender_email: getStoredSenderEmail(),
                sender_password: sessionAppPassword,
                sender_name: getStoredSigName() || "Team",
                spoc_email: info.spoc_email_display || ""
            };
            
            const response = await fetch("/api/send-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            
            if (result.status === "success") {
                consoleLog.innerHTML += `<p class="text-[#4ade80]">› Success: Email transmitted to ${info.email}.</p>`;
                reportData.push({ name: info.name, email: info.email, status: "Success", details: "Bulk sent", sentAt });
                setGraderStatus(email, "Sent");
            } else {
                consoleLog.innerHTML += `<p class="text-[#f87171]">› Failure: ${result.message}</p>`;
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
