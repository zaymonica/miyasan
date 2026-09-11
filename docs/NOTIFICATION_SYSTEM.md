# Notification System Documentation

## Overview

The Notification System allows the SuperAdmin to send automated notifications to tenants via Email. Notifications are triggered by various events such as:

> **Note:** WhatsApp notifications are temporarily disabled. The code is commented out and can be reactivated in a future update. Only email notifications are currently active.

- **Welcome**: When a tenant creates an account
- **Password Reset**: When a tenant requests password reset
- **Payment Confirmation**: When a payment is confirmed
- **Plan Expiring Soon**: Configurable days before plan expiration
- **Plan Expired**: Configurable days after plan expiration
- **Account Suspended**: When account is suspended
- **Account Reactivated**: When account is reactivated

## Database Tables

### email_notification_settings
Stores SMTP configuration for email notifications.

| Column | Type | Description |
|--------|------|-------------|
| id | INT | Primary key |
| smtp_host | VARCHAR(255) | SMTP server host |
| smtp_port | INT | SMTP server port |
| smtp_secure | BOOLEAN | Use SSL/TLS |
| smtp_user | VARCHAR(255) | SMTP username |
| smtp_password | VARCHAR(255) | SMTP password |
| from_email | VARCHAR(255) | Sender email |
| from_name | VARCHAR(255) | Sender name |
| enabled | BOOLEAN | Enable/disable email notifications |

### whatsapp_notification_settings
Stores WhatsApp connection settings.

| Column | Type | Description |
|--------|------|-------------|
| id | INT | Primary key |
| phone_number | VARCHAR(20) | Connected phone number |
| session_name | VARCHAR(100) | WhatsApp session name |
| enabled | BOOLEAN | Enable/disable WhatsApp notifications |
| connected | BOOLEAN | Connection status |
| last_connected_at | TIMESTAMP | Last connection time |

### email_notification_templates
Stores email notification templates.

| Column | Type | Description |
|--------|------|-------------|
| id | INT | Primary key |
| template_key | VARCHAR(100) | Unique template identifier |
| template_name | VARCHAR(255) | Display name |
| category | ENUM | tenant, subscription, security, system |
| subject | VARCHAR(500) | Email subject |
| body | TEXT | Plain text body |
| html_body | TEXT | HTML body |
| variables | JSON | Available placeholders |
| enabled | BOOLEAN | Enable/disable template |

### whatsapp_notification_templates
Stores WhatsApp notification templates.

| Column | Type | Description |
|--------|------|-------------|
| id | INT | Primary key |
| template_key | VARCHAR(100) | Unique template identifier |
| template_name | VARCHAR(255) | Display name |
| category | ENUM | tenant, subscription, security, system |
| message | TEXT | WhatsApp message |
| variables | JSON | Available placeholders |
| enabled | BOOLEAN | Enable/disable template |

### plan_expiration_settings
Stores plan expiration reminder configuration.

| Column | Type | Description |
|--------|------|-------------|
| id | INT | Primary key |
| days_before_1-4 | INT | Days before expiration (0-7) |
| days_after_1-3 | INT | Days after expiration (0-7) |
| enabled | BOOLEAN | Enable/disable reminders |

### notification_logs
Stores notification history.

| Column | Type | Description |
|--------|------|-------------|
| id | INT | Primary key |
| tenant_id | INT | Target tenant |
| notification_type | ENUM | email, whatsapp |
| template_key | VARCHAR(100) | Template used |
| recipient | VARCHAR(255) | Recipient address/phone |
| subject | VARCHAR(500) | Email subject |
| message | TEXT | Message content |
| status | ENUM | pending, sent, failed |
| error_message | TEXT | Error details if failed |
| sent_at | TIMESTAMP | When sent |

## API Routes

### Email Notifications

#### GET /api/superadmin/notifications/email/settings
Get email SMTP settings.

**Response:**
```json
{
  "success": true,
  "data": {
    "smtp_host": "smtp.gmail.com",
    "smtp_port": 587,
    "smtp_secure": false,
    "smtp_user": "user@gmail.com",
    "from_email": "noreply@domain.com",
    "from_name": "Misayan SaaS",
    "enabled": true
  }
}
```

#### PUT /api/superadmin/notifications/email/settings
Update email SMTP settings.

**Request Body:**
```json
{
  "smtp_host": "smtp.gmail.com",
  "smtp_port": 587,
  "smtp_secure": false,
  "smtp_user": "user@gmail.com",
  "smtp_password": "password",
  "from_email": "noreply@domain.com",
  "from_name": "Misayan SaaS",
  "enabled": true
}
```

#### POST /api/superadmin/notifications/email/test
Send test email.

