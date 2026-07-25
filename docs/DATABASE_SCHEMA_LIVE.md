# Geeves.Life — Complete Database Schema
# Generated: 2026-07-05T21:26:21.376Z
# Source: Live production database

## __drizzle_migrations

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | bigint unsigned | NO |  | PRI | auto_increment |
| hash | text(65535) | NO |  |  |  |
| created_at | bigint | YES |  |  |  |

**Indexes:**
- `PRIMARY` (id) 
- `id` (id) 

---

## airbnb_payout_records

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | int | NO |  | PRI | auto_increment |
| householdId | varchar(36) | NO |  | MUL |  |
| property | enum(17) | NO |  | MUL |  |
| recordDate | timestamp | NO |  |  |  |
| recordType | varchar(100) | NO |  |  |  |
| confirmationCode | varchar(50) | YES |  | MUL |  |
| bookingDate | timestamp | YES |  |  |  |
| startDate | timestamp | YES |  |  |  |
| endDate | timestamp | YES |  |  |  |
| nights | int | YES |  |  |  |
| guestName | varchar(255) | YES |  |  |  |
| listingName | varchar(255) | YES |  |  |  |
| details | varchar(500) | YES |  |  |  |
| referenceCode | varchar(100) | YES |  |  |  |
| currency | varchar(3) | NO | USD |  |  |
| amount | decimal(12,2) | YES |  |  |  |
| paidOut | decimal(12,2) | YES |  |  |  |
| serviceFee | decimal(12,2) | YES |  |  |  |
| cleaningFee | decimal(12,2) | YES |  |  |  |
| managementFee | decimal(12,2) | YES |  |  |  |
| petFee | decimal(12,2) | YES |  |  |  |
| grossEarnings | decimal(12,2) | YES |  |  |  |
| airbnbRemittedTax | decimal(12,2) | YES |  |  |  |
| earningsYear | int | YES |  | MUL |  |
| bankTransactionId | int | YES |  |  |  |
| documentId | int | YES |  |  |  |
| isReconciled | tinyint(1) | NO | 0 |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

**Indexes:**
- `PRIMARY` (id) 
- `apr_confirmation_idx` (confirmationCode) 
- `apr_household_idx` (householdId) 
- `apr_property_idx` (property) 
- `apr_year_idx` (earningsYear) 

---

## audit_log

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | bigint | NO |  | PRI | auto_increment |
| actorUserId | int | YES |  | MUL |  |
| actorOpenId | varchar(64) | YES |  |  |  |
| actorEmail | varchar(320) | YES |  |  |  |
| actorName | varchar(255) | YES |  |  |  |
| householdId | varchar(36) | YES |  | MUL |  |
| action | varchar(128) | NO |  | MUL |  |
| category | varchar(64) | NO |  |  |  |
| resourceType | varchar(64) | YES |  |  |  |
| resourceId | varchar(128) | YES |  |  |  |
| outcome | enum(7) | NO | success |  |  |
| metadata | json | YES |  |  |  |
| ipAddress | varchar(64) | YES |  |  |  |
| userAgent | text(65535) | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP | MUL |  |

**Indexes:**
- `PRIMARY` (id) 
- `audit_log_action_idx` (action) 
- `audit_log_actor_idx` (actorUserId) 
- `audit_log_created_at_idx` (createdAt) 
- `audit_log_household_idx` (householdId) 

---

## bank_accounts

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | int | NO |  | PRI | auto_increment |
| userId | int | NO |  |  |  |
| institution | varchar(255) | NO |  |  |  |
| accountName | varchar(255) | NO |  |  |  |
| accountType | enum(17) | NO |  |  |  |
| category | enum(8) | NO | personal |  |  |
| currency | varchar(3) | NO | USD |  |  |
| lastFourDigits | varchar(4) | YES |  |  |  |
| currentBalance | decimal(12,2) | YES | 0 |  |  |
| isActive | tinyint(1) | YES | 1 |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

**Indexes:**
- `PRIMARY` (id) 

---

## beta_signups

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | int | NO |  | PRI | auto_increment |
| name | varchar(255) | NO |  |  |  |
| email | varchar(320) | NO |  | UNI |  |
| householdType | varchar(100) | YES |  |  |  |
| householdSize | varchar(50) | YES |  |  |  |
| primaryUseCase | varchar(255) | YES |  |  |  |
| referralSource | varchar(255) | YES |  |  |  |
| additionalNotes | text(65535) | YES |  |  |  |
| icpScore | int | YES |  |  |  |
| status | enum(10) | NO | pending | MUL |  |
| adminNotes | text(65535) | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP | MUL |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

**Indexes:**
- `PRIMARY` (id) 
- `bs_created_at_idx` (createdAt) 
- `bs_email_idx` (email) 
- `bs_status_idx` (status) 
- `email` (email) 

---

## biz_account_transactions

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | int | NO |  | PRI | auto_increment |
| transaction_date | date | YES |  |  |  |
| description | text(65535) | YES |  |  |  |
| amount | decimal(12,2) | YES |  |  |  |
| transaction_type | varchar(20) | YES |  |  |  |
| account_number | varchar(20) | YES |  |  |  |
| account_type | varchar(20) | YES |  |  |  |
| card_number | varchar(10) | YES |  |  |  |
| business_vertical | varchar(50) | YES |  |  |  |
| qbo_class | varchar(50) | YES |  |  |  |
| qbo_expense_category | varchar(100) | YES |  |  |  |
| auto_classified | tinyint(1) | YES | 0 |  |  |
| source_file | varchar(100) | YES |  |  |  |
| created_at | timestamp | YES | CURRENT_TIMESTAMP |  |  |

**Indexes:**
- `PRIMARY` (id) 

---

## boa_transactions

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | int | NO |  | PRI | auto_increment |
| transaction_date | date | NO |  | MUL |  |
| description | text(65535) | NO |  |  |  |
| amount | decimal(12,2) | NO |  |  |  |
| account_number | varchar(20) | YES |  |  |  |
| account_type | varchar(20) | YES |  |  |  |
| vertical | varchar(50) | YES |  | MUL |  |
| category | varchar(100) | YES |  | MUL |  |
| qbo_category | varchar(100) | YES |  |  |  |
| classification_method | varchar(20) | YES | auto |  |  |
| split_pct | decimal(5,2) | YES | 100.00 |  |  |
| source_file | varchar(100) | YES |  |  |  |
| created_at | timestamp | YES | CURRENT_TIMESTAMP |  |  |

**Indexes:**
- `PRIMARY` (id) 
- `idx_category` (category) 
- `idx_date` (transaction_date) 
- `idx_vertical` (vertical) 

---

## booking_overrides

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | varchar(36) | NO |  | PRI |  |
| bookingId | varchar(36) | NO |  |  |  |
| guestName | varchar(255) | YES |  |  |  |
| guestEmail | varchar(320) | YES |  |  |  |
| notes | text(65535) | YES |  |  |  |
| createdBy | varchar(36) | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

**Indexes:**
- `PRIMARY` (id) 

---

## booking_requests

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | varchar(36) | NO |  | PRI |  |
| householdId | varchar(36) | NO |  |  |  |
| requestorMemberId | varchar(36) | NO |  |  |  |
| targetVerticalId | varchar(36) | NO |  |  |  |
| targetCalendarId | varchar(36) | YES |  |  |  |
| title | varchar(500) | NO |  |  |  |
| description | text(65535) | YES |  |  |  |
| location | varchar(500) | YES |  |  |  |
| startTime | bigint | NO |  |  |  |
| endTime | bigint | NO |  |  |  |
| status | enum(9) | NO | pending |  |  |
| createdEventId | varchar(36) | YES |  |  |  |
| responseNote | text(65535) | YES |  |  |  |
| respondedByMemberId | varchar(36) | YES |  |  |  |
| respondedAt | bigint | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

**Indexes:**
- `PRIMARY` (id) 

---

## booking_screenshots

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | varchar(36) | NO |  | PRI |  |
| bookingId | varchar(36) | NO |  | MUL |  |
| householdId | varchar(36) | NO |  | MUL |  |
| s3Url | text(65535) | NO |  |  |  |
| s3Key | text(65535) | NO |  |  |  |
| ocrExtractedData | json | YES |  |  |  |
| ocrConfidence | int | YES |  |  |  |
| isConfirmed | tinyint(1) | NO | 0 |  |  |
| uploadedByMemberId | varchar(36) | YES |  |  |  |
| uploadedAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |

