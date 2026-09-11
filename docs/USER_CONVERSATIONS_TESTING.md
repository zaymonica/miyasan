# User Conversations - Comprehensive Testing Guide

## Overview

This document provides complete testing procedures for the User Conversations implementation. All tests must be performed before production deployment.

## Test Environment Setup

### Prerequisites

Before testing, ensure:

1. Node.js server is running
2. MySQL database is connected
3. Socket.IO is enabled
4. WhatsApp Cloud API credentials configured
5. JWT tokens can be generated
6. Test user accounts created
7. Test conversations created with messages

### Test Data Preparation

Create test data in database:

```sql
-- Create test user
INSERT INTO users (id, name, email, password, tenant_id, store_id, department_id, role)
VALUES (1, 'Test User', 'test@example.com', 'hashed_password', 1, 1, 1, 'user');

-- Create test conversations
INSERT INTO whatsapp_cloud_conversations 
(id, tenant_id, account_id, contact_name, contact_phone, last_message, last_message_time, source)
VALUES 
(1, 1, 1, 'John Doe', '+1234567890', 'Hello', NOW(), 'whatsapp_cloud'),
(2, 1, 1, 'Jane Smith', '+0987654321', 'Hi there', NOW(), 'whatsapp_cloud');

-- Create test messages
INSERT INTO whatsapp_cloud_messages 
(conversation_id, message_id, direction, message_type, content, status, timestamp, sent_by_user_id)
VALUES 
(1, 'msg_1', 'inbound', 'text', 'Hello, I need help', NOW(), NULL),
(1, 'msg_2', 'outbound', 'text', 'How can I help you?', NOW(), 1);
```

## Testing Phases

### Phase 1: Unit Testing - API Endpoints

#### Test 1.1: Get Accounts
```bash
curl -X GET http://localhost:3000/api/user/whatsapp-cloud/accounts \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response**: 200 OK
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "account_name": "Main Account",
      "phone_number": "+1234567890",
      "status": "connected"
    }
  ]
}
```

**Validation**:
- [ ] Response code is 200
- [ ] Data array contains accounts
- [ ] Each account has id, account_name, phone_number, status
- [ ] No sensitive data exposed

#### Test 1.2: Get Conversations
```bash
curl -X GET "http://localhost:3000/api/user/whatsapp-cloud/conversations?accountId=1" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response**: 200 OK with conversations array

**Validation**:
- [ ] Response code is 200
- [ ] Conversations array populated
- [ ] Only user's conversations returned
- [ ] Tenant isolation verified
- [ ] Pagination working

#### Test 1.3: Get Conversation Details
```bash
curl -X GET http://localhost:3000/api/user/whatsapp-cloud/conversations/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response**: 200 OK with conversation object

**Validation**:
- [ ] Response code is 200
- [ ] Correct conversation returned
- [ ] All fields present
- [ ] No unauthorized access

#### Test 1.4: Claim Conversation
```bash
curl -X POST http://localhost:3000/api/user/whatsapp-cloud/conversations/1/claim \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response**: 200 OK

**Validation**:
- [ ] Conversation claimed successfully
- [ ] claimed_by_user_id set correctly
- [ ] claimed_at timestamp set
- [ ] WebSocket event emitted

#### Test 1.5: Release Conversation
```bash
curl -X POST http://localhost:3000/api/user/whatsapp-cloud/conversations/1/release \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response**: 200 OK

**Validation**:
- [ ] Conversation released successfully
- [ ] claimed_by_user_id cleared
- [ ] claimed_at cleared
- [ ] WebSocket event emitted

#### Test 1.6: Get Messages
```bash
curl -X GET "http://localhost:3000/api/user/whatsapp-cloud/conversations/1/messages?page=1&limit=50" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response**: 200 OK with messages array

**Validation**:
- [ ] Messages loaded successfully
- [ ] Pagination working
- [ ] Conversation auto-claimed
- [ ] Messages ordered by timestamp
- [ ] Sender info included

#### Test 1.7: Send Message
```bash
curl -X POST http://localhost:3000/api/user/whatsapp-cloud/conversations/1/send-message \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"Test message"}'
```

**Expected Response**: 200 OK

**Validation**:
- [ ] Message sent successfully
- [ ] Message saved to database
- [ ] WhatsApp API called
- [ ] WebSocket event emitted
- [ ] Conversation updated

#### Test 1.8: Update Stage
```bash
curl -X PUT http://localhost:3000/api/user/whatsapp-cloud/conversations/1/stage \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"stageId":"new"}'
```

**Expected Response**: 200 OK

**Validation**:
- [ ] Stage updated successfully
- [ ] Database updated
- [ ] WebSocket event emitted
- [ ] Pipeline reflects change

### Phase 2: Frontend Testing - Page Load

#### Test 2.1: Page Loads
1. Open browser to `http://localhost:3000/user/conversations.html`
2. Wait for page to fully load

