/**
 * Timezone Settings Module
 * Handles timezone, date format, time format, and clock display
 */

let timezoneSettings = {
    timezone: 'UTC',
    date_format: 'YYYY-MM-DD',
    time_format: '24h',
    clock_enabled: false
};

let clockInterval = null;

// Common timezones list
const TIMEZONES = [
    { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
    { value: 'America/New_York', label: 'America/New_York (EST/EDT)' },
    { value: 'America/Chicago', label: 'America/Chicago (CST/CDT)' },
    { value: 'America/Denver', label: 'America/Denver (MST/MDT)' },
    { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PST/PDT)' },
    { value: 'America/Sao_Paulo', label: 'America/Sao_Paulo (BRT)' },
    { value: 'America/Argentina/Buenos_Aires', label: 'America/Buenos_Aires (ART)' },
    { value: 'America/Mexico_City', label: 'America/Mexico_City (CST)' },
    { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
    { value: 'Europe/Paris', label: 'Europe/Paris (CET/CEST)' },
    { value: 'Europe/Berlin', label: 'Europe/Berlin (CET/CEST)' },
    { value: 'Europe/Madrid', label: 'Europe/Madrid (CET/CEST)' },
    { value: 'Europe/Rome', label: 'Europe/Rome (CET/CEST)' },
    { value: 'Europe/Moscow', label: 'Europe/Moscow (MSK)' },
    { value: 'Asia/Dubai', label: 'Asia/Dubai (GST)' },
    { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST)' },
    { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT)' },
    { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST)' },
    { value: 'Asia/Shanghai', label: 'Asia/Shanghai (CST)' },
    { value: 'Asia/Hong_Kong', label: 'Asia/Hong_Kong (HKT)' },
    { value: 'Australia/Sydney', label: 'Australia/Sydney (AEST/AEDT)' },
    { value: 'Australia/Melbourne', label: 'Australia/Melbourne (AEST/AEDT)' },
    { value: 'Pacific/Auckland', label: 'Pacific/Auckland (NZST/NZDT)' }
];

const DATE_FORMATS = [
    { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (2024-12-22)' },
    { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (22/12/2024)' },
    { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (12/22/2024)' },
    { value: 'DD-MM-YYYY', label: 'DD-MM-YYYY (22-12-2024)' },
    { value: 'DD.MM.YYYY', label: 'DD.MM.YYYY (22.12.2024)' },
    { value: 'MMM DD, YYYY', label: 'MMM DD, YYYY (Dec 22, 2024)' },
    { value: 'DD MMM YYYY', label: 'DD MMM YYYY (22 Dec 2024)' }
];

const TIME_FORMATS = [
    { value: '24h', label: '24-hour (14:30:00)' },
    { value: '12h', label: '12-hour (2:30:00 PM)' }
];

/**
 * Initialize timezone settings on page load
 */
document.addEventListener('DOMContentLoaded', async function() {
    // Only load if user is authenticated (superadmin_token exists)
    const token = localStorage.getItem('superadmin_token');
    if (token) {
        // Wait for app to be fully initialized
        setTimeout(async () => {
            await loadTimezoneSettings();
        }, 1000);
    }
});

// Also expose init function for manual initialization
window.initTimezoneSettings = loadTimezoneSettings;

/**
 * Load timezone settings from server
 */
async function loadTimezoneSettings() {
    try {
        const token = localStorage.getItem('superadmin_token');
        if (!token) {
            console.log('No token found, skipping timezone settings load');
            return;
        }

        const response = await fetch('/api/superadmin/settings/timezone', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.status === 401) {
            console.log('Unauthorized, skipping timezone settings');
            return;
        }
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                timezoneSettings = data.data;
                updateClockToggle();
                if (timezoneSettings.clock_enabled) {
                    startClock();
                }
            }
        }
    } catch (error) {
        console.error('Error loading timezone settings:', error);
    }
}

/**
 * Update clock toggle checkbox state
 */
function updateClockToggle() {
    const toggle = document.getElementById('clockToggle');
    if (toggle) {
        toggle.checked = timezoneSettings.clock_enabled;
    }
}

/**
 * Toggle clock display
 */
async function toggleClockDisplay() {
    const toggle = document.getElementById('clockToggle');
    const enabled = toggle ? toggle.checked : false;
    
    try {
        const response = await fetch('/api/superadmin/settings/timezone', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('superadmin_token')}`
            },
            body: JSON.stringify({ clock_enabled: enabled })
        });
        
        if (response.ok) {
            timezoneSettings.clock_enabled = enabled;
            if (enabled) {
                startClock();
            } else {
                stopClock();
            }
        }
    } catch (error) {
        console.error('Error toggling clock:', error);
    }
}

/**
 * Start the clock display
 */
function startClock() {
    const clockEl = document.getElementById('headerClock');
    if (clockEl) {
        clockEl.style.display = 'flex';
    }
    
    updateClock();
    if (clockInterval) clearInterval(clockInterval);
    clockInterval = setInterval(updateClock, 1000);
}

/**
 * Stop the clock display
 */
function stopClock() {
    const clockEl = document.getElementById('headerClock');
    if (clockEl) {
        clockEl.style.display = 'none';
    }
    
    if (clockInterval) {
        clearInterval(clockInterval);
        clockInterval = null;
    }
}

/**
 * Update clock display
 */
function updateClock() {
    const now = new Date();
    const timeEl = document.getElementById('clockTime');
    const dateEl = document.getElementById('clockDate');
    
    if (!timeEl || !dateEl) return;
    
    try {
        // Format time based on timezone
        const timeOptions = {
            timeZone: timezoneSettings.timezone,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: timezoneSettings.time_format === '12h'
        };
        
        timeEl.textContent = now.toLocaleTimeString('en-US', timeOptions);
        
        // Format date based on settings
        dateEl.textContent = formatDateWithFormat(now, timezoneSettings.date_format, timezoneSettings.timezone);
    } catch (error) {
        // Fallback if timezone is invalid
        timeEl.textContent = now.toLocaleTimeString();
        dateEl.textContent = now.toLocaleDateString();
    }
}

/**
 * Format date according to format string (internal use for timezone module)
 */
function formatDateWithFormat(date, format, timezone) {
    const options = { timeZone: timezone };
    const parts = new Intl.DateTimeFormat('en-US', {
        ...options,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date);
    
    const dateObj = {};
    parts.forEach(p => {
        if (p.type === 'year') dateObj.YYYY = p.value;
        if (p.type === 'month') dateObj.MM = p.value;
        if (p.type === 'day') dateObj.DD = p.value;
    });
    
    // Get month name
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    dateObj.MMM = monthNames[parseInt(dateObj.MM) - 1];
    
    switch (format) {
        case 'YYYY-MM-DD':
            return `${dateObj.YYYY}-${dateObj.MM}-${dateObj.DD}`;
        case 'DD/MM/YYYY':
            return `${dateObj.DD}/${dateObj.MM}/${dateObj.YYYY}`;
        case 'MM/DD/YYYY':
            return `${dateObj.MM}/${dateObj.DD}/${dateObj.YYYY}`;
        case 'DD-MM-YYYY':
            return `${dateObj.DD}-${dateObj.MM}-${dateObj.YYYY}`;
        case 'DD.MM.YYYY':
            return `${dateObj.DD}.${dateObj.MM}.${dateObj.YYYY}`;
        case 'MMM DD, YYYY':
            return `${dateObj.MMM} ${dateObj.DD}, ${dateObj.YYYY}`;
        case 'DD MMM YYYY':
            return `${dateObj.DD} ${dateObj.MMM} ${dateObj.YYYY}`;
        default:
            return `${dateObj.YYYY}-${dateObj.MM}-${dateObj.DD}`;
    }
}

/**
 * Open Timezone Settings Modal
 */
async function openTimezoneSettingsModal() {
    // Load current settings
    await loadTimezoneSettings();
    
    // Build timezone options
    const timezoneOptions = TIMEZONES.map(tz => 
        `<option value="${tz.value}" ${timezoneSettings.timezone === tz.value ? 'selected' : ''}>${tz.label}</option>`
    ).join('');
    
    // Build date format options
    const dateFormatOptions = DATE_FORMATS.map(df => 
        `<option value="${df.value}" ${timezoneSettings.date_format === df.value ? 'selected' : ''}>${df.label}</option>`
    ).join('');
    
    // Build time format options
    const timeFormatOptions = TIME_FORMATS.map(tf => 
        `<option value="${tf.value}" ${timezoneSettings.time_format === tf.value ? 'selected' : ''}>${tf.label}</option>`
    ).join('');
    
    const modalHtml = `
        <div class="modal-overlay active" id="timezoneSettingsModal" onclick="closeTimezoneSettingsModal(event)">
            <div class="modal-dialog modal-lg" onclick="event.stopPropagation()">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3><i class="fas fa-clock"></i> <span data-i18n="timezone.settings_title">Timezone Settings</span></h3>
                        <button class="modal-close" onclick="closeTimezoneSettingsModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label data-i18n="timezone.timezone">System Timezone</label>
                            <select id="systemTimezone" class="form-control">
                                ${timezoneOptions}
                            </select>
                            <small class="form-text" data-i18n="timezone.timezone_help">Select the timezone for the system clock and scheduled tasks.</small>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group col-md-6">
                                <label data-i18n="timezone.date_format">Date Format</label>
                                <select id="dateFormat" class="form-control">
                                    ${dateFormatOptions}
                                </select>
                            </div>
                            <div class="form-group col-md-6">
                                <label data-i18n="timezone.time_format">Time Format</label>
                                <select id="timeFormat" class="form-control">
                                    ${timeFormatOptions}
                                </select>
                            </div>
                        </div>
                        
                        <div class="preview-section">
                            <h4 data-i18n="timezone.preview">Preview</h4>
                            <div class="preview-box" id="timezonePreview">
                                <div class="preview-time" id="previewTime">--:--:--</div>
                                <div class="preview-date" id="previewDate">----</div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="closeTimezoneSettingsModal()">
                            <i class="fas fa-times"></i> <span data-i18n="common.cancel">Cancel</span>
                        </button>
                        <button class="btn btn-primary" onclick="saveTimezoneSettings()">
                            <i class="fas fa-save"></i> <span data-i18n="common.save">Save</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('modalContainer').innerHTML = modalHtml;
    
    // Start preview update
    updateTimezonePreview();
    
    // Add change listeners for live preview
    document.getElementById('systemTimezone').addEventListener('change', updateTimezonePreview);
    document.getElementById('dateFormat').addEventListener('change', updateTimezonePreview);
    document.getElementById('timeFormat').addEventListener('change', updateTimezonePreview);
    
    // Apply translations
    if (window.i18n && window.i18n.translatePage) {
        window.i18n.translatePage();
    }
}

/**
 * Update timezone preview
 */
function updateTimezonePreview() {
    const timezone = document.getElementById('systemTimezone')?.value || 'UTC';
    const dateFormat = document.getElementById('dateFormat')?.value || 'YYYY-MM-DD';
    const timeFormat = document.getElementById('timeFormat')?.value || '24h';
    
    const now = new Date();
    const previewTimeEl = document.getElementById('previewTime');
    const previewDateEl = document.getElementById('previewDate');
    
    if (!previewTimeEl || !previewDateEl) return;
    
    try {
        const timeOptions = {
            timeZone: timezone,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: timeFormat === '12h'
        };
        
        previewTimeEl.textContent = now.toLocaleTimeString('en-US', timeOptions);
        previewDateEl.textContent = formatDateWithFormat(now, dateFormat, timezone);
    } catch (error) {
        previewTimeEl.textContent = 'Invalid timezone';
        previewDateEl.textContent = '';
    }
}

/**
 * Close Timezone Settings Modal
 */
function closeTimezoneSettingsModal(event) {
    if (event && event.target !== event.currentTarget) return;
    
    const modal = document.getElementById('timezoneSettingsModal');
    if (modal) {
        modal.remove();
    }
}

/**
 * Save Timezone Settings
 */
async function saveTimezoneSettings() {
    const timezone = document.getElementById('systemTimezone').value;
    const dateFormat = document.getElementById('dateFormat').value;
    const timeFormat = document.getElementById('timeFormat').value;
    
    try {
        const response = await fetch('/api/superadmin/settings/timezone', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('superadmin_token')}`
            },
            body: JSON.stringify({
                timezone,
                date_format: dateFormat,
                time_format: timeFormat
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            timezoneSettings.timezone = timezone;
            timezoneSettings.date_format = dateFormat;
            timezoneSettings.time_format = timeFormat;
            
            // Update clock if enabled
            if (timezoneSettings.clock_enabled) {
                updateClock();
            }
            
            showNotification('Timezone settings saved successfully', 'success');
            closeTimezoneSettingsModal();
        } else {
            showNotification(data.message || 'Error saving settings', 'error');
        }
    } catch (error) {
        console.error('Error saving timezone settings:', error);
        showNotification('Error saving settings', 'error');
    }
}

/**
 * Get current system timezone (for use by other modules)
 */
function getSystemTimezone() {
    return timezoneSettings.timezone;
}

/**
 * Format a date using system settings (for use by other modules)
 */
function formatSystemDate(date) {
    return formatDateWithFormat(new Date(date), timezoneSettings.date_format, timezoneSettings.timezone);
}

/**
 * Format a time using system settings (for use by other modules)
 */
function formatSystemTime(date) {
    const d = new Date(date);
    const options = {
        timeZone: timezoneSettings.timezone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: timezoneSettings.time_format === '12h'
    };
    return d.toLocaleTimeString('en-US', options);
}

// Export functions for global use
window.openTimezoneSettingsModal = openTimezoneSettingsModal;
window.closeTimezoneSettingsModal = closeTimezoneSettingsModal;
window.saveTimezoneSettings = saveTimezoneSettings;
window.toggleClockDisplay = toggleClockDisplay;
window.getSystemTimezone = getSystemTimezone;
window.formatSystemDate = formatSystemDate;
window.formatSystemTime = formatSystemTime;