**Indexes:**
- `PRIMARY` (id) 
- `bs_booking_idx` (bookingId) 
- `bs_household_idx` (householdId) 

---

## calendars

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | varchar(36) | NO |  | PRI |  |
| householdId | varchar(36) | NO |  |  |  |
| memberId | varchar(36) | NO |  |  |  |
| verticalId | varchar(36) | YES |  |  |  |
| provider | enum(16) | NO |  |  |  |
| externalId | varchar(500) | YES |  |  |  |
| name | varchar(255) | NO |  |  |  |
| color | varchar(20) | YES |  |  |  |
| syncType | enum(6) | NO | push |  |  |
| pollIntervalMinutes | int | YES | 15 |  |  |
| syncToken | text(65535) | YES |  |  |  |
| lastSyncAt | timestamp | YES |  |  |  |
| syncStatus | enum(6) | YES | active |  |  |
| syncError | text(65535) | YES |  |  |  |
| accessLevel | enum(10) | NO | read_write |  |  |
| isPrimary | tinyint(1) | YES | 0 |  |  |
| isVisible | tinyint(1) | YES | 1 |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
| accountEmail | varchar(320) | YES |  |  |  |
| shadowBlocking | tinyint(1) | NO | 1 |  |  |
| shadowSource | tinyint(1) | NO | 1 |  |  |
| noGoogleWrite | tinyint(1) | YES | 0 |  |  |

**Indexes:**
- `PRIMARY` (id) 

---

## capital_one_transactions

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | int | NO |  | PRI | auto_increment |
| transaction_date | date | NO |  | MUL |  |
| posted_date | date | YES |  |  |  |
| card_number | varchar(10) | YES |  |  |  |
| description | varchar(255) | NO |  |  |  |
| capital_one_category | varchar(50) | YES |  | MUL |  |
| amount | decimal(10,2) | NO |  |  |  |
| is_debit | tinyint(1) | NO |  |  |  |
| business_vertical | varchar(50) | YES | unclassified | MUL |  |
| qbo_class | varchar(50) | YES |  |  |  |
| qbo_expense_category | varchar(100) | YES |  |  |  |
| auto_matched | tinyint(1) | YES | 0 |  |  |
| match_confidence | varchar(10) | YES |  |  |  |
| foreign_amount | varchar(20) | YES |  |  |  |
| foreign_currency | varchar(5) | YES |  |  |  |
| exchange_rate | varchar(30) | YES |  |  |  |
| source_file | varchar(100) | YES |  |  |  |
| year | int | YES |  | MUL |  |
| created_at | timestamp | YES | CURRENT_TIMESTAMP |  |  |

**Indexes:**
- `PRIMARY` (id) 
- `idx_category` (capital_one_category) 
- `idx_date` (transaction_date) 
- `idx_vertical` (business_vertical) 
- `idx_year` (year) 

---

## chat_messages

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | int | NO |  | PRI | auto_increment |
| userId | int | NO |  |  |  |
| role | enum(9) | NO |  |  |  |
| content | text(65535) | NO |  |  |  |
| metadata | json | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |

**Indexes:**
- `PRIMARY` (id) 

---

## contact_messages

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | int | NO |  | PRI | auto_increment |
| name | varchar(255) | NO |  |  |  |
| email | varchar(320) | NO |  | MUL |  |
| subject | varchar(255) | NO |  |  |  |
| message | text(65535) | NO |  |  |  |
| isRead | tinyint(1) | NO | 0 | MUL |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP | MUL |  |

**Indexes:**
- `PRIMARY` (id) 
- `cm_created_at_idx` (createdAt) 
- `cm_email_idx` (email) 
- `cm_is_read_idx` (isRead) 

---

## contractor_payments

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | int | NO |  | PRI | auto_increment |
| userId | int | NO | 1 |  |  |
| platform | varchar(50) | NO |  | MUL |  |
| recipientName | varchar(255) | NO |  |  |  |
| amount | decimal(12,2) | NO |  |  |  |
| currency | varchar(3) | YES | USD |  |  |
| paymentDate | date | NO |  | MUL |  |
| note | text(65535) | YES |  |  |  |
| transactionId | varchar(255) | YES |  |  |  |
| emailAccount | varchar(255) | YES |  |  |  |
| gmailMessageId | varchar(255) | YES |  |  |  |
| propertyAttribution | varchar(100) | YES | unclassified | MUL |  |
| expenseCategory | varchar(100) | YES |  |  |  |
| isTaxDeductible | tinyint(1) | YES | 0 |  |  |
| aiConfidence | int | YES |  |  |  |
| qboExpenseId | varchar(100) | YES |  |  |  |
| qboSyncStatus | varchar(50) | YES |  |  |  |
| createdAt | timestamp | YES | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | YES | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

**Indexes:**
- `PRIMARY` (id) 
- `idx_date` (paymentDate) 
- `idx_property` (propertyAttribution) 
- `unique_txn` (platform,transactionId) 

---

## custom_roles

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | varchar(36) | NO |  | PRI |  |
| householdId | varchar(36) | NO |  | MUL |  |
| name | varchar(100) | NO |  |  |  |
| description | varchar(500) | YES |  |  |  |
| baseRole | varchar(50) | NO | member |  |  |
| permissions | json | YES | json_array() |  | DEFAULT_GENERATED |
| deniedPermissions | json | YES | json_array() |  | DEFAULT_GENERATED |
| allowedWidgets | json | YES |  |  |  |
| allowedVerticalIds | json | YES |  |  |  |
| color | varchar(20) | YES | #6B7280 |  |  |
| icon | varchar(50) | YES | User |  |  |
| createdByMemberId | varchar(36) | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

**Indexes:**
- `PRIMARY` (id) 
- `cr_household_idx` (householdId) 

---

## devices

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | varchar(36) | NO |  | PRI |  |
| householdId | varchar(36) | NO |  |  |  |
| propertyId | varchar(36) | YES |  |  |  |
| name | varchar(255) | NO |  |  |  |
| type | enum(10) | NO |  |  |  |
| provider | enum(6) | YES | seam |  |  |
| externalId | varchar(255) | YES |  |  |  |
| location | varchar(255) | YES |  |  |  |
| currentState | json | YES |  |  |  |
| status | enum(7) | YES | setup |  |  |
| lastSeenAt | timestamp | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

**Indexes:**
- `PRIMARY` (id) 

---

## email_scrape_jobs

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | varchar(36) | NO |  | PRI |  |
| propertyId | varchar(36) | NO |  | MUL |  |
| emailAddress | varchar(320) | NO |  |  |  |
| platformId | varchar(36) | YES |  |  |  |
| status | enum(12) | NO | pending | MUL |  |
| startedAt | bigint | YES |  |  |  |
| completedAt | bigint | YES |  |  |  |
| emailsScanned | int | YES | 0 |  |  |
| bookingsEnriched | int | YES | 0 |  |  |
| bookingsCreated | int | YES | 0 |  |  |
| errorMessage | text(65535) | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |

**Indexes:**
- `PRIMARY` (id) 
- `esj_property_idx` (propertyId) 
- `esj_status_idx` (status) 

---

## events

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | varchar(36) | NO |  | PRI |  |
| householdId | varchar(36) | NO |  | MUL |  |
| calendarId | varchar(36) | NO |  | MUL |  |
| externalId | varchar(500) | YES |  |  |  |
| title | varchar(500) | NO |  |  |  |
| description | text(65535) | YES |  |  |  |
| location | varchar(500) | YES |  |  |  |
| startTime | bigint | NO |  |  |  |
| endTime | bigint | NO |  |  |  |
| isAllDay | tinyint(1) | YES | 0 |  |  |
| recurrenceRule | text(65535) | YES |  |  |  |
| recurringEventId | varchar(36) | YES |  |  |  |
| status | enum(9) | NO | confirmed |  |  |
| visibility | enum(12) | YES | default |  |  |
| attendees | json | YES |  |  |  |
| reminders | json | YES |  |  |  |
| createdBy | varchar(36) | YES |  |  |  |
| lastModifiedBy | varchar(36) | YES |  |  |  |
| source | enum(6) | YES | sync |  |  |
| version | int | YES | 1 |  |  |
| etag | varchar(255) | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
| isShadowBlock | tinyint(1) | NO | 0 |  |  |

