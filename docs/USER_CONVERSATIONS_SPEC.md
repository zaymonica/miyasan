# User Conversations Page - Complete Specification

## Overview
Renovate the `/user` page to display only the Conversations tab (100% identical to tenant layout) with advanced features for store/department users.

## Architecture

### Frontend Structure
- **Desktop**: Full layout with sidebar + conversations list + pipeline view
- **Mobile**: Responsive design with hamburger menu, sidebar drawer, and full-screen conversation view
- **Internationalization**: 100% English with i18n support for multiple languages
- **Real-time**: Socket.IO integration for live message updates

### Key Features
1. **Conversations Management**
   - List all conversations for the user's store/department
   - Display WhatsApp Web conversations in a fixed section
   - Search and filter conversations
   - Show unread count and last message preview

2. **Conversation View** (Similar to WhatsApp Web)
   - Full-screen conversation modal/drawer
   - Contact avatar, name, and phone number at top
   - Message history with timestamps
   - Message input area with media support
   - Internal notes tab
   - Right sidebar with contact info, tags, assignment, and notes

3. **Pipeline Management**
   - Drag-and-drop cards between stages
   - Quick stage change via hamburger menu
   - Stage indicators on conversation cards
   - Unassigned, New, Negotiation, Won, Lost stages

4. **Mobile Responsiveness**
   - Hamburger menu (three dots) opens sidebar
   - Account selector dropdown in mobile menu
   - Full-screen conversation view
   - Touch-friendly drag-and-drop
   - Optimized spacing and fonts

5. **Real-time Features**
   - Live message updates via Socket.IO
   - Conversation locking (hidden from others when opened)
   - Auto-release after 5 minutes of inactivity
   - Typing indicators
   - Message delivery status

6. **Security & Isolation**
   - Conversations hidden from other users when claimed
   - Only unclaimed or user's claimed conversations visible
   - Department/store filtering
   - Tenant isolation

## Database Schema

### New Tables/Fields
```sql
-- Already exists, but ensure these fields are present:
-- whatsapp_cloud_conversations:
--   - claimed_by_user_id (user who has conversation open)
--   - claimed_at (timestamp of claim)
--   - source (whatsapp_cloud or whatsapp_web)
--   - stage_id (pipeline stage)
--   - tags (JSON array)
--   - priority (low, medium, high)

-- whatsapp_cloud_messages:
--   - conversation_id
--   - sender_id (contact or user)
--   - message_type (text, image, document, etc)
--   - content
--   - timestamp
--   - read_at
--   - status (sent, delivered, read)

-- whatsapp_cloud_internal_notes:
--   - conversation_id
--   - user_id
--   - note_text
--   - created_at
```

## API Endpoints

### Conversations
- `GET /api/user/whatsapp-cloud/conversations` - List conversations
- `GET /api/user/whatsapp-cloud/conversations/:id` - Get conversation details
- `GET /api/user/whatsapp-cloud/conversations/:id/messages` - Get messages (auto-claim)
- `POST /api/user/whatsapp-cloud/conversations/:id/claim` - Claim conversation
- `POST /api/user/whatsapp-cloud/conversations/:id/release` - Release conversation

### Messages
- `POST /api/user/whatsapp-cloud/conversations/:id/send-message` - Send message
- `POST /api/user/whatsapp-cloud/conversations/:id/internal-note` - Add internal note

### Pipeline
- `PUT /api/user/whatsapp-cloud/conversations/:id/stage` - Update stage
- `PUT /api/user/whatsapp-cloud/conversations/:id/tags` - Update tags
- `PUT /api/user/whatsapp-cloud/conversations/:id/priority` - Update priority
- `PUT /api/user/whatsapp-cloud/conversations/:id/transfer` - Transfer to department

## Frontend Components

### Main Page Structure
```
┌─────────────────────────────────────────────────┐
│ Header (Desktop) / Hamburger (Mobile)            │
├─────────────────────────────────────────────────┤
│ Sidebar (Desktop) / Drawer (Mobile)              │
│ ├─ WhatsApp Web (Fixed)                          │
│ ├─ Account Selector                              │
│ ├─ Search Box                                    │
│ └─ Conversations List                            │
├─────────────────────────────────────────────────┤
│ Main Content                                     │
│ ├─ Pipeline View (Desktop)                       │
│ │  ├─ Unassigned Column                          │
│ │  ├─ New Column                                 │
│ │  ├─ Negotiation Column                         │
│ │  ├─ Won Column                                 │
│ │  └─ Lost Column                                │
│ └─ Conversation Modal (When clicked)             │
│    ├─ Header (Avatar, Name, Back Button)         │
│    ├─ Messages Area                              │
│    ├─ Hamburger Menu (Transfer, Change Stage)    │
│    ├─ Input Area                                 │
│    └─ Right Sidebar (Contact Info, Tags, Notes)  │
└─────────────────────────────────────────────────┘
```

## Internationalization (i18n)

### Translation Keys
```json
{
  "conversations": {
    "title": "Conversations",
    "search_placeholder": "Search conversations...",
    "whatsapp_web": "WhatsApp Web",
    "no_conversations": "No conversations",
    "unread": "{{count}} unread",
    "last_message": "Last message"
  },
  "pipeline": {
    "unassigned": "Unassigned",
    "new": "New",
    "negotiation": "Negotiation",
    "won": "Won",
    "lost": "Lost"
  },
  "conversation": {
    "back": "Back",
    "send": "Send",
    "type_message": "Type a message...",
    "internal_notes": "Internal Notes",
    "contact_info": "Contact Info",
    "tags": "Tags",
    "assign_agent": "Assign Agent",
    "transfer": "Transfer",
    "change_stage": "Change Stage"
  }
}
```

## Styling & Colors

### CSS Variables (from existing system)
- Primary: #25d366 (WhatsApp Green)
- Secondary: #3b82f6 (Blue)
- Danger: #ef4444 (Red)
- Success: #10b981 (Green)
- Warning: #f59e0b (Amber)
- Light: #f8f9fa (Light Gray)
- Border: #e5e7eb (Gray)

## Responsive Breakpoints

- **Desktop**: >= 1024px (Full layout)
- **Tablet**: 768px - 1023px (Adjusted sidebar)
- **Mobile**: < 768px (Drawer sidebar, full-screen conversation)

## Performance Considerations

1. **Lazy Loading**: Load conversations on scroll
2. **Message Pagination**: Load messages in chunks (50 per load)
3. **Caching**: Cache conversations list for 30 seconds
4. **Debouncing**: Debounce search input (300ms)
5. **Compression**: Gzip all responses

## Security Measures

1. **JWT Validation**: All endpoints require valid token
2. **Tenant Isolation**: Filter by tenant_id
3. **User Isolation**: Only show user's conversations
4. **Rate Limiting**: 100 requests per minute per user
5. **SQL Injection Prevention**: Use prepared statements
6. **XSS Prevention**: Sanitize all user input

## Testing Strategy

1. **Unit Tests**: Test individual functions
2. **Integration Tests**: Test API endpoints
3. **E2E Tests**: Test user flows
4. **Mobile Testing**: Test on various devices
5. **Performance Testing**: Test with 1000+ conversations

## Deployment Checklist

- [ ] All endpoints tested
- [ ] i18n translations complete
- [ ] Mobile responsive tested
- [ ] Socket.IO real-time working
- [ ] Database migrations run
- [ ] Security audit passed
- [ ] Performance benchmarks met
- [ ] Documentation updated