**Validation**:
- [ ] Page loads without errors
- [ ] No JavaScript errors in console
- [ ] All CSS loaded
- [ ] All images loaded
- [ ] Page renders correctly

#### Test 2.2: Initial State
1. Check page layout

**Validation**:
- [ ] Header displays correctly
- [ ] Sidebar displays
- [ ] Pipeline board visible
- [ ] Account selector visible
- [ ] Search box visible
- [ ] Conversations list visible

#### Test 2.3: Socket.IO Connection
1. Open browser DevTools
2. Go to Network tab
3. Filter by WebSocket

**Validation**:
- [ ] WebSocket connection established
- [ ] Socket.IO handshake successful
- [ ] No connection errors
- [ ] Connection maintains

### Phase 3: Frontend Testing - Account Selector

#### Test 3.1: Dropdown Opens
1. Click on account selector
2. Observe dropdown

**Validation**:
- [ ] Dropdown opens smoothly
- [ ] All accounts listed
- [ ] Current account highlighted
- [ ] Dropdown closes when clicking outside

#### Test 3.2: Account Selection
1. Click on different account
2. Observe conversations update

**Validation**:
- [ ] Conversations update immediately
- [ ] Pipeline updates
- [ ] Selection persists (localStorage)
- [ ] WhatsApp Web option visible

### Phase 4: Frontend Testing - Search

#### Test 4.1: Search by Name
1. Type contact name in search box
2. Observe results

**Validation**:
- [ ] Results filter correctly
- [ ] Partial matches work
- [ ] Case-insensitive
- [ ] Real-time filtering

#### Test 4.2: Search by Phone
1. Type phone number
2. Observe results

**Validation**:
- [ ] Phone search works
- [ ] Partial matches work
- [ ] Results accurate

#### Test 4.3: Clear Search
1. Clear search box
2. Observe results

**Validation**:
- [ ] All conversations show again
- [ ] No errors

### Phase 5: Frontend Testing - Conversation List

#### Test 5.1: Conversation Display
1. Observe conversation list

**Validation**:
- [ ] All conversations display
- [ ] Avatars load correctly
- [ ] Contact names display
- [ ] Last message preview shows
- [ ] Timestamps display correctly
- [ ] Unread indicators show

#### Test 5.2: Conversation Selection
1. Click on conversation
2. Observe modal opens

**Validation**:
- [ ] Modal opens smoothly
- [ ] Correct conversation loads
- [ ] Animation plays
- [ ] Overlay appears

### Phase 6: Frontend Testing - Conversation Modal

#### Test 6.1: Modal Header
1. Open conversation
2. Check header

**Validation**:
- [ ] Back button visible
- [ ] Avatar displays
- [ ] Contact name displays
- [ ] Phone number displays
- [ ] Menu button visible

#### Test 6.2: Message Display
1. Observe messages

**Validation**:
- [ ] All messages load
- [ ] Message order correct
- [ ] Timestamps display
- [ ] Sender info displays
- [ ] Message status shows
- [ ] Messages scroll properly

#### Test 6.3: Message Input
1. Click in message input
2. Type test message

**Validation**:
- [ ] Input focused
- [ ] Text appears
- [ ] Placeholder text hides
- [ ] Character limit works

#### Test 6.4: Send Message
1. Type message
2. Click send button

**Validation**:
- [ ] Message sends successfully
- [ ] Message appears in list
- [ ] Input clears
- [ ] Timestamp updates
- [ ] Status shows "sent"
- [ ] Other users see message (real-time)

#### Test 6.5: Sidebar
1. Check right sidebar