**Indexes:**
- `PRIMARY` (id) 
- `events_calendar_external_uniq` (calendarId,externalId) 
- `events_calendar_start_idx` (calendarId,startTime) 
- `events_household_time_idx` (householdId,startTime,endTime) 

---

## exchange_rates

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | int | NO |  | PRI | auto_increment |
| fromCurrency | varchar(3) | NO |  |  |  |
| toCurrency | varchar(3) | NO |  |  |  |
| rate | decimal(10,4) | NO |  |  |  |
| fetchedAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |

**Indexes:**
- `PRIMARY` (id) 

---

## expense_categorization_rules

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | int | NO |  | PRI | auto_increment |
| namePattern | varchar(255) | NO |  | MUL |  |
| category | varchar(100) | NO |  | MUL |  |
| defaultProperty | enum(17) | YES |  |  |  |
| hitCount | int | NO | 0 |  |  |
| minConfidence | int | NO | 80 |  |  |
| isActive | tinyint(1) | NO | 1 |  |  |
| source | enum(10) | NO | ai_learned |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

**Indexes:**
- `PRIMARY` (id) 
- `ecr_category_idx` (category) 
- `ecr_pattern_idx` (namePattern) 

---

## family_members

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | int | NO |  | PRI | auto_increment |
| userId | int | NO |  |  |  |
| name | varchar(255) | NO |  |  |  |
| relationship | varchar(100) | NO |  |  |  |
| avatarUrl | text(65535) | YES |  |  |  |
| clothingSizes | json | YES |  |  |  |
| dietaryRestrictions | json | YES |  |  |  |
| preferences | json | YES |  |  |  |
| birthDate | varchar(10) | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

**Indexes:**
- `PRIMARY` (id) 

---

## financial_accounts

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | int | NO |  | PRI | auto_increment |
| householdId | varchar(36) | NO |  | MUL |  |
| accountName | varchar(255) | NO |  |  |  |
| institution | varchar(100) | NO |  |  |  |
| accountType | enum(17) | NO |  |  |  |
| lastFourDigits | varchar(10) | YES |  |  |  |
| accountNumber | varchar(50) | YES |  |  |  |
| currency | varchar(3) | NO | JMD |  |  |
| creditLimitJMD | decimal(14,2) | YES |  |  |  |
| vertical | enum(17) | NO | personal | MUL |  |
| isActive | tinyint(1) | NO | 1 |  |  |
| statementFolderUrl | text(65535) | YES |  |  |  |
| notes | text(65535) | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

**Indexes:**
- `PRIMARY` (id) 
- `fa_household_idx` (householdId) 
- `fa_vertical_idx` (vertical) 

---

## financial_documents

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | int | NO |  | PRI | auto_increment |
| householdId | varchar(36) | NO |  | MUL |  |
| transactionId | int | YES |  | MUL |  |
| accountId | int | YES |  | MUL |  |
| documentType | enum(21) | NO |  |  |  |
| documentDate | timestamp | YES |  |  |  |
| description | varchar(500) | NO |  |  |  |
| s3Key | varchar(500) | NO |  |  |  |
| s3Url | text(65535) | NO |  |  |  |
| originalFilename | varchar(255) | YES |  |  |  |
| vertical | enum(17) | NO | personal | MUL |  |
| statementYear | int | YES |  |  |  |
| statementMonth | int | YES |  |  |  |
| currency | varchar(3) | YES | JMD |  |  |
| taxYear | int | YES |  | MUL |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

**Indexes:**
- `PRIMARY` (id) 
- `fd_account_idx` (accountId) 
- `fd_household_idx` (householdId) 
- `fd_transaction_idx` (transactionId) 
- `fd_vertical_idx` (vertical) 
- `fd_year_idx` (taxYear) 

---

## financial_transactions

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | int | NO |  | PRI | auto_increment |
| householdId | varchar(36) | NO |  | MUL |  |
| accountId | int | NO |  | MUL |  |
| transactionDate | timestamp | NO |  | MUL |  |
| postingDate | timestamp | YES |  |  |  |
| description | varchar(500) | NO |  |  |  |
| referenceNumber | varchar(100) | YES |  |  |  |
| debitAmount | decimal(14,2) | YES |  |  |  |
| creditAmount | decimal(14,2) | YES |  |  |  |
| balance | decimal(14,2) | YES |  |  |  |
| currency | varchar(3) | NO | JMD |  |  |
| vertical | enum(17) | NO | unclassified | MUL |  |
| expenseCategory | varchar(100) | YES |  |  |  |
| aiConfidence | int | YES |  |  |  |
| isManualOverride | tinyint(1) | NO | 0 |  |  |
| isReconciled | tinyint(1) | NO | 0 | MUL |  |
| expenseRecordId | int | YES |  |  |  |
| receiptUrl | text(65535) | YES |  |  |  |
| source | enum(14) | NO | bank_statement |  |  |
| statementYear | int | YES |  | MUL |  |
| statementMonth | int | YES |  |  |  |
| isTaxDeductible | tinyint(1) | NO | 0 |  |  |
| notes | text(65535) | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

**Indexes:**
- `PRIMARY` (id) 
- `ft_account_idx` (accountId) 
- `ft_date_idx` (transactionDate) 
- `ft_household_idx` (householdId) 
- `ft_reconciled_idx` (isReconciled) 
- `ft_vertical_idx` (vertical) 
- `ft_year_month_idx` (statementYear,statementMonth) 

---

## household_members

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | varchar(36) | NO |  | PRI |  |
| householdId | varchar(36) | NO |  |  |  |
| userId | int | YES |  |  |  |
| displayName | varchar(255) | NO |  |  |  |
| googleName | varchar(255) | YES |  |  |  |
| email | varchar(320) | YES |  |  |  |
| avatarUrl | text(65535) | YES |  |  |  |
| role | enum(15) | NO | member |  |  |
| accessibilityMode | enum(13) | YES | standard |  |  |
| status | enum(8) | NO | invited |  |  |
| invitedAt | timestamp | YES |  |  |  |
| joinedAt | timestamp | YES |  |  |  |
| invitedByMemberId | varchar(36) | YES |  |  |  |
| pendingVerticals | json | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
| pronouns | varchar(100) | YES |  |  |  |
| genderIdentity | varchar(100) | YES |  |  |  |
| relationshipLabel | varchar(100) | YES |  |  |  |
| isBillingContact | tinyint(1) | YES | 0 |  |  |
| inviteToken | varchar(128) | YES |  |  |  |
| inviteTokenExpiresAt | timestamp | YES |  |  |  |
| geevesAccess | tinyint(1) | NO | 1 |  |  |
| customRoleId | varchar(36) | YES |  |  |  |
| photoUrl | text(65535) | YES |  |  |  |
| dob | varchar(10) | YES |  |  |  |
| phoneNumbers | json | YES |  |  |  |
| clothingSizes | json | YES |  |  |  |
| dietaryRestrictions | text(65535) | YES |  |  |  |
| memberPreferences | json | YES |  |  |  |

**Indexes:**
- `PRIMARY` (id) 

---

## households

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | varchar(36) | NO |  | PRI |  |
| name | varchar(255) | NO |  |  |  |
| createdByUserId | int | NO |  |  |  |
| wakeWord | varchar(100) | YES | Geeves |  |  |
| timezone | varchar(100) | NO | America/New_York |  |  |
| groupName | varchar(100) | YES | Household |  |  |
| settings | json | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
| eaCanManageAccess | tinyint(1) | NO | 1 |  |  |

**Indexes:**
- `PRIMARY` (id) 

---

## ltr_deposit_ledger

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | varchar(36) | NO |  | PRI |  |
| householdId | varchar(36) | NO |  |  |  |
| propertyId | varchar(36) | NO |  |  |  |
| leaseId | varchar(36) | NO |  | MUL |  |
| tenantId | varchar(36) | NO |  | MUL |  |
| type | enum(18) | NO |  |  |  |
| amount | decimal(12,2) | NO |  |  |  |
| balanceAfter | decimal(12,2) | NO |  |  |  |
| description | text(65535) | YES |  |  |  |
| entryDate | bigint | NO |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |

**Indexes:**
- `PRIMARY` (id) 
- `ltr_dep_lease_idx` (leaseId) 
- `ltr_dep_tenant_idx` (tenantId) 

---

## ltr_lease_tenants

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | varchar(36) | NO |  | PRI |  |
| leaseId | varchar(36) | NO |  | MUL |  |
| tenantId | varchar(36) | NO |  | MUL |  |
| isPrimary | tinyint(1) | YES | 0 |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |

**Indexes:**
- `PRIMARY` (id) 
- `ltr_lt_lease_idx` (leaseId) 
- `ltr_lt_tenant_idx` (tenantId) 

---

## ltr_leases

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | varchar(36) | NO |  | PRI |  |
| householdId | varchar(36) | NO |  |  |  |
| propertyId | varchar(36) | NO |  | MUL |  |
| startDate | bigint | NO |  | MUL |  |
| endDate | bigint | NO |  |  |  |
| monthlyRent | decimal(12,2) | NO |  |  |  |
| utilityFee | decimal(12,2) | YES | 0.00 |  |  |
| totalMonthly | decimal(12,2) | NO |  |  |  |
| securityDeposit | decimal(12,2) | YES | 0.00 |  |  |
| petDeposit | decimal(12,2) | YES | 0.00 |  |  |
| securityDepositPaid | tinyint(1) | YES | 0 |  |  |
| securityDepositReturned | tinyint(1) | YES | 0 |  |  |
| securityDepositForfeited | decimal(12,2) | YES | 0.00 |  |  |
| lateFee | decimal(12,2) | YES | 0.00 |  |  |
| rentDueDay | int | YES | 1 |  |  |
| gracePeriodDays | int | YES | 3 |  |  |
| leaseDocUrl | text(65535) | YES |  |  |  |
| leaseDocKey | text(65535) | YES |  |  |  |
| status | enum(10) | NO | active | MUL |  |
| terminationReason | text(65535) | YES |  |  |  |
| notes | text(65535) | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

**Indexes:**
- `PRIMARY` (id) 
- `ltr_lease_date_idx` (startDate,endDate) 
- `ltr_lease_property_idx` (propertyId) 
- `ltr_lease_status_idx` (status) 

---

## ltr_payments

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | varchar(36) | NO |  | PRI |  |
| householdId | varchar(36) | NO |  |  |  |
| propertyId | varchar(36) | NO |  | MUL |  |
| leaseId | varchar(36) | NO |  | MUL |  |
| tenantId | varchar(36) | NO |  | MUL |  |
| amount | decimal(12,2) | NO |  |  |  |
| type | enum(16) | NO |  | MUL |  |
| method | enum(13) | YES |  |  |  |
| status | enum(9) | NO | completed |  |  |
| periodStart | bigint | YES |  | MUL |  |
| paidAt | bigint | NO |  |  |  |
| externalRef | varchar(255) | YES |  |  |  |
| memo | text(65535) | YES |  |  |  |
| notes | text(65535) | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
| tenantName | varchar(255) | YES |  |  |  |
| paymentType | enum(11) | YES |  |  |  |
| currency | varchar(3) | NO | USD |  |  |
| expectedAmount | decimal(12,2) | YES |  |  |  |
| dueDate | bigint | YES |  |  |  |
| paymentMethod | varchar(100) | YES |  |  |  |
| bankTransactionId | int | YES |  |  |  |
| source | enum(14) | NO | manual |  |  |

**Indexes:**
- `PRIMARY` (id) 
- `ltr_pay_lease_idx` (leaseId) 
- `ltr_pay_period_idx` (periodStart) 
- `ltr_pay_property_idx` (propertyId) 
- `ltr_pay_tenant_idx` (tenantId) 
- `ltr_pay_type_idx` (type) 

---

## ltr_tenants

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | varchar(36) | NO |  | PRI |  |
| householdId | varchar(36) | NO |  |  |  |
| propertyId | varchar(36) | NO |  | MUL |  |
| name | varchar(255) | NO |  |  |  |
| email | varchar(320) | YES |  |  |  |
| phone | varchar(30) | YES |  |  |  |
| paymentHandle | varchar(100) | YES |  |  |  |
| paymentMethod | enum(13) | YES |  |  |  |
| status | enum(9) | NO | active | MUL |  |
| moveInDate | bigint | YES |  |  |  |
| moveOutDate | bigint | YES |  |  |  |
| notes | text(65535) | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

**Indexes:**
- `PRIMARY` (id) 
- `ltr_tenant_property_idx` (propertyId) 
- `ltr_tenant_status_idx` (status) 

---

## member_permission_overrides

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | varchar(36) | NO |  | PRI |  |
| householdId | varchar(36) | NO |  | MUL |  |
| memberId | varchar(36) | NO |  | MUL |  |
| permission | varchar(100) | NO |  |  |  |
| granted | tinyint(1) | NO |  |  |  |
| configuredByMemberId | varchar(36) | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

**Indexes:**
- `PRIMARY` (id) 
- `mpo_household_idx` (householdId) 
- `mpo_member_idx` (memberId) 
- `mpo_member_perm_uniq` (memberId,permission) 

---

## member_resources

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | varchar(36) | NO |  | PRI |  |
| householdId | varchar(36) | NO |  | MUL |  |
| memberId | varchar(36) | NO |  | MUL |  |
| verticalId | varchar(36) | YES |  | MUL |  |
| title | varchar(255) | NO |  |  |  |
| url | text(65535) | NO |  |  |  |
| description | text(65535) | YES |  |  |  |
| resourceType | enum(8) | NO | link |  |  |
| sortOrder | int | NO | 0 |  |  |
| isActive | tinyint(1) | NO | 1 |  |  |
| addedByMemberId | varchar(36) | NO |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

**Indexes:**
- `PRIMARY` (id) 
- `mr_household_idx` (householdId) 
- `mr_member_idx` (memberId) 
- `mr_sort_idx` (memberId,sortOrder) 
- `mr_vertical_idx` (verticalId) 

---

## notes

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | varchar(36) | NO |  | PRI |  |
| householdId | varchar(36) | NO |  |  |  |
| memberId | varchar(36) | NO |  |  |  |
| verticalId | varchar(36) | YES |  |  |  |
| eventId | varchar(36) | YES |  |  |  |
| content | text(65535) | NO |  |  |  |
| source | enum(6) | NO | text |  |  |
| reminderAt | bigint | YES |  |  |  |
| isCompleted | tinyint(1) | YES | 0 |  |  |
| completedAt | timestamp | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

**Indexes:**
- `PRIMARY` (id) 

---

## oauth_nonces

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| nonce | varchar(128) | NO |  | PRI |  |
| expiresAt | bigint | NO |  |  |  |

**Indexes:**
- `PRIMARY` (nonce) 

---

## oauth_tokens

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | varchar(36) | NO |  | PRI |  |
| householdId | varchar(36) | NO |  |  |  |
| memberId | varchar(36) | NO |  |  |  |
| provider | varchar(50) | NO |  |  |  |
| accountEmail | varchar(320) | NO |  |  |  |
| accessToken | text(65535) | NO |  |  |  |
| refreshToken | text(65535) | YES |  |  |  |
| expiresAt | bigint | YES |  |  |  |
| scopes | text(65535) | YES |  |  |  |
| status | enum(7) | YES | active |  |  |
| lastRefreshedAt | timestamp | YES |  |  |  |
| expiredNotifiedAt | timestamp | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
| purposes | json | YES |  |  |  |
| displayName | varchar(100) | YES |  |  |  |

**Indexes:**
- `PRIMARY` (id) 

---

## order_items

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | int | NO |  | PRI | auto_increment |
| orderId | int | NO |  | MUL |  |
| name | varchar(500) | NO |  |  |  |
| quantity | int | NO | 1 |  |  |
| unitPrice | decimal(12,2) | YES |  |  |  |
| lineTotal | decimal(12,2) | YES |  |  |  |
| currency | varchar(3) | NO | USD |  |  |
| productUrl | text(65535) | YES |  |  |  |
| vendorProductId | varchar(255) | YES |  |  |  |
| asin | varchar(20) | YES |  |  |  |
| expenseCategory | varchar(100) | YES |  | MUL |  |
| propertyAttribution | enum(17) | NO | unclassified | MUL |  |
| isTaxDeductible | tinyint(1) | NO | 0 | MUL |  |
| aiConfidence | int | YES |  |  |  |
| isManualOverride | tinyint(1) | NO | 0 |  |  |
| expenseRecordId | int | YES |  |  |  |
| deliveryAddress | varchar(500) | YES |  |  |  |
| tags | json | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

