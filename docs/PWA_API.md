# PWA API Documentation

## Overview

The PWA (Progressive Web App) API provides endpoints for managing PWA settings, manifest, and icons. This enables the user panel to be installed as a native-like app on mobile devices.

## Endpoints

### GET /api/pwa/manifest

Returns the dynamic PWA manifest based on system settings.

**Access:** Public

**Response:**
```json
{
  "name": "Misayan Chat",
  "short_name": "Misayan",
  "description": "WhatsApp-style chat application",
  "start_url": "/user/",
  "display": "standalone",
  "background_color": "#075E54",
  "theme_color": "#075E54",
  "orientation": "portrait-primary",
  "scope": "/user/",
  "icons": [
    {
      "src": "/api/pwa/icon/192",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/api/pwa/icon/512",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

---

### GET /api/pwa/icon/:size

Returns the PWA icon for the specified size.

**Access:** Public

**Parameters:**
- `size` (path): Icon size in pixels (16, 32, 48, 72, 96, 128, 144, 152, 180, 192, 384, 512)

**Response:** PNG image file

---

### GET /api/pwa/settings

Returns PWA and preloader settings.

**Access:** Public

**Response:**
```json
{
  "success": true,
  "data": {
    "pwa_theme_color": "#075E54",
    "pwa_background_color": "#075E54",
    "preloader_bg_color": "#075E54",
    "preloader_text": "Loading...",
    "pwa_icon_192": "/uploads/pwa/icon_192.png",
    "pwa_icon_512": "/uploads/pwa/icon_512.png"
  }
}
```

---

### PUT /api/pwa/settings

Updates PWA settings.

**Access:** SuperAdmin only

**Headers:**
- `Authorization: Bearer <superadmin_token>`

**Body (multipart/form-data):**
- `preloader_bg_color` (string): Preloader background color (hex)
- `preloader_text` (string): Preloader text (max 35 characters)
- `pwa_theme_color` (string): Theme color (hex)
- `pwa_background_color` (string): Background color (hex)
- `pwa_icon_192_file` (file): 192x192 icon image
- `pwa_icon_512_file` (file): 512x512 icon image

**Response:**
```json
{
  "success": true,
  "message": "PWA settings updated successfully"
}
```

---

## Database Settings

PWA settings are stored in the `system_settings_kv` table:

| Setting Key | Description |
|-------------|-------------|
| `pwa_icon` | General PWA icon path |
| `pwa_icon_192` | 192x192 icon path |
| `pwa_icon_512` | 512x512 icon path |
| `pwa_theme_color` | Browser toolbar color |
| `pwa_background_color` | Splash screen background |
| `preloader_bg_color` | Preloader background color |
| `preloader_text` | Preloader text (max 35 chars) |

---

## Service Worker

The service worker (`/user/sw.js`) provides:

- **Caching:** Static assets are cached for offline access
- **Network-first strategy:** API requests always go to network
- **Push notifications:** Support for push notification events
- **Background sync:** Handles offline message queuing

---

## Installation

Users can install the PWA by:

1. Opening `/user/` in a mobile browser
2. Clicking "Add to Home Screen" or using the install prompt
3. The app will be installed with the configured icon and name

---

## RTL Support

All PWA components support RTL (Right-to-Left) layouts:

- Preloader text alignment
- Camera controls
- Recording interface
- Message bubbles

---

## Security

- PWA manifest and icons are public endpoints
- Settings update requires SuperAdmin authentication
- File uploads are validated for type and size
- Icons are stored in `/uploads/pwa/` directory