**Validation**:
- [ ] Contact info section visible
- [ ] Tags section visible
- [ ] Notes section visible
- [ ] Agent assignment visible

#### Test 6.6: Menu
1. Click menu button
2. Observe menu

**Validation**:
- [ ] Menu opens
- [ ] Menu items visible
- [ ] Menu closes when clicking outside
- [ ] Menu items functional

### Phase 7: Frontend Testing - Pipeline

#### Test 7.1: Pipeline Display
1. Observe pipeline board

**Validation**:
- [ ] All stages visible
- [ ] Stage names correct
- [ ] Stage icons display
- [ ] Conversation counts correct
- [ ] Cards display in correct stage

#### Test 7.2: Drag and Drop
1. Drag card from one stage to another
2. Release

**Validation**:
- [ ] Card moves smoothly
- [ ] Stage count updates
- [ ] API call made
- [ ] Change persists
- [ ] Other users see change (real-time)

#### Test 7.3: Quick Change
1. Open conversation menu
2. Click "Change Stage"
3. Select new stage

**Validation**:
- [ ] Stage changes immediately
- [ ] Card moves to new stage
- [ ] Change persists
- [ ] Other users see change

### Phase 8: Mobile Testing

#### Test 8.1: Responsive Layout
1. Resize browser to mobile width (< 768px)
2. Observe layout

**Validation**:
- [ ] Layout adjusts correctly
- [ ] Hamburger menu visible
- [ ] Sidebar hidden
- [ ] Pipeline hidden
- [ ] Conversation list visible

#### Test 8.2: Hamburger Menu
1. Click hamburger button
2. Observe sidebar

**Validation**:
- [ ] Sidebar slides in
- [ ] Account selector visible
- [ ] Search visible
- [ ] Conversations list visible
- [ ] Close button visible

#### Test 8.3: Conversation View
1. Click on conversation
2. Observe view

**Validation**:
- [ ] Full-screen view
- [ ] Back button visible
- [ ] Menu button visible
- [ ] Input area visible
- [ ] Messages scroll properly

#### Test 8.4: Touch Controls
1. Test on actual mobile device
2. Test touch interactions

**Validation**:
- [ ] Tap to select works
- [ ] Swipe to close works
- [ ] Touch input responsive
- [ ] No double-tap zoom needed

### Phase 9: Real-time Testing

#### Test 9.1: Message Updates
1. Open conversation in two browser windows
2. Send message from window 1
3. Observe window 2

**Validation**:
- [ ] Message appears in window 2
- [ ] Timestamp correct
- [ ] Sender info correct
- [ ] No page refresh needed

#### Test 9.2: Conversation Claiming
1. Open conversation in window 1
2. Try to claim in window 2

**Validation**:
- [ ] Window 2 shows "already claimed"
- [ ] Cannot claim
- [ ] Claim expires after 5 minutes
- [ ] Can reclaim after expiration

#### Test 9.3: Stage Updates
1. Change stage in window 1
2. Observe window 2

**Validation**:
- [ ] Stage updates in window 2
- [ ] Card moves to correct stage
- [ ] Count updates
- [ ] No page refresh needed

### Phase 10: Security Testing

#### Test 10.1: Authentication
1. Try to access API without token

**Validation**:
- [ ] 401 Unauthorized response
- [ ] Error message displays

#### Test 10.2: Authorization
1. Login as user A
2. Try to access user B's conversations

**Validation**:
- [ ] Cannot access user B's conversations
- [ ] Only user A's conversations visible
- [ ] 403 Forbidden for unauthorized access

#### Test 10.3: Input Validation
1. Try to send empty message
2. Try to send message with HTML

**Validation**:
- [ ] Empty message rejected
- [ ] HTML sanitized
- [ ] No script execution
- [ ] Error message displays

### Phase 11: Performance Testing

#### Test 11.1: Page Load Time
1. Open DevTools Network tab
2. Load page
3. Check load time

**Validation**:
- [ ] Page load < 2 seconds
- [ ] No slow resources
- [ ] CSS/JS optimized

#### Test 11.2: API Response Time
1. Open DevTools Network tab
2. Make API calls
3. Check response times

**Validation**:
- [ ] Response time < 500ms
- [ ] No slow queries
- [ ] Database optimized