**Indexes:**
- `PRIMARY` (id) 
- `oi_category_idx` (expenseCategory) 
- `oi_deductible_idx` (isTaxDeductible) 
- `oi_order_idx` (orderId) 
- `oi_property_idx` (propertyAttribution) 

---

## orders

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | int | NO |  | PRI | auto_increment |
| userId | int | NO |  |  |  |
| platform | varchar(100) | NO |  |  |  |
| orderNumber | varchar(255) | YES |  |  |  |
| vendor | varchar(255) | YES |  |  |  |
| totalAmount | decimal(12,2) | YES |  |  |  |
| currency | varchar(3) | YES | USD |  |  |
| status | enum(9) | NO | pending |  |  |
| trackingNumber | varchar(255) | YES |  |  |  |
| items | json | YES |  |  |  |
| importSource | enum(8) | NO | manual |  |  |
| orderDate | timestamp | NO |  |  |  |
| deliveryDate | timestamp | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
| propertyAttribution | varchar(100) | YES | unclassified |  |  |
| expenseCategory | varchar(100) | YES |  |  |  |
| isTaxDeductible | tinyint(1) | YES | 0 |  |  |
| aiConfidence | int | YES |  |  |  |
| aiReasoning | text(65535) | YES |  |  |  |

**Indexes:**
- `PRIMARY` (id) 

---

## platform_credentials

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | int | NO |  | PRI | auto_increment |
| userId | int | NO |  |  |  |
| platform | varchar(100) | NO |  |  |  |
| credentialData | json | YES |  |  |  |
| isActive | tinyint(1) | YES | 1 |  |  |
| lastUsed | timestamp | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

**Indexes:**
- `PRIMARY` (id) 

---

## platform_export_imports

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | varchar(36) | NO |  | PRI |  |
| householdId | varchar(36) | NO |  | MUL |  |
| platform | enum(11) | NO |  | MUL |  |
| filename | varchar(255) | NO |  |  |  |
| s3Url | text(65535) | NO |  |  |  |
| s3Key | text(65535) | NO |  |  |  |
| recordCount | int | YES |  |  |  |
| matchedCount | int | YES |  |  |  |
| createdCount | int | YES |  |  |  |
| importStatus | enum(10) | NO | processing |  |  |
| errorMessage | text(65535) | YES |  |  |  |
| uploadedByMemberId | varchar(36) | YES |  |  |  |
| importedAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |

**Indexes:**
- `PRIMARY` (id) 
- `pei_household_idx` (householdId) 
- `pei_platform_idx` (platform) 

---

## product_mappings

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | int | NO |  | PRI | auto_increment |
| userId | int | NO |  |  |  |
| itemName | varchar(500) | NO |  |  |  |
| normalizedName | varchar(500) | NO |  |  |  |
| platform | varchar(100) | NO |  |  |  |
| productId | varchar(255) | NO |  |  |  |
| productName | varchar(500) | NO |  |  |  |
| productUrl | text(65535) | YES |  |  |  |
| lastPrice | decimal(10,2) | YES |  |  |  |
| useCount | int | YES | 1 |  |  |
| confidence | int | YES | 80 |  |  |
| isVerified | tinyint(1) | YES | 0 |  |  |
| lastAvailable | timestamp | YES |  |  |  |
| lastUsed | timestamp | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

**Indexes:**
- `PRIMARY` (id) 

---

## project_knowledge

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | int | NO |  | PRI | auto_increment |
| category | varchar(64) | NO |  |  |  |
| key | varchar(128) | NO |  |  |  |
| value | text(65535) | NO |  |  |  |
| sourceDoc | varchar(256) | YES |  |  |  |
| notes | text(65535) | YES |  |  |  |
| lastReviewedAt | timestamp | YES |  |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |

**Indexes:**
- `PRIMARY` (id) 

---

## project_tasks

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | int | NO |  | PRI | auto_increment |
| phase | varchar(32) | NO | 1 | MUL |  |
| area | varchar(64) | NO |  | MUL |  |
| bucket | varchar(128) | YES |  |  |  |
| title | varchar(512) | NO |  |  |  |
| titleHash | varchar(64) | NO |  | UNI |  |
| status | enum(11) | NO | todo | MUL |  |
| priority | enum(8) | NO | medium |  |  |
| notes | text(65535) | YES |  |  |  |
| deferredReason | varchar(512) | YES |  |  |  |
| sourceDoc | varchar(256) | YES |  |  |  |
| completedAt | timestamp | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

**Indexes:**
- `PRIMARY` (id) 
- `project_tasks_area_idx` (area) 
- `project_tasks_phase_idx` (phase) 
- `project_tasks_status_idx` (status) 
- `project_tasks_title_hash_idx` (titleHash) 

---

## propagation_queue

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | varchar(36) | NO |  | PRI |  |
| eventId | varchar(36) | NO |  | MUL |  |
| householdId | varchar(36) | NO |  |  |  |
| reason | enum(15) | NO |  |  |  |
| attempts | int | NO | 0 |  |  |
| maxAttempts | int | NO | 5 |  |  |
| nextRetryAt | bigint | NO |  |  |  |
| createdAt | bigint | NO |  |  |  |
| resolvedAt | bigint | YES |  |  |  |
| status | enum(8) | NO | pending | MUL |  |

**Indexes:**
- `PRIMARY` (id) 
- `pq_event_idx` (eventId) 
- `pq_next_retry_idx` (status,nextRetryAt) 

---

## properties

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | varchar(36) | NO |  | PRI |  |
| householdId | varchar(36) | NO |  |  |  |
| name | varchar(255) | NO |  |  |  |
| address | text(65535) | YES |  |  |  |
| type | enum(17) | YES | rental_str |  |  |
| icalUrl | text(65535) | YES |  |  |  |
| calendarId | varchar(36) | YES |  |  |  |
| settings | json | YES |  |  |  |
| latitude | decimal(10,7) | YES |  |  |  |
| longitude | decimal(10,7) | YES |  |  |  |
| country | varchar(2) | YES |  |  |  |
| timezone | varchar(64) | YES | America/New_York |  |  |
| isActive | tinyint(1) | YES | 1 |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
| verticalId | varchar(36) | YES |  |  |  |
| propertyEmail | varchar(320) | YES |  |  |  |
| outboundIcsKey | text(65535) | YES |  |  |  |
| outboundIcsUrl | text(65535) | YES |  |  |  |
| leaseDocUrl | text(65535) | YES |  |  |  |
| leaseDocKey | text(65535) | YES |  |  |  |
| monthlyRent | decimal(12,2) | YES |  |  |  |
| rentCurrency | varchar(3) | YES | USD |  |  |

**Indexes:**
- `PRIMARY` (id) 

---