**Request Body:**
```json
{
  "smtp_host": "smtp.gmail.com",
  "smtp_port": 587,
  "smtp_secure": false,
  "smtp_user": "user@gmail.com",
  "smtp_password": "password",
  "from_email": "noreply@domain.com",
  "test_recipient": "test@example.com"
}
```

#### GET /api/superadmin/notifications/email/templates
Get all email templates.

**Query Parameters:**
- `category` (optional): Filter by category

#### PUT /api/superadmin/notifications/email/templates/:id
Update email template.

**Request Body:**
```json
{
  "subject": "New Subject",
  "body": "Plain text body",
  "html_body": "<h1>HTML body</h1>",
  "enabled": true
}
```

### WhatsApp Notifications (Temporarily Disabled)

> **Note:** WhatsApp notifications are temporarily disabled. The following API routes exist but are not accessible from the SuperAdmin UI. The code is commented out and can be reactivated in a future update.

#### GET /api/superadmin/notifications/whatsapp/status
Get WhatsApp connection status.

**Response:**
```json
{
  "success": true,
  "data": {
    "connected": true,
    "qrCode": null,
    "phoneNumber": "5511999999999",
    "lastConnected": "2024-12-21T10:00:00Z",
    "enabled": true
  }
}
```

#### POST /api/superadmin/notifications/whatsapp/init
Initialize WhatsApp connection (generates QR code).

#### POST /api/superadmin/notifications/whatsapp/disconnect
Disconnect WhatsApp.

#### GET /api/superadmin/notifications/whatsapp/templates
Get all WhatsApp templates.

#### PUT /api/superadmin/notifications/whatsapp/templates/:id
Update WhatsApp template.

**Request Body:**
```json
{
  "message": "New message with *bold* text",
  "enabled": true
}
```

#### POST /api/superadmin/notifications/whatsapp/test
Send test WhatsApp message.

**Request Body:**
```json
{
  "phone_number": "5511999999999",
  "message": "Test message"
}
```

### Expiration Settings

#### GET /api/superadmin/notifications/expiration-settings
Get plan expiration reminder settings.

#### PUT /api/superadmin/notifications/expiration-settings
Update plan expiration reminder settings.

**Request Body:**
```json
{
  "days_before_1": 7,
  "days_before_2": 3,
  "days_before_3": 1,
  "days_before_4": 0,
  "days_after_1": 1,
  "days_after_2": 3,
  "days_after_3": 7,
  "enabled": true
}
```

### Notification Logs

#### GET /api/superadmin/notifications/logs
Get notification history.

**Query Parameters:**
- `type` (optional): email, whatsapp
- `status` (optional): pending, sent, failed
- `page` (optional): Page number
- `limit` (optional): Items per page

## Template Variables

### Welcome Template
- `{{tenant_name}}` - Tenant name
- `{{platform_name}}` - Platform name
- `{{subdomain}}` - Tenant subdomain
- `{{plan_name}}` - Plan name
- `{{login_url}}` - Login URL

### Password Reset Template
- `{{tenant_name}}` - Tenant name
- `{{reset_link}}` - Password reset link
- `{{expiry_hours}}` - Link expiration hours

### Payment Confirmation Template
- `{{tenant_name}}` - Tenant name
- `{{plan_name}}` - Plan name
- `{{amount}}` - Payment amount
- `{{payment_date}}` - Payment date
- `{{next_billing_date}}` - Next billing date

### Plan Expiring Soon Template
- `{{tenant_name}}` - Tenant name
- `{{plan_name}}` - Plan name
- `{{days_remaining}}` - Days until expiration
- `{{expiry_date}}` - Expiration date
- `{{renewal_link}}` - Renewal link

### Plan Expired Template
- `{{tenant_name}}` - Tenant name
- `{{plan_name}}` - Plan name
- `{{expiry_date}}` - Expiration date
- `{{renewal_link}}` - Renewal link
- `{{grace_days}}` - Grace period days

### Account Suspended Template
- `{{tenant_name}}` - Tenant name
- `{{suspension_reason}}` - Suspension reason
- `{{support_email}}` - Support email

### Account Reactivated Template
- `{{tenant_name}}` - Tenant name
- `{{plan_name}}` - Plan name
- `{{login_url}}` - Login URL

## Security

- All routes require SuperAdmin authentication
- SMTP passwords are never returned in API responses
- WhatsApp uses tenant ID 0 for SuperAdmin notifications
- All notifications are logged for audit purposes

## i18n Support

All UI text uses `data-i18n` attributes for translation support:
- English translations in `locales/en.json`
- Portuguese translations in `locales/pt.json`

## RTL Support

The notification pages fully support RTL (Right-to-Left) layouts for languages like Arabic and Hebrew.