#### Test 11.3: Search Performance
1. Search with 1000+ conversations
2. Check response time

**Validation**:
- [ ] Search response < 300ms
- [ ] No lag
- [ ] Results accurate

### Phase 12: Browser Compatibility

#### Desktop Browsers

**Chrome 90+**
- [ ] Page loads
- [ ] All features work
- [ ] No console errors
- [ ] Performance good

**Firefox 88+**
- [ ] Page loads
- [ ] All features work
- [ ] No console errors
- [ ] Performance good

**Safari 14+**
- [ ] Page loads
- [ ] All features work
- [ ] No console errors
- [ ] Performance good

**Edge 90+**
- [ ] Page loads
- [ ] All features work
- [ ] No console errors
- [ ] Performance good

#### Mobile Browsers

**iOS Safari**
- [ ] Page loads
- [ ] Touch controls work
- [ ] Layout responsive
- [ ] Performance good

**Chrome Mobile**
- [ ] Page loads
- [ ] Touch controls work
- [ ] Layout responsive
- [ ] Performance good

## Comprehensive Test Checklist

### Pre-Testing
- [ ] Test environment set up
- [ ] Test data prepared
- [ ] Test accounts created
- [ ] Test conversations created
- [ ] Test messages created
- [ ] Database backups made

### API Testing
- [ ] Get accounts endpoint works
- [ ] Get conversations endpoint works
- [ ] Get conversation details works
- [ ] Claim conversation works
- [ ] Release conversation works
- [ ] Get messages works
- [ ] Send message works
- [ ] Update stage works
- [ ] Update tags works
- [ ] Add note works
- [ ] Transfer conversation works
- [ ] All error cases handled

### Frontend Testing
- [ ] Page loads without errors
- [ ] All elements display correctly
- [ ] Account selector works
- [ ] Search works
- [ ] Conversation list works
- [ ] Conversation modal works
- [ ] Message input works
- [ ] Send message works
- [ ] Pipeline works
- [ ] Drag-and-drop works
- [ ] Menu works

### Mobile Testing
- [ ] Hamburger menu works
- [ ] Sidebar drawer works
- [ ] Conversation view works
- [ ] Touch controls work
- [ ] Responsive layout works
- [ ] Tested on multiple devices

### Real-time Testing
- [ ] Socket.IO connects
- [ ] Messages update in real-time
- [ ] Conversation claiming works
- [ ] Stage updates in real-time
- [ ] No lag or delays

### Security Testing
- [ ] Authentication works
- [ ] Authorization works
- [ ] Input validation works
- [ ] XSS prevention works
- [ ] SQL injection prevention works
- [ ] Tenant isolation verified
- [ ] User isolation verified

### Performance Testing
- [ ] Page load time < 2s
- [ ] API response time < 500ms
- [ ] Message delivery time < 100ms
- [ ] Search response time < 300ms
- [ ] No memory leaks
- [ ] Stable over long sessions

### Browser Testing
- [ ] Chrome works
- [ ] Firefox works
- [ ] Safari works
- [ ] Edge works
- [ ] Mobile browsers work
- [ ] All features work in all browsers

### Accessibility Testing
- [ ] Keyboard navigation works
- [ ] Tab order logical
- [ ] Focus visible
- [ ] Screen reader compatible
- [ ] Color contrast adequate

### i18n Testing
- [ ] All text in English
- [ ] No Portuguese text
- [ ] No Spanish text
- [ ] Translation keys present
- [ ] Fallback text works
- [ ] Other languages work

## Test Results Documentation

For each test, document:

1. **Test ID**: Unique identifier
2. **Test Name**: Descriptive name
3. **Date**: When test was run
4. **Tester**: Who ran the test
5. **Environment**: Browser, device, OS
6. **Expected Result**: What should happen
7. **Actual Result**: What actually happened
8. **Status**: PASS or FAIL
9. **Notes**: Any observations
10. **Issues**: Any problems found

## Sign-off

- [ ] All tests completed
- [ ] All tests passed
- [ ] No critical issues
- [ ] Performance acceptable
- [ ] Security verified
- [ ] Ready for production

**Tested By**: ________________  
**Date**: ____________________  
**Approved By**: ______________  

---

**Last Updated**: January 31, 2026
**Version**: 1.0.0