## property_bookings

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | varchar(36) | NO |  | PRI |  |
| propertyId | varchar(36) | NO |  | MUL |  |
| platformId | varchar(36) | NO |  | MUL |  |
| icalUid | varchar(500) | YES |  | MUL |  |
| bookingType | enum(11) | NO | booking |  |  |
| blockReason | varchar(50) | YES |  |  |  |
| summary | varchar(500) | YES |  |  |  |
| description | text(65535) | YES |  |  |  |
| checkIn | bigint | NO |  |  |  |
| checkOut | bigint | NO |  |  |  |
| guestName | varchar(255) | YES |  |  |  |
| guestEmail | varchar(320) | YES |  |  |  |
| guestPhone | varchar(50) | YES |  |  |  |
| revenueAmount | decimal(12,2) | YES |  |  |  |
| revenueCurrency | varchar(3) | YES | USD |  |  |
| hasConflict | tinyint(1) | YES | 0 |  |  |
| conflictWith | varchar(36) | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
| confirmationNumber | varchar(50) | YES |  |  |  |
| totalPrice | decimal(12,2) | YES |  |  |  |
| commissionAmount | decimal(12,2) | YES |  |  |  |
| netAmount | decimal(12,2) | YES |  |  |  |
| currency | varchar(3) | YES | USD |  |  |
| guestCount | int | YES |  |  |  |
| cleaningFee | decimal(12,2) | YES |  |  |  |
| platformBookingUrl | text(65535) | YES |  |  |  |
| rawEmailSubject | varchar(500) | YES |  |  |  |
| rawEmailDate | bigint | YES |  |  |  |
| emailScrapeSource | varchar(64) | YES |  |  |  |
| scrapeConfidence | int | YES |  |  |  |
| lastEnrichedAt | bigint | YES |  |  |  |
| bookingStatus | enum(9) | NO | confirmed |  |  |
| cancelledAt | bigint | YES |  |  |  |
| cancellationSource | varchar(64) | YES |  |  |  |
| dataSource | enum(10) | NO | ical_only |  |  |
| emailCheckIn | bigint | YES |  |  |  |
| emailCheckOut | bigint | YES |  |  |  |
| pendingCancellationSource | varchar(10) | YES |  |  |  |
| pendingCancellationAt | bigint | YES |  |  |  |
| taxRemittedByPlatform | decimal(12,2) | YES |  |  |  |
| taxOwedByHost | decimal(12,2) | YES |  |  |  |
| taxJurisdiction | varchar(50) | YES |  |  |  |
| passThroughTax | decimal(12,2) | YES |  |  |  |
| payoutDate | bigint | YES |  |  |  |
| payoutBankAccount | varchar(100) | YES |  |  |  |
| financialSource | enum(15) | YES |  |  |  |
| sourceDocUrl | varchar(1000) | YES |  |  |  |
| proofOfPaymentUrl | varchar(1000) | YES |  |  |  |

**Indexes:**
- `PRIMARY` (id) 
- `pb_icalUid_idx` (icalUid) 
- `pb_platformId_idx` (platformId) 
- `pb_propertyId_checkIn_idx` (propertyId,checkIn) 

---

## property_email_tokens

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | varchar(36) | NO |  | PRI |  |
| propertyId | varchar(36) | NO |  | MUL |  |
| emailAddress | varchar(320) | NO |  |  |  |
| provider | enum(7) | NO | gmail |  |  |
| accessToken | text(65535) | YES |  |  |  |
| refreshToken | text(65535) | YES |  |  |  |
| tokenExpiry | bigint | YES |  |  |  |
| scope | varchar(500) | YES |  |  |  |
| lastUsedAt | bigint | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

**Indexes:**
- `PRIMARY` (id) 
- `pet_property_email_uniq` (propertyId,emailAddress) 
- `pet_property_idx` (propertyId) 

---

## property_expense_records

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | int | NO |  | PRI | auto_increment |
| householdId | varchar(36) | NO |  | MUL |  |
| property | enum(17) | NO |  | MUL |  |
| expenseDate | timestamp | NO |  |  |  |
| expenseYear | int | NO |  | MUL |  |
| expenseMonth | int | NO |  |  |  |
| expenseDescription | varchar(500) | NO |  |  |  |
| category | varchar(100) | NO |  | MUL |  |
| amountJMD | decimal(14,2) | NO |  |  |  |
| paidTo | varchar(255) | YES |  |  |  |
| paidFrom | varchar(100) | YES |  |  |  |
| bankTransactionId | int | YES |  |  |  |
| documentId | int | YES |  |  |  |
| supportingDocUrl | text(65535) | YES |  |  |  |
| notes | text(65535) | YES |  |  |  |
| isReconciled | tinyint(1) | NO | 0 | MUL |  |
| isTaxDeductible | tinyint(1) | NO | 1 |  |  |
| source | enum(18) | NO | spreadsheet_import |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
| amountUSD | decimal(14,2) | YES |  |  |  |
| exchangeRateUsed | decimal(10,4) | YES |  |  |  |
| qboExpenseId | varchar(100) | YES |  |  |  |
| qboSyncStatus | enum(7) | NO | pending |  |  |
| qboSyncedAt | timestamp | YES |  |  |  |
| qboSyncError | text(65535) | YES |  |  |  |
| orderItemId | int | YES |  |  |  |
| proofOfPaymentUrl | varchar(1000) | YES |  |  |  |

**Indexes:**
- `PRIMARY` (id) 
- `per_category_idx` (category) 
- `per_household_idx` (householdId) 
- `per_property_idx` (property) 
- `per_reconciled_idx` (isReconciled) 
- `per_year_idx` (expenseYear) 

---

## property_member_order

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| memberId | varchar(36) | NO |  | PRI |  |
| householdId | varchar(36) | NO |  | MUL |  |
| propertyOrder | json | NO |  |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

**Indexes:**
- `PRIMARY` (memberId) 
- `pmo_household_idx` (householdId) 

---

## property_photos

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | varchar(36) | NO |  | PRI |  |
| propertyId | varchar(36) | NO |  | MUL |  |
| householdId | varchar(36) | NO |  |  |  |
| url | text(65535) | NO |  |  |  |
| s3Key | text(65535) | NO |  |  |  |
| caption | varchar(255) | YES |  |  |  |
| sortOrder | int | NO | 0 |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |

**Indexes:**
- `PRIMARY` (id) 
- `pp_property_idx` (propertyId) 

---

## property_platforms

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | varchar(36) | NO |  | PRI |  |
| propertyId | varchar(36) | NO |  |  |  |
| platform | enum(14) | NO |  |  |  |
| displayName | varchar(255) | YES |  |  |  |
| icalUrl | text(65535) | NO |  |  |  |
| lastPolledAt | bigint | YES |  |  |  |
| lastError | text(65535) | YES |  |  |  |
| isActive | tinyint(1) | YES | 1 |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
| notificationEmail | varchar(320) | YES |  |  |  |
| emailScrapingEnabled | tinyint(1) | YES | 0 |  |  |
| lastEmailScrapedAt | bigint | YES |  |  |  |
| emailNotificationEmailPrev | varchar(320) | YES |  |  |  |

**Indexes:**
- `PRIMARY` (id) 

---

## property_prep_rules

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | varchar(36) | NO |  | PRI |  |
| propertyId | varchar(36) | NO |  |  |  |
| blockDaysBefore | int | NO | 0 |  |  |
| blockDaysAfter | int | NO | 1 |  |  |
| blockNationalHolidays | tinyint(1) | YES | 0 |  |  |
| blockSundays | tinyint(1) | YES | 0 |  |  |
| customBlockDates | json | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

**Indexes:**
- `PRIMARY` (id) 

---

## scope_consent_preferences

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | varchar(36) | NO |  | PRI |  |
| userId | int | NO |  | MUL |  |
| scopeKey | varchar(128) | NO |  |  |  |
| dismissedAt | bigint | NO |  |  |  |

**Indexes:**
- `PRIMARY` (id) 
- `scope_consent_user_scope_uniq` (userId,scopeKey) 

---

## shadow_blocks

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | varchar(36) | NO |  | PRI |  |
| householdId | varchar(36) | NO |  | MUL |  |
| sourceEventId | varchar(36) | NO |  | MUL |  |
| sourceCalendarId | varchar(36) | NO |  |  |  |
| targetCalendarId | varchar(36) | NO |  |  |  |
| maskedTitle | varchar(500) | YES | Busy |  |  |
| isDismissed | tinyint(1) | YES | 0 |  |  |
| dismissedAt | timestamp | YES |  |  |  |
| externalEventId | varchar(500) | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
| startTime | bigint | YES |  |  |  |
| endTime | bigint | YES |  |  |  |
| isAllDay | tinyint(1) | NO | 0 |  |  |

**Indexes:**
- `PRIMARY` (id) 
- `sb_household_time_idx` (householdId,startTime,endTime) 
- `shadow_blocks_source_target_uniq` (sourceEventId,targetCalendarId) 

---

## shadow_overrides

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | varchar(36) | NO |  | PRI |  |
| eventId | varchar(36) | NO |  | MUL |  |
| calendarId | varchar(36) | NO |  |  |  |
| action | enum(7) | NO |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |

**Indexes:**
- `PRIMARY` (id) 
- `uq_event_calendar` (eventId,calendarId) 

---

## shopping_list_items

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | int | NO |  | PRI | auto_increment |
| listId | int | NO |  |  |  |
| name | varchar(255) | NO |  |  |  |
| quantity | int | YES | 1 |  |  |
| unit | varchar(50) | YES |  |  |  |
| category | varchar(100) | YES |  |  |  |
| notes | text(65535) | YES |  |  |  |
| estimatedPrice | decimal(10,2) | YES |  |  |  |
| currency | varchar(3) | YES | USD |  |  |
| preferredStore | varchar(100) | YES |  |  |  |
| productUrl | text(65535) | YES |  |  |  |
| status | enum(9) | NO | pending |  |  |
| forFamilyMemberId | int | YES |  |  |  |
| purchasedAt | timestamp | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

**Indexes:**
- `PRIMARY` (id) 

---

## shopping_lists

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | int | NO |  | PRI | auto_increment |
| userId | int | NO |  |  |  |
| name | varchar(255) | NO |  |  |  |
| description | text(65535) | YES |  |  |  |
| category | varchar(100) | YES |  |  |  |
| status | enum(9) | NO | active |  |  |
| isRecurring | tinyint(1) | YES | 0 |  |  |
| recurringSchedule | varchar(100) | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

**Indexes:**
- `PRIMARY` (id) 

---

## shopping_session_items

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | int | NO |  | PRI | auto_increment |
| sessionId | int | NO |  |  |  |
| listItemId | int | YES |  |  |  |
| name | varchar(500) | NO |  |  |  |
| quantity | int | YES | 1 |  |  |
| unit | varchar(50) | YES |  |  |  |
| assignedPlatform | varchar(100) | NO |  |  |  |
| originalPlatform | varchar(100) | YES |  |  |  |
| status | enum(13) | NO | queued |  |  |
| matchedProductName | varchar(500) | YES |  |  |  |
| matchedProductUrl | text(65535) | YES |  |  |  |
| matchedPrice | decimal(10,2) | YES |  |  |  |
| matchConfidence | int | YES |  |  |  |
| substitutionReason | text(65535) | YES |  |  |  |
| originalProductName | varchar(500) | YES |  |  |  |
| transferReason | text(65535) | YES |  |  |  |
| estimatedDelivery | varchar(255) | YES |  |  |  |
| fulfillmentMethod | varchar(100) | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

**Indexes:**
- `PRIMARY` (id) 

---

## shopping_sessions

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | int | NO |  | PRI | auto_increment |
| userId | int | NO |  |  |  |
| listId | int | NO |  |  |  |
| listName | varchar(255) | NO |  |  |  |
| status | enum(19) | NO | ready |  |  |
| walmartTotal | decimal(12,2) | YES | 0 |  |  |
| amazonTotal | decimal(12,2) | YES | 0 |  |  |
| overallTotal | decimal(12,2) | YES | 0 |  |  |
| deliveryInfo | json | YES |  |  |  |
| totalItems | int | YES | 0 |  |  |
| itemsFound | int | YES | 0 |  |  |
| itemsSubstituted | int | YES | 0 |  |  |
| itemsUnavailable | int | YES | 0 |  |  |
| itemsCrossTransferred | int | YES | 0 |  |  |
| notifications | json | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

**Indexes:**
- `PRIMARY` (id) 

---

## stripe_transactions

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | int | NO |  | PRI | auto_increment |
| stripe_txn_id | varchar(100) | YES |  | UNI |  |
| type | varchar(50) | NO |  |  |  |
| source | varchar(100) | YES |  |  |  |
| amount | decimal(12,2) | NO |  |  |  |
| fee | decimal(12,2) | YES | 0 |  |  |
| destination_platform_fee | decimal(12,2) | YES | 0 |  |  |
| net | decimal(12,2) | NO |  |  |  |
| currency | varchar(10) | YES | usd |  |  |
| customer_facing_amount | decimal(12,2) | YES |  |  |  |
| customer_facing_currency | varchar(10) | YES |  |  |  |
| created_at | datetime | NO |  |  |  |
| available_on | datetime | YES |  |  |  |
| description | text(65535) | YES |  |  |  |
| business_vertical | enum(15) | NO |  |  |  |
| sub_category | varchar(100) | YES |  |  |  |
| booking_confirmation | varchar(50) | YES |  |  |  |
| order_reference | varchar(100) | YES |  |  |  |
| transfer_id | varchar(100) | YES |  |  |  |
| transfer_date | date | YES |  |  |  |
| metadata_json | json | YES |  |  |  |
| created_in_db | timestamp | YES | CURRENT_TIMESTAMP |  |  |

**Indexes:**
- `PRIMARY` (id) 
- `stripe_txn_id` (stripe_txn_id) 

---

## subscriptions

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | varchar(36) | NO |  | PRI |  |
| householdId | varchar(36) | NO |  |  |  |
| plan | enum(7) | NO | free |  |  |
| seatsIncluded | int | YES | 5 |  |  |
| seatsUsed | int | YES | 1 |  |  |
| additionalSeats | int | YES | 0 |  |  |
| addOns | json | YES |  |  |  |
| stripeCustomerId | varchar(255) | YES |  |  |  |
| stripeSubscriptionId | varchar(255) | YES |  |  |  |
| status | enum(9) | NO | trialing |  |  |
| currentPeriodStart | bigint | YES |  |  |  |
| currentPeriodEnd | bigint | YES |  |  |  |
| cancelledAt | timestamp | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

**Indexes:**
- `PRIMARY` (id) 

---

## sync_log

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | int | NO |  | PRI | auto_increment |
| householdId | varchar(36) | NO |  |  |  |
| calendarId | varchar(36) | NO |  |  |  |
| action | enum(17) | NO |  |  |  |
| details | json | YES |  |  |  |
| eventsAffected | int | YES | 0 |  |  |
| errorMessage | text(65535) | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |

**Indexes:**
- `PRIMARY` (id) 

---

## transactions

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | int | NO |  | PRI | auto_increment |
| userId | int | NO |  |  |  |
| bankAccountId | int | YES |  |  |  |
| description | varchar(500) | NO |  |  |  |
| amount | decimal(12,2) | NO |  |  |  |
| currency | varchar(3) | NO | USD |  |  |
| exchangeRate | decimal(10,4) | YES |  |  |  |
| type | enum(8) | NO | expense |  |  |
| expenseCategory | varchar(100) | YES |  |  |  |
| classification | enum(8) | NO | personal |  |  |
| aiConfidence | int | YES |  |  |  |
| isManualOverride | tinyint(1) | YES | 0 |  |  |
| vendor | varchar(255) | YES |  |  |  |
| platform | varchar(100) | YES |  |  |  |
| receiptUrl | text(65535) | YES |  |  |  |
| notes | text(65535) | YES |  |  |  |
| isTaxDeductible | tinyint(1) | YES | 0 |  |  |
| taxCategory | varchar(100) | YES |  |  |  |
| transactionDate | timestamp | NO |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

**Indexes:**
- `PRIMARY` (id) 

---

## users

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | int | NO |  | PRI | auto_increment |
| openId | varchar(64) | NO |  | UNI |  |
| name | text(65535) | YES |  |  |  |
| email | varchar(320) | YES |  |  |  |
| loginMethod | varchar(64) | YES |  |  |  |
| role | enum(12) | NO | user |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
| lastSignedIn | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| householdId | varchar(36) | YES |  |  |  |
| memberId | varchar(36) | YES |  |  |  |
| deviceTimezone | varchar(64) | YES |  |  |  |
| deviceCity | varchar(128) | YES |  |  |  |

**Indexes:**
- `PRIMARY` (id) 
- `users_openId_unique` (openId) 

---

## vertical_data_policies

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | varchar(36) | NO |  | PRI |  |
| householdId | varchar(36) | NO |  | MUL |  |
| verticalId | varchar(36) | NO |  | MUL |  |
| dataCategory | enum(11) | NO |  |  |  |
| hiddenFromRoles | json | YES |  |  |  |
| hiddenFromMemberIds | json | YES |  |  |  |
| configuredByMemberId | varchar(36) | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

**Indexes:**
- `PRIMARY` (id) 
- `vdp_household_idx` (householdId) 
- `vdp_vertical_category_uniq` (verticalId,dataCategory) 
- `vdp_vertical_idx` (verticalId) 

---

## vertical_integrations

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | varchar(36) | NO |  | PRI |  |
| verticalId | varchar(36) | NO |  |  |  |
| householdId | varchar(36) | NO |  |  |  |
| memberId | varchar(36) | NO |  |  |  |
| integrationType | enum(8) | NO |  |  |  |
| provider | varchar(100) | NO |  |  |  |
| accountEmail | varchar(320) | YES |  |  |  |
| displayName | varchar(255) | YES |  |  |  |
| calendarId | varchar(36) | YES |  |  |  |
| status | enum(12) | NO | active |  |  |
| metadata | json | YES |  |  |  |
| lastSyncAt | timestamp | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

**Indexes:**
- `PRIMARY` (id) 

---

## vertical_member_access

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | varchar(36) | NO |  | PRI |  |
| householdId | varchar(36) | NO |  | MUL |  |
| verticalId | varchar(36) | NO |  | MUL |  |
| memberId | varchar(36) | NO |  | MUL |  |
| accessLevel | enum(9) | NO | read_only |  |  |
| calendarAccess | enum(17) | NO | default_vertical |  |  |
| allowedCalendarIds | json | YES |  |  |  |
| canRequestMeetings | tinyint(1) | NO | 1 |  |  |
| excludeMultiDayEvents | tinyint(1) | NO | 0 |  |  |
| configuredByMemberId | varchar(36) | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

**Indexes:**
- `PRIMARY` (id) 
- `vma_household_idx` (householdId) 
- `vma_member_idx` (memberId) 
- `vma_member_vertical_uniq` (memberId,verticalId) 
- `vma_vertical_idx` (verticalId) 

---

## vertical_owners

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | varchar(36) | NO |  | PRI |  |
| verticalId | varchar(36) | NO |  |  |  |
| userId | int | NO |  |  |  |
| role | enum(6) | NO | owner |  |  |
| addedByUserId | int | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |

**Indexes:**
- `PRIMARY` (id) 

---

## vertical_visibility

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | varchar(36) | NO |  | PRI |  |
| fromVerticalId | varchar(36) | NO |  |  |  |
| toVerticalId | varchar(36) | NO |  |  |  |
| visibilityLevel | enum(9) | NO | busy_only |  |  |
| configuredByUserId | int | YES |  |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
| busyLabel | varchar(50) | YES | Busy |  |  |
| calendarExclusions | json | YES |  |  |  |

**Indexes:**
- `PRIMARY` (id) 

---

## verticals

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | varchar(36) | NO |  | PRI |  |
| householdId | varchar(36) | NO |  |  |  |
| name | varchar(255) | NO |  |  |  |
| icon | varchar(100) | YES |  |  |  |
| color | varchar(20) | YES |  |  |  |
| description | text(65535) | YES |  |  |  |
| isActive | tinyint(1) | YES | 1 |  |  |
| sortOrder | int | YES | 0 |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
| privacyLevel | enum(10) | NO | household |  |  |
| busyLabel | varchar(50) | YES | Busy |  |  |
| ownerMemberId | varchar(36) | YES |  |  |  |

**Indexes:**
- `PRIMARY` (id) 

---

## webhook_channels

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | varchar(36) | NO |  | PRI |  |
| householdId | varchar(36) | NO |  |  |  |
| calendarId | varchar(36) | NO |  |  |  |
| resourceId | varchar(255) | YES |  |  |  |
| resourceUri | text(65535) | YES |  |  |  |
| notificationUrl | varchar(512) | YES |  |  |  |
| expiresAt | bigint | NO |  |  |  |
| token | varchar(255) | YES |  |  |  |
| status | enum(7) | YES | active |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |

**Indexes:**
- `PRIMARY` (id) 

---

## whatsapp_imports

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | int | NO |  | PRI | auto_increment |
| userId | int | NO |  |  |  |
| contactName | varchar(255) | YES |  |  |  |
| rawMessage | text(65535) | NO |  |  |  |
| parsedItems | json | YES |  |  |  |
| shoppingListId | int | YES |  |  |  |
| importedAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |

**Indexes:**
- `PRIMARY` (id) 

---

## widget_layouts

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| memberId | varchar(36) | NO |  | PRI |  |
| householdId | varchar(36) | NO |  | MUL |  |
| layout | json | NO |  |  |  |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP |  | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

**Indexes:**
- `PRIMARY` (memberId) 
- `wl_household_idx` (householdId) 

---

## Table Row Counts

| Table | Rows |
|-------|------|
| __drizzle_migrations | 7 |
| airbnb_payout_records | 290 |
| audit_log | 353 |
| bank_accounts | 0 |
| beta_signups | 0 |
| biz_account_transactions | 963 |
| boa_transactions | 2650 |
| booking_overrides | 0 |
| booking_requests | 2 |
| booking_screenshots | 0 |
| calendars | 56 |
| capital_one_transactions | 2152 |
| chat_messages | 28 |
| contact_messages | 0 |
| contractor_payments | 467 |
| custom_roles | 1 |
| devices | 0 |
| email_scrape_jobs | 466 |
| events | 23939 |
| exchange_rates | 0 |
| expense_categorization_rules | 0 |
| family_members | 1 |
| financial_accounts | 4 |
| financial_documents | 419 |
| financial_transactions | 1309 |
| household_members | 49 |
| households | 42 |
| ltr_deposit_ledger | 2 |
| ltr_lease_tenants | 3 |
| ltr_leases | 2 |
| ltr_payments | 13 |
| ltr_tenants | 3 |
| member_permission_overrides | 1 |
| member_resources | 5 |
| notes | 0 |
| oauth_nonces | 1 |
| oauth_tokens | 11 |
| order_items | 419 |
| orders | 239 |
| platform_credentials | 1 |
| platform_export_imports | 0 |
| product_mappings | 73 |
| project_knowledge | 196 |
| project_tasks | 565 |
| propagation_queue | 12151 |
| properties | 6 |
| property_bookings | 422 |
| property_email_tokens | 0 |
| property_expense_records | 258 |
| property_member_order | 0 |
| property_photos | 0 |
| property_platforms | 10 |
| property_prep_rules | 3 |
| scope_consent_preferences | 1 |
| shadow_blocks | 53645 |
| shadow_overrides | 0 |
| shopping_list_items | 135 |
| shopping_lists | 7 |
| shopping_session_items | 267 |
| shopping_sessions | 8 |
| stripe_transactions | 186 |
| subscriptions | 12080 |
| sync_log | 0 |
| transactions | 0 |
| users | 11 |
| vertical_data_policies | 4 |
| vertical_integrations | 0 |
| vertical_member_access | 11 |
| vertical_owners | 6192 |
| vertical_visibility | 30 |
| verticals | 243 |
| webhook_channels | 38 |
| whatsapp_imports | 4 |
| widget_layouts | 1 |

---

## exchange_rates (ADDED Jul 5, 2026)

| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| id | int | NO |  | PRI | auto_increment |
| rateDate | date | NO |  | MUL |  |
| baseCurrency | varchar(3) | NO |  |  |  |
| targetCurrency | varchar(3) | NO |  |  |  |
| rate | decimal(16,8) | NO |  |  |  |
| inverseRate | decimal(16,8) | NO |  |  |  |
| source | enum('fawazahmed0','boj','manual','calculated','ecb') | NO | fawazahmed0 |  |  |
| fetchedAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP |  |  |

**Indexes:**
- `PRIMARY` (id)
- `uq_rate_date_pair` UNIQUE (rateDate, baseCurrency, targetCurrency)
- `idx_pair_date` (baseCurrency, targetCurrency, rateDate)

**Row count:** 2,249 (as of Jul 5, 2026)

**Notes:** Global table (no householdId). Stores daily exchange rates for all active currency pairs. Populated by daily heartbeat at /api/scheduled/exchange-rate-fetch (06:00 UTC). Currently contains USD/JMD rates from 2020-05-09 to 2026-07-05.

---

## households (UPDATED Jul 5, 2026 — new column)

**New column added:**
| Column | Type | Nullable | Default | Key | Extra |
|--------|------|----------|---------|-----|-------|
| defaultCurrency | varchar(3) | YES | USD |  |  |

**Notes:** Household's home/default reporting currency. Controls dashboard currency display. UI currency selector not yet implemented.

