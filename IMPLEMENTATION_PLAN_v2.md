# Motivated Seller Outreach Platform

## Implementation Plan v2.0

**Document Version:** 2.0
**Created:** February 2026
**Revised:** March 2026
**Status:** Ready for Development

---

## Revision Summary (v2.0)

| Issue | Resolution |
|-------|------------|
| PropStream API uncertainty | Added verification step + BatchLeads alternative |
| Webhook security | Added signature verification for all webhooks |
| Meta token expiration | Added automated refresh + alerting |
| Security rules | Fixed for per-user data isolation |
| DNC compliance | Added federal DNC registry integration |
| CAN-SPAM | Added required config fields |
| State RVM laws | Added state-based filtering |
| Reply detection | Full implementation with SendGrid Inbound Parse |
| Email warmup | Added warmup schedule system |
| Bounce handling | Differentiated hard vs soft bounces |
| Retry logic | Added exponential backoff utility |
| Cold starts | Added onInit() patterns |
| Cost estimates | Revised with realistic projections |

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Third-Party Services](#4-third-party-services)
5. [Data Models](#5-data-models)
6. [Shared Utilities](#6-shared-utilities)
7. [Phase 1: Foundation](#7-phase-1-foundation)
8. [Phase 2: Data Ingestion](#8-phase-2-data-ingestion)
9. [Phase 3: Email Campaigns](#9-phase-3-email-campaigns)
10. [Phase 4: Meta Ads Integration](#10-phase-4-meta-ads-integration)
11. [Phase 5: Ringless Voicemail](#11-phase-5-ringless-voicemail)
12. [Phase 6: Admin Dashboard](#12-phase-6-admin-dashboard)
13. [Phase 7: Response Tracking & CRM](#13-phase-7-response-tracking--crm)
14. [Testing Strategy](#14-testing-strategy)
15. [Deployment](#15-deployment)
16. [Monitoring & Maintenance](#16-monitoring--maintenance)
17. [Security & Compliance](#17-security--compliance)
18. [Cost Projections](#18-cost-projections)
19. [Timeline](#19-timeline)

---

## 1. Project Overview

### 1.1 Objective

Build an automated marketing platform that identifies motivated sellers (properties on market 90+ days), enriches leads with owner contact information, and executes coordinated multi-channel outreach (email, social ads, ringless voicemail).

### 1.2 Success Criteria

- [ ] Automatically ingest 1,000+ listings daily across configured zip codes
- [ ] Skip trace and enrich 95%+ of leads with valid contact info
- [ ] Execute 5-touch email sequences with <1% bounce rate
- [ ] Maintain Meta custom audiences with daily sync
- [ ] Deliver ringless voicemails with 90%+ success rate
- [ ] Surface hot leads within 5 minutes of response
- [ ] Dashboard load time <2 seconds

### 1.3 Non-Goals (V1)

- Direct mail automation (future phase)
- SMS/text messaging (TCPA complexity)
- Live calling/dialer integration
- Multiple user/team support
- White-label/multi-tenant

---

## 2. Architecture

### 2.1 System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              EXTERNAL SERVICES                               │
├─────────────────┬─────────────────┬─────────────────┬───────────────────────┤
│   BatchLeads    │    SendGrid     │    Meta Ads     │    Slybroadcast       │
│   (Primary)     │    + Inbound    │    Graph API    │                       │
│   PropStream    │      Parse      │                 │                       │
│   (Fallback)    │                 │                 │                       │
├─────────────────┼─────────────────┼─────────────────┼───────────────────────┤
│   DNC.com       │                 │                 │                       │
│   (Compliance)  │                 │                 │                       │
└────────┬────────┴────────┬────────┴────────┬────────┴───────────┬───────────┘
         │                 │                 │                    │
         ▼                 ▼                 ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FIREBASE CLOUD FUNCTIONS                           │
├─────────────────┬─────────────────┬─────────────────┬───────────────────────┤
│   Ingestion     │   Email         │   Meta          │   RVM                 │
│   Service       │   Service       │   Service       │   Service             │
├─────────────────┴─────────────────┴─────────────────┴───────────────────────┤
│                          Shared Utilities Layer                              │
│            (retry, webhook verification, DNC check, logging)                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                          Orchestration Engine                                │
└─────────────────────────────────────────────────────────────────────────────┘
         │                 │                 │                    │
         ▼                 ▼                 ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FIRESTORE DATABASE                              │
├─────────────────┬─────────────────┬─────────────────┬───────────────────────┤
│   /config       │   /leads        │   /sequences    │   /outreachLog        │
│   /users        │   /dnc          │   /campaigns    │   /metaAudiences      │
│   /alerts       │   /warmup       │   /webhookEvents│   /tokenRefresh       │
└─────────────────┴─────────────────┴─────────────────┴───────────────────────┘
```

### 2.2 Data Flow

```
1. INGESTION (Daily 6 AM) - Fan-out Pattern
   Orchestrator → Cloud Tasks (per zip code) → BatchLeads API
   → Filter by criteria → Firestore /leads (status: "new")

2. ENRICHMENT (On new lead)
   /leads document created → Skip trace API → DNC Registry Check
   → Update lead + set status: "enriched" or "dnc_blocked"

3. EMAIL SEQUENCE (Daily 9 AM) - With Warmup
   Check warmup limits → Query leads ready for next email
   → SendGrid API → Update sequence step → Log to /outreachLog

4. META AUDIENCE SYNC (Daily 3 AM)
   Verify token valid → Query leads not in audience → Hash PII
   → Upload to Meta Custom Audience → Mark addedToMetaAudience: true

5. RINGLESS VOICEMAIL (Daily 11 AM, Weekdays)
   Check state laws → Query eligible leads → DNC re-check
   → Slybroadcast API → Update rvmSentAt → Log to /outreachLog

6. RESPONSE HANDLING (Real-time)
   SendGrid Inbound Parse → Verify signature → Parse reply
   → Update lead status = "responded" → Create alert → Notify agent

7. TOKEN REFRESH (Daily 1 AM)
   Check Meta token expiration → Refresh if < 7 days remaining
   → Update stored token → Alert if refresh fails
```

---

## 3. Technology Stack

### 3.1 Backend

| Component | Technology | Justification |
|-----------|------------|---------------|
| Runtime | Node.js 20 | Firebase Functions default, async-friendly |
| Language | TypeScript 5.x | Type safety, better maintainability |
| Database | Firestore | Real-time, serverless, scales automatically |
| Functions | Cloud Functions v2 | Scheduled tasks, triggers, webhooks |
| Task Queue | Cloud Tasks | Fan-out for parallel processing |
| Secrets | Secret Manager | Secure API key storage |
| Storage | Cloud Storage | Audio files for RVM |

### 3.2 Frontend

| Component | Technology | Justification |
|-----------|------------|---------------|
| Framework | React 18 | Component model, ecosystem |
| Build Tool | Vite | Fast builds, modern tooling |
| Styling | Tailwind CSS | Rapid UI development |
| State | React Query + Zustand | Server state + local state |
| Charts | Recharts | Simple, React-native |
| Hosting | Firebase Hosting | Integrated with backend |

---

## 4. Third-Party Services

### 4.1 Required Accounts

| Service | Purpose | Signup URL | Estimated Cost |
|---------|---------|------------|----------------|
| **Firebase** | Backend infrastructure | console.firebase.google.com | $50-100/mo |
| **BatchLeads** | Listing data + skip tracing | batchleads.io | $99/mo |
| **SendGrid** | Transactional email + inbound | sendgrid.com | $20/mo |
| **DNC.com** | Federal DNC registry | dnc.com | ~$50/mo |
| **Meta Business** | Facebook/Instagram ads | business.facebook.com | Free (ad spend separate) |
| **Slybroadcast** | Ringless voicemail | slybroadcast.com | $0.03/drop |

### 4.2 Pre-Development Verification Checklist

**CRITICAL: Complete before starting Phase 2**

```
[ ] BatchLeads API access confirmed
    - Contact: api@batchleads.io
    - Verify: Search endpoint, skip trace endpoint, rate limits
    - Get: API documentation, sandbox credentials

[ ] PropStream API status (backup option)
    - Contact: support@propstream.com
    - Ask: "Do you offer API access for listing data and skip tracing?"
    - Note: May require enterprise plan

[ ] SendGrid Inbound Parse setup
    - Requires: MX record configuration
    - Domain: replies.yourdomain.com
    - Verify: Can receive and parse emails

[ ] DNC.com API access
    - Signup: dnc.com/api
    - Verify: Batch lookup capability
    - Get: API key and documentation

[ ] Meta Marketing API
    - Create: Facebook App
    - Request: ads_management, ads_read permissions
    - Note: May require business verification (takes 2-5 days)
```

### 4.3 API Credentials

```
# Core Services
BATCHLEADS_API_KEY          # Primary data provider
BATCHLEADS_API_SECRET
PROPSTREAM_API_KEY          # Fallback (if available)

# Email
SENDGRID_API_KEY
SENDGRID_WEBHOOK_SECRET     # For signature verification

# DNC Compliance
DNC_API_KEY
DNC_API_SECRET

# Meta Ads
META_APP_ID
META_APP_SECRET
META_ACCESS_TOKEN           # Long-lived, refresh before expiry
META_AD_ACCOUNT_ID

# RVM
SLYBROADCAST_UID
SLYBROADCAST_PASSWORD
```

---

## 5. Data Models

### 5.1 Firestore Collections

#### /config/{oderId}

```typescript
interface Config {
  userId: string;

  // Targeting
  targetZipCodes: string[];
  minDaysOnMarket: number;
  minListPrice: number;
  maxListPrice: number;
  propertyTypes: ("single_family" | "multi_family" | "condo" | "townhouse")[];

  // Company Info (CAN-SPAM Required)
  companyName: string;
  physicalAddress: string;
  physicalCity: string;
  physicalState: string;
  physicalZip: string;

  // Email
  emailEnabled: boolean;
  emailSequenceId: string;
  fromEmail: string;
  fromName: string;
  replyToEmail: string;
  inboundEmailDomain: string; // e.g., "replies.yourdomain.com"

  // Email Warmup
  warmupEnabled: boolean;
  warmupStartDate: Timestamp | null;
  warmupCurrentDay: number;
  warmupDailyLimits: number[]; // [50, 100, 150, 200, 300, 500, 750, 1000]

  // Meta Ads
  metaAdsEnabled: boolean;
  metaAdAccountId: string;
  metaPixelId: string;
  dailyAdBudgetCents: number;

  // RVM
  rvmEnabled: boolean;
  rvmProvider: "slybroadcast" | "dropcowboy";
  rvmAudioUrl: string;
  rvmCallerId: string;
  rvmStartAfterStep: number;
  rvmBlockedStates: string[]; // States with strict RVM laws

  // Data Provider
  dataProvider: "batchleads" | "propstream";

  // Sync state
  lastListingSyncAt: Timestamp | null;
  lastAudienceSyncAt: Timestamp | null;
  lastDncSyncAt: Timestamp | null;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

#### /leads/{leadId}

```typescript
interface Lead {
  // Identifiers
  id: string;
  oderId: string; // Links to config owner

  // Property info
  address: string;
  city: string;
  state: string;
  zipCode: string;
  county: string;

  listPrice: number;
  listDate: Timestamp;
  daysOnMarket: number;
  propertyType: string;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  yearBuilt: number;

  mlsNumber: string;
  listingAgentName: string;
  listingAgentPhone: string;

  // Owner info (populated by skip trace)
  ownerName: string;
  ownerFirstName: string;
  ownerLastName: string;
  ownerMailingAddress: string;
  ownerMailingCity: string;
  ownerMailingState: string;
  ownerMailingZip: string;

  emails: string[];
  phones: string[];
  primaryEmail: string | null;
  primaryPhone: string | null;

  // Enrichment
  estimatedEquity: number | null;
  mortgageBalance: number | null;
  ownerOccupied: boolean;
  yearsOwned: number | null;

  // Compliance
  dncCheckedAt: Timestamp | null;
  dncStatus: "clear" | "blocked" | "pending" | null;
  dncBlockedPhones: string[]; // Specific phones on DNC

  // Pipeline
  status: LeadStatus;
  source: "batchleads" | "propstream" | "manual";
  tags: string[];
  notes: string;
  assignedTo: string | null;

  // Email tracking
  emailSequenceId: string | null;
  emailSequenceStep: number;
  lastEmailSentAt: Timestamp | null;
  nextEmailScheduledAt: Timestamp | null;
  emailOpens: number;
  emailClicks: number;
  emailReplies: number;
  emailBounced: boolean;
  emailBounceType: "hard" | "soft" | null;
  emailUnsubscribed: boolean;

  // Meta tracking
  addedToMetaAudience: boolean;
  metaAudienceId: string | null;
  metaAudienceAddedAt: Timestamp | null;

  // RVM tracking
  rvmSentAt: Timestamp | null;
  rvmDeliveryStatus: "pending" | "delivered" | "failed" | null;
  rvmCallbackReceived: boolean;

  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
  enrichedAt: Timestamp | null;
  respondedAt: Timestamp | null;
  convertedAt: Timestamp | null;
}

type LeadStatus =
  | "new"              // Just ingested
  | "enriching"        // Skip trace in progress
  | "enriched"         // Ready for outreach
  | "dnc_blocked"      // On Do Not Call list
  | "outreach_active"  // In email sequence
  | "responded"        // Owner replied/called back
  | "appointment"      // Meeting scheduled
  | "deal"             // Under contract
  | "closed"           // Deal closed
  | "dead"             // Not interested, bad data
  | "paused";          // Manually paused
```

#### /dnc/{phoneHash}

```typescript
interface DncEntry {
  phoneHash: string; // SHA256 of normalized phone
  source: "federal" | "state" | "internal" | "complaint";
  addedAt: Timestamp;
  expiresAt: Timestamp | null; // Internal entries may expire
  reason: string | null;
}
```

#### /warmup/{configId}

```typescript
interface WarmupStatus {
  configId: string;
  startDate: Timestamp;
  currentDay: number;
  dailyLimits: number[];
  sentToday: number;
  lastResetAt: Timestamp;

  // Deliverability tracking
  totalSent: number;
  totalBounced: number;
  totalComplaints: number;
  bounceRate: number;
  complaintRate: number;

  // Status
  status: "active" | "paused" | "completed" | "failed";
  pauseReason: string | null;
}
```

#### /tokenRefresh/{service}

```typescript
interface TokenRefresh {
  service: "meta" | "google" | "other";
  accessToken: string; // Encrypted
  refreshToken: string | null; // Encrypted
  expiresAt: Timestamp;
  lastRefreshedAt: Timestamp;
  refreshAttempts: number;
  lastError: string | null;
}
```

### 5.2 Security Rules (Fixed for Per-User Access)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper functions
    function isAuthenticated() {
      return request.auth != null;
    }

    function isOwner(userId) {
      return request.auth.uid == userId;
    }

    function isLeadOwner() {
      return resource.data.userId == request.auth.uid;
    }

    // Config - user can only access their own
    match /config/{userId} {
      allow read, write: if isAuthenticated() && isOwner(userId);
    }

    // Leads - user can only read their own leads
    match /leads/{leadId} {
      allow read: if isAuthenticated() && isLeadOwner();
      allow create: if false; // Only Cloud Functions
      allow update: if isAuthenticated() && isLeadOwner();
      allow delete: if false;
    }

    // Email sequences - user's own only
    match /emailSequences/{sequenceId} {
      allow read: if isAuthenticated() &&
        resource.data.userId == request.auth.uid;
      allow write: if isAuthenticated() &&
        request.resource.data.userId == request.auth.uid;
    }

    // Outreach log - read own only
    match /outreachLog/{logId} {
      allow read: if isAuthenticated() &&
        resource.data.userId == request.auth.uid;
      allow write: if false;
    }

    // DNC list - no client access (sensitive)
    match /dnc/{phoneHash} {
      allow read, write: if false;
    }

    // Warmup status - read own only
    match /warmup/{configId} {
      allow read: if isAuthenticated() && isOwner(configId);
      allow write: if false;
    }

    // Alerts - user's own only
    match /alerts/{alertId} {
      allow read, update: if isAuthenticated() &&
        resource.data.userId == request.auth.uid;
      allow create, delete: if false;
    }

    // Token refresh - no client access
    match /tokenRefresh/{service} {
      allow read, write: if false;
    }

    // Webhook events - no client access
    match /webhookEvents/{eventId} {
      allow read, write: if false;
    }
  }
}
```

---

## 6. Shared Utilities

### 6.1 Retry with Exponential Backoff

```typescript
// functions/src/utils/retry.ts
export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: string[];
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN"],
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | null = null;
  let delay = opts.initialDelayMs;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      const isRetryable =
        error instanceof Error &&
        (opts.retryableErrors.some((e) => error.message.includes(e)) ||
          (error as any).status >= 500 ||
          (error as any).status === 429);

      if (!isRetryable || attempt === opts.maxAttempts) {
        throw error;
      }

      console.warn(
        `Attempt ${attempt} failed, retrying in ${delay}ms:`,
        error instanceof Error ? error.message : error
      );

      await sleep(delay);
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

### 6.2 Webhook Signature Verification

```typescript
// functions/src/utils/webhookVerification.ts
import crypto from "crypto";

export function verifySendGridSignature(
  publicKey: string,
  payload: string,
  signature: string,
  timestamp: string
): boolean {
  const timestampPayload = timestamp + payload;

  const decodedSignature = Buffer.from(signature, "base64");

  const verifier = crypto.createVerify("sha256");
  verifier.update(timestampPayload);

  return verifier.verify(
    {
      key: publicKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    },
    decodedSignature
  );
}

export function verifySendGridWebhook(
  req: any,
  webhookSecret: string
): boolean {
  const signature = req.headers["x-twilio-email-event-webhook-signature"];
  const timestamp = req.headers["x-twilio-email-event-webhook-timestamp"];

  if (!signature || !timestamp) {
    return false;
  }

  const payload = JSON.stringify(req.body);

  return verifySendGridSignature(webhookSecret, payload, signature, timestamp);
}

export function verifySlackSignature(
  signingSecret: string,
  signature: string,
  timestamp: string,
  body: string
): boolean {
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;

  if (parseInt(timestamp) < fiveMinutesAgo) {
    return false; // Request too old
  }

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature =
    "v0=" +
    crypto.createHmac("sha256", signingSecret).update(sigBasestring).digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(mySignature),
    Buffer.from(signature)
  );
}
```

### 6.3 DNC Registry Check

```typescript
// functions/src/utils/dncCheck.ts
import { db } from "../config/firebase";
import { withRetry } from "./retry";
import crypto from "crypto";

const DNC_API_BASE = "https://api.dnc.com/v2";

interface DncCheckResult {
  phone: string;
  isBlocked: boolean;
  source: "federal" | "state" | "internal" | null;
  checkedAt: Date;
}

export class DncChecker {
  private apiKey: string;
  private apiSecret: string;

  constructor(apiKey: string, apiSecret: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  async checkPhone(phone: string): Promise<DncCheckResult> {
    const normalized = this.normalizePhone(phone);
    if (!normalized) {
      return {
        phone,
        isBlocked: true, // Invalid phone = blocked
        source: null,
        checkedAt: new Date(),
      };
    }

    // Check internal DNC first (faster)
    const internalBlock = await this.checkInternalDnc(normalized);
    if (internalBlock) {
      return {
        phone: normalized,
        isBlocked: true,
        source: internalBlock.source as "internal",
        checkedAt: new Date(),
      };
    }

    // Check federal DNC registry
    const federalResult = await this.checkFederalDnc(normalized);

    return {
      phone: normalized,
      isBlocked: federalResult.isBlocked,
      source: federalResult.isBlocked ? "federal" : null,
      checkedAt: new Date(),
    };
  }

  async checkPhones(phones: string[]): Promise<Map<string, DncCheckResult>> {
    const results = new Map<string, DncCheckResult>();

    // Batch check with federal DNC
    const normalizedPhones = phones
      .map((p) => this.normalizePhone(p))
      .filter((p): p is string => p !== null);

    const federalResults = await this.batchCheckFederalDnc(normalizedPhones);

    for (const phone of phones) {
      const normalized = this.normalizePhone(phone);
      if (!normalized) {
        results.set(phone, {
          phone,
          isBlocked: true,
          source: null,
          checkedAt: new Date(),
        });
        continue;
      }

      results.set(phone, federalResults.get(normalized) || {
        phone: normalized,
        isBlocked: false,
        source: null,
        checkedAt: new Date(),
      });
    }

    return results;
  }

  private async checkInternalDnc(
    phone: string
  ): Promise<{ source: string } | null> {
    const phoneHash = this.hashPhone(phone);
    const doc = await db.collection("dnc").doc(phoneHash).get();

    if (doc.exists) {
      const data = doc.data()!;
      // Check if expired
      if (data.expiresAt && data.expiresAt.toDate() < new Date()) {
        return null;
      }
      return { source: data.source };
    }

    return null;
  }

  private async checkFederalDnc(
    phone: string
  ): Promise<{ isBlocked: boolean }> {
    return withRetry(async () => {
      const response = await fetch(`${DNC_API_BASE}/check`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ phones: [phone] }),
      });

      if (!response.ok) {
        throw new Error(`DNC API error: ${response.status}`);
      }

      const data = await response.json();
      return { isBlocked: data.results[0]?.onDnc || false };
    });
  }

  private async batchCheckFederalDnc(
    phones: string[]
  ): Promise<Map<string, DncCheckResult>> {
    const results = new Map<string, DncCheckResult>();

    // DNC.com allows batches of 1000
    const batchSize = 1000;

    for (let i = 0; i < phones.length; i += batchSize) {
      const batch = phones.slice(i, i + batchSize);

      const response = await withRetry(async () => {
        const res = await fetch(`${DNC_API_BASE}/check`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ phones: batch }),
        });

        if (!res.ok) {
          throw new Error(`DNC API error: ${res.status}`);
        }

        return res.json();
      });

      for (const result of response.results) {
        results.set(result.phone, {
          phone: result.phone,
          isBlocked: result.onDnc,
          source: result.onDnc ? "federal" : null,
          checkedAt: new Date(),
        });
      }

      // Rate limit between batches
      if (i + batchSize < phones.length) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    return results;
  }

  async addToInternalDnc(
    phone: string,
    source: "internal" | "complaint",
    reason?: string
  ): Promise<void> {
    const normalized = this.normalizePhone(phone);
    if (!normalized) return;

    const phoneHash = this.hashPhone(normalized);

    await db.collection("dnc").doc(phoneHash).set({
      phoneHash,
      source,
      addedAt: new Date(),
      expiresAt: null,
      reason: reason || null,
    });
  }

  private normalizePhone(phone: string): string | null {
    const digits = phone.replace(/\D/g, "");

    if (digits.length === 10) {
      return digits;
    } else if (digits.length === 11 && digits.startsWith("1")) {
      return digits.slice(1);
    }

    return null;
  }

  private hashPhone(phone: string): string {
    return crypto.createHash("sha256").update(phone).digest("hex");
  }
}
```

### 6.4 Structured Logging

```typescript
// functions/src/utils/logging.ts
import { logger } from "firebase-functions/v2";

interface LogContext {
  userId?: string;
  leadId?: string;
  function?: string;
  [key: string]: any;
}

export function logInfo(message: string, context?: LogContext): void {
  logger.info(message, {
    ...context,
    timestamp: new Date().toISOString(),
  });
}

export function logWarn(message: string, context?: LogContext): void {
  logger.warn(message, {
    ...context,
    timestamp: new Date().toISOString(),
  });
}

export function logError(
  message: string,
  error: Error | unknown,
  context?: LogContext
): void {
  const errorDetails =
    error instanceof Error
      ? { errorMessage: error.message, stack: error.stack }
      : { errorMessage: String(error) };

  logger.error(message, {
    ...context,
    ...errorDetails,
    timestamp: new Date().toISOString(),
  });
}

export function logMetric(
  metric: string,
  value: number,
  labels?: Record<string, string>
): void {
  logger.info(`METRIC`, {
    metric,
    value,
    labels,
    timestamp: new Date().toISOString(),
  });
}
```

### 6.5 Firebase Initialization with onInit

```typescript
// functions/src/config/firebase.ts
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getStorage, Storage } from "firebase-admin/storage";
import { onInit } from "firebase-functions/v2/core";

let _db: Firestore | null = null;
let _storage: Storage | null = null;

// Initialize on cold start, not during function execution
onInit(() => {
  if (getApps().length === 0) {
    initializeApp();
  }

  _db = getFirestore();
  _storage = getStorage();

  // Configure Firestore settings
  _db.settings({
    ignoreUndefinedProperties: true,
  });

  console.log("Firebase initialized via onInit");
});

export function getDb(): Firestore {
  if (!_db) {
    // Fallback for local development/testing
    if (getApps().length === 0) {
      initializeApp();
    }
    _db = getFirestore();
    _db.settings({ ignoreUndefinedProperties: true });
  }
  return _db;
}

export function getStorageBucket(): Storage {
  if (!_storage) {
    if (getApps().length === 0) {
      initializeApp();
    }
    _storage = getStorage();
  }
  return _storage;
}

// Convenience export for most use cases
export const db = {
  get collection() {
    return getDb().collection.bind(getDb());
  },
  get batch() {
    return getDb().batch.bind(getDb());
  },
  get runTransaction() {
    return getDb().runTransaction.bind(getDb());
  },
};
```

---

## 7. Phase 1: Foundation

**Duration:** 1 week
**Goal:** Project setup, infrastructure, basic authentication

### 7.1 Tasks

#### 7.1.1 Project Initialization

```bash
# Create project directory
mkdir motivated-seller-platform
cd motivated-seller-platform

# Initialize pnpm workspace
pnpm init

# Create workspace structure
mkdir -p functions/src/{config,ingestion,email,meta,rvm,orchestration,utils,types}
mkdir -p functions/src/__tests__
mkdir -p webapp/src
mkdir -p shared/src

# Create pnpm-workspace.yaml
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - 'functions'
  - 'webapp'
  - 'shared'
EOF
```

#### 7.1.2 Firebase Setup

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Initialize project
firebase init

# Select:
# - Firestore
# - Functions (TypeScript)
# - Hosting
# - Emulators (Firestore, Functions, Auth, Hosting)

# Enable Cloud Tasks API
gcloud services enable cloudtasks.googleapis.com
```

#### 7.1.3 Functions Project Setup

```bash
cd functions

# Initialize with TypeScript
pnpm init
pnpm add firebase-admin firebase-functions @google-cloud/tasks
pnpm add -D typescript @types/node eslint prettier vitest

# Create tsconfig.json
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./lib",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "lib", "**/*.test.ts"]
}
EOF
```

#### 7.1.4 Directory Structure

```
functions/
├── src/
│   ├── index.ts                 # Function exports
│   ├── config/
│   │   ├── firebase.ts          # Firebase admin init with onInit
│   │   └── secrets.ts           # Secret Manager access
│   ├── ingestion/
│   │   ├── index.ts
│   │   ├── syncListings.ts
│   │   ├── skipTrace.ts
│   │   └── clients/
│   │       ├── batchleads.ts    # Primary
│   │       └── propstream.ts    # Fallback
│   ├── email/
│   │   ├── index.ts
│   │   ├── processSequence.ts
│   │   ├── sendEmail.ts
│   │   ├── warmup.ts
│   │   ├── inboundParse.ts      # Reply detection
│   │   ├── webhooks.ts
│   │   └── clients/
│   │       └── sendgrid.ts
│   ├── meta/
│   │   ├── index.ts
│   │   ├── syncAudiences.ts
│   │   ├── tokenRefresh.ts      # Auto token refresh
│   │   └── clients/
│   │       └── metaAds.ts
│   ├── rvm/
│   │   ├── index.ts
│   │   ├── scheduleDrops.ts
│   │   ├── stateFiltering.ts    # State law compliance
│   │   └── clients/
│   │       └── slybroadcast.ts
│   ├── compliance/
│   │   ├── index.ts
│   │   ├── dncSync.ts           # Periodic DNC refresh
│   │   └── unsubscribe.ts
│   ├── orchestration/
│   │   ├── index.ts
│   │   └── hotLeadAlerts.ts
│   ├── utils/
│   │   ├── retry.ts
│   │   ├── webhookVerification.ts
│   │   ├── dncCheck.ts
│   │   ├── phone.ts
│   │   ├── hashing.ts
│   │   └── logging.ts
│   └── types/
│       ├── config.ts
│       ├── lead.ts
│       ├── email.ts
│       └── index.ts
├── package.json
├── tsconfig.json
└── .eslintrc.js
```

### 7.2 Deliverables

- [ ] Firebase project created and configured
- [ ] Functions project with TypeScript compiling
- [ ] Firestore database provisioned
- [ ] Security rules deployed (per-user isolation)
- [ ] Cloud Tasks API enabled
- [ ] Emulators running locally
- [ ] GitHub repo with CI workflow
- [ ] All secrets stored in Secret Manager
- [ ] Shared utilities implemented and tested

### 7.3 Verification

```bash
# Verify emulators work
firebase emulators:start

# Run utility tests
cd functions && pnpm test

# Verify deployment works
firebase deploy --only firestore:rules
firebase deploy --only functions
```

---

*Continued in next section...*

## 8. Phase 2: Data Ingestion

**Duration:** 2 weeks
**Goal:** Automated listing sync with DNC-compliant skip tracing

### 8.1 Pre-Phase Verification

**CRITICAL: Complete before coding**

```bash
# Verify BatchLeads API access
curl -X GET "https://api.batchleads.io/v1/properties" \
  -H "Authorization: Bearer $BATCHLEADS_API_KEY" \
  -H "Content-Type: application/json"

# Expected: 200 OK with property data or 401 if key invalid
# If 404 or API doesn't exist, contact BatchLeads support
```

### 8.2 BatchLeads Client

```typescript
// functions/src/ingestion/clients/batchleads.ts
import { withRetry } from "../../utils/retry";
import { logInfo, logError } from "../../utils/logging";

interface BatchLeadsListing {
  id: string;
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
    county: string;
  };
  listing: {
    price: number;
    listDate: string;
    daysOnMarket: number;
    status: string;
    mlsNumber: string;
    agent: {
      name: string;
      phone: string;
    };
  };
  property: {
    type: string;
    bedrooms: number;
    bathrooms: number;
    sqft: number;
    yearBuilt: number;
  };
  owner: {
    name: string;
    mailingAddress: string;
  };
}

interface SkipTraceResult {
  success: boolean;
  owner: {
    firstName: string;
    lastName: string;
    fullName: string;
  };
  emails: Array<{
    email: string;
    type: string;
    confidence: number;
  }>;
  phones: Array<{
    phone: string;
    type: string;
    confidence: number;
  }>;
  mailingAddress: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
}

export class BatchLeadsClient {
  private baseUrl = "https://api.batchleads.io/v1";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async searchListings(params: {
    zipCodes: string[];
    minDaysOnMarket: number;
    minPrice?: number;
    maxPrice?: number;
    propertyTypes?: string[];
  }): Promise<BatchLeadsListing[]> {
    const allListings: BatchLeadsListing[] = [];

    for (const zip of params.zipCodes) {
      logInfo(`Fetching listings for zip ${zip}`, { zip });

      try {
        const listings = await this.fetchListingsForZip(zip, params);
        allListings.push(...listings);
        logInfo(`Found ${listings.length} listings in ${zip}`, {
          zip,
          count: listings.length,
        });
      } catch (error) {
        logError(`Failed to fetch listings for ${zip}`, error, { zip });
        // Continue with other zips
      }

      // Rate limiting between zips
      await this.delay(500);
    }

    return allListings;
  }

  private async fetchListingsForZip(
    zip: string,
    params: {
      minDaysOnMarket: number;
      minPrice?: number;
      maxPrice?: number;
      propertyTypes?: string[];
    }
  ): Promise<BatchLeadsListing[]> {
    const listings: BatchLeadsListing[] = [];
    let page = 1;
    const pageSize = 100;
    let hasMore = true;

    while (hasMore) {
      const response = await withRetry(async () => {
        const res = await fetch(`${this.baseUrl}/properties/search`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            filters: {
              zip,
              listingStatus: "active",
              minDaysOnMarket: params.minDaysOnMarket,
              minPrice: params.minPrice,
              maxPrice: params.maxPrice,
              propertyTypes: params.propertyTypes,
            },
            pagination: {
              page,
              pageSize,
            },
          }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`BatchLeads API error: ${res.status} - ${errorText}`);
        }

        return res.json();
      });

      listings.push(...response.data);
      hasMore = response.data.length === pageSize;
      page++;

      // Rate limiting between pages
      await this.delay(200);
    }

    return listings;
  }

  async skipTrace(address: string, zip: string): Promise<SkipTraceResult> {
    return withRetry(async () => {
      const response = await fetch(`${this.baseUrl}/skip-trace`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          address,
          zip,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Skip trace failed: ${response.status} - ${errorText}`);
      }

      return response.json();
    });
  }

  async batchSkipTrace(
    addresses: Array<{ address: string; zip: string }>
  ): Promise<Map<string, SkipTraceResult>> {
    const results = new Map<string, SkipTraceResult>();

    // BatchLeads may support batch skip trace - check their API
    // For now, process individually with rate limiting
    for (const { address, zip } of addresses) {
      try {
        const result = await this.skipTrace(address, zip);
        results.set(address, result);
      } catch (error) {
        logError(`Skip trace failed for ${address}`, error, { address, zip });
        results.set(address, {
          success: false,
          owner: { firstName: "", lastName: "", fullName: "" },
          emails: [],
          phones: [],
          mailingAddress: { street: "", city: "", state: "", zip: "" },
        });
      }

      // Rate limiting
      await this.delay(100);
    }

    return results;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

### 8.3 Listing Sync with Cloud Tasks Fan-out

```typescript
// functions/src/ingestion/syncListings.ts
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { CloudTasksClient } from "@google-cloud/tasks";
import { getDb } from "../config/firebase";
import { BATCHLEADS_API_KEY, DNC_API_KEY, DNC_API_SECRET } from "../config/secrets";
import { BatchLeadsClient } from "./clients/batchleads";
import { DncChecker } from "../utils/dncCheck";
import { FieldValue } from "firebase-admin/firestore";
import { logInfo, logError, logMetric } from "../utils/logging";
import type { Config, Lead } from "../types";

const tasksClient = new CloudTasksClient();
const PROJECT_ID = process.env.GCLOUD_PROJECT!;
const LOCATION = "us-central1";
const QUEUE_NAME = "listing-sync";

// Orchestrator: Runs daily, dispatches per-zip tasks
export const syncListingsOrchestrator = onSchedule({
  schedule: "0 6 * * *", // 6 AM daily
  timeZone: "America/New_York",
  memory: "256MiB",
  timeoutSeconds: 60,
}, async () => {
  const db = getDb();
  const configSnap = await db.collection("config").get();

  let tasksCreated = 0;

  for (const configDoc of configSnap.docs) {
    const config = configDoc.data() as Config;
    const userId = configDoc.id;

    // Create a task for each zip code
    for (const zipCode of config.targetZipCodes) {
      await createSyncTask(userId, zipCode, config);
      tasksCreated++;
    }
  }

  logInfo(`Created ${tasksCreated} sync tasks`, { tasksCreated });
  logMetric("sync_tasks_created", tasksCreated);
});

async function createSyncTask(
  userId: string,
  zipCode: string,
  config: Config
): Promise<void> {
  const queuePath = tasksClient.queuePath(PROJECT_ID, LOCATION, QUEUE_NAME);

  const task = {
    httpRequest: {
      httpMethod: "POST" as const,
      url: `https://${LOCATION}-${PROJECT_ID}.cloudfunctions.net/syncListingsWorker`,
      headers: { "Content-Type": "application/json" },
      body: Buffer.from(
        JSON.stringify({
          userId,
          zipCode,
          minDaysOnMarket: config.minDaysOnMarket,
          minPrice: config.minListPrice,
          maxPrice: config.maxListPrice,
          propertyTypes: config.propertyTypes,
          dataProvider: config.dataProvider,
        })
      ).toString("base64"),
    },
    scheduleTime: {
      seconds: Math.floor(Date.now() / 1000) + Math.random() * 60, // Spread over 1 min
    },
  };

  await tasksClient.createTask({ parent: queuePath, task });
}

// Worker: Processes a single zip code
export const syncListingsWorker = onTaskDispatched({
  retryConfig: {
    maxAttempts: 3,
    minBackoffSeconds: 30,
  },
  rateLimits: {
    maxConcurrentDispatches: 10,
  },
  memory: "512MiB",
  timeoutSeconds: 300,
  secrets: [BATCHLEADS_API_KEY, DNC_API_KEY, DNC_API_SECRET],
}, async (req) => {
  const {
    userId,
    zipCode,
    minDaysOnMarket,
    minPrice,
    maxPrice,
    propertyTypes,
  } = req.data as {
    userId: string;
    zipCode: string;
    minDaysOnMarket: number;
    minPrice?: number;
    maxPrice?: number;
    propertyTypes?: string[];
    dataProvider: string;
  };

  const db = getDb();
  const client = new BatchLeadsClient(BATCHLEADS_API_KEY.value());
  const dncChecker = new DncChecker(DNC_API_KEY.value(), DNC_API_SECRET.value());

  logInfo(`Processing zip ${zipCode} for user ${userId}`, { userId, zipCode });

  try {
    // Fetch listings
    const listings = await client.searchListings({
      zipCodes: [zipCode],
      minDaysOnMarket,
      minPrice,
      maxPrice,
      propertyTypes,
    });

    logInfo(`Found ${listings.length} listings in ${zipCode}`, {
      userId,
      zipCode,
      count: listings.length,
    });

    let newCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    // Process each listing
    for (const listing of listings) {
      const leadId = generateLeadId(listing.address.street, listing.address.zip);
      const leadRef = db.collection("leads").doc(leadId);

      const existing = await leadRef.get();

      if (existing.exists) {
        // Update existing lead
        await leadRef.update({
          daysOnMarket: listing.listing.daysOnMarket,
          listPrice: listing.listing.price,
          updatedAt: FieldValue.serverTimestamp(),
        });
        updatedCount++;
      } else {
        // Create new lead
        const lead: Partial<Lead> = {
          id: leadId,
          userId,
          address: listing.address.street,
          city: listing.address.city,
          state: listing.address.state,
          zipCode: listing.address.zip,
          county: listing.address.county,
          listPrice: listing.listing.price,
          listDate: new Date(listing.listing.listDate),
          daysOnMarket: listing.listing.daysOnMarket,
          propertyType: listing.property.type,
          bedrooms: listing.property.bedrooms,
          bathrooms: listing.property.bathrooms,
          sqft: listing.property.sqft,
          yearBuilt: listing.property.yearBuilt,
          mlsNumber: listing.listing.mlsNumber,
          listingAgentName: listing.listing.agent.name,
          listingAgentPhone: listing.listing.agent.phone,
          ownerName: listing.owner.name,
          ownerMailingAddress: listing.owner.mailingAddress,
          status: "new",
          source: "batchleads",
          emails: [],
          phones: [],
          primaryEmail: null,
          primaryPhone: null,
          dncStatus: "pending",
          dncBlockedPhones: [],
          tags: [],
          notes: "",
          emailSequenceStep: 0,
          emailOpens: 0,
          emailClicks: 0,
          emailReplies: 0,
          emailBounced: false,
          emailBounceType: null,
          emailUnsubscribed: false,
          addedToMetaAudience: false,
          rvmCallbackReceived: false,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };

        await leadRef.set(lead);
        newCount++;
      }
    }

    logInfo(`Completed zip ${zipCode}`, {
      userId,
      zipCode,
      newCount,
      updatedCount,
      skippedCount,
    });

    logMetric("leads_synced", newCount + updatedCount, { zipCode, userId });
  } catch (error) {
    logError(`Failed to process zip ${zipCode}`, error, { userId, zipCode });
    throw error; // Let Cloud Tasks retry
  }
});

function generateLeadId(address: string, zip: string): string {
  return `${address}-${zip}`
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 100);
}
```

### 8.4 Skip Trace with DNC Check

```typescript
// functions/src/ingestion/skipTrace.ts
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { getDb } from "../config/firebase";
import { BATCHLEADS_API_KEY, DNC_API_KEY, DNC_API_SECRET } from "../config/secrets";
import { BatchLeadsClient } from "./clients/batchleads";
import { DncChecker } from "../utils/dncCheck";
import { FieldValue } from "firebase-admin/firestore";
import { logInfo, logError } from "../utils/logging";
import type { Lead } from "../types";

export const skipTraceNewLead = onDocumentCreated({
  document: "leads/{leadId}",
  memory: "256MiB",
  secrets: [BATCHLEADS_API_KEY, DNC_API_KEY, DNC_API_SECRET],
}, async (event) => {
  const lead = event.data?.data() as Lead;
  if (!lead || lead.status !== "new") return;

  const db = getDb();
  const leadRef = event.data!.ref;
  const leadId = event.params.leadId;

  // Mark as enriching
  await leadRef.update({
    status: "enriching",
    updatedAt: FieldValue.serverTimestamp(),
  });

  const client = new BatchLeadsClient(BATCHLEADS_API_KEY.value());
  const dncChecker = new DncChecker(DNC_API_KEY.value(), DNC_API_SECRET.value());

  try {
    // Skip trace
    const result = await client.skipTrace(lead.address, lead.zipCode);

    if (!result.success) {
      await leadRef.update({
        status: "dead",
        notes: "Skip trace returned no results",
        updatedAt: FieldValue.serverTimestamp(),
      });
      return;
    }

    // Extract best email and phone
    const emails = result.emails
      .sort((a, b) => b.confidence - a.confidence)
      .map((e) => e.email);

    const phones = result.phones
      .sort((a, b) => b.confidence - a.confidence)
      .map((p) => p.phone);

    // Check DNC for all phones
    const dncResults = await dncChecker.checkPhones(phones);
    const blockedPhones: string[] = [];
    const clearPhones: string[] = [];

    for (const [phone, dncResult] of dncResults) {
      if (dncResult.isBlocked) {
        blockedPhones.push(phone);
      } else {
        clearPhones.push(phone);
      }
    }

    // Determine final status
    const hasValidContact = emails.length > 0 || clearPhones.length > 0;
    const allPhonesBlocked = phones.length > 0 && clearPhones.length === 0;

    let finalStatus: string;
    if (!hasValidContact) {
      finalStatus = "dead";
    } else if (allPhonesBlocked && emails.length === 0) {
      finalStatus = "dnc_blocked";
    } else {
      finalStatus = "enriched";
    }

    await leadRef.update({
      ownerName: result.owner.fullName,
      ownerFirstName: result.owner.firstName,
      ownerLastName: result.owner.lastName,
      emails,
      phones,
      primaryEmail: emails[0] || null,
      primaryPhone: clearPhones[0] || null,
      ownerMailingAddress: result.mailingAddress.street,
      ownerMailingCity: result.mailingAddress.city,
      ownerMailingState: result.mailingAddress.state,
      ownerMailingZip: result.mailingAddress.zip,
      dncStatus: blockedPhones.length > 0 ? "blocked" : "clear",
      dncBlockedPhones: blockedPhones,
      dncCheckedAt: FieldValue.serverTimestamp(),
      status: finalStatus,
      enrichedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Log enrichment
    await db.collection("outreachLog").add({
      userId: lead.userId,
      leadId,
      channel: "skip_trace",
      action: "enriched",
      details: {
        emailsFound: emails.length,
        phonesFound: phones.length,
        dncBlocked: blockedPhones.length,
        finalStatus,
      },
      timestamp: FieldValue.serverTimestamp(),
    });

    logInfo(`Skip traced lead ${leadId}: ${finalStatus}`, {
      leadId,
      emailsFound: emails.length,
      phonesFound: phones.length,
      dncBlocked: blockedPhones.length,
    });
  } catch (error) {
    logError(`Skip trace failed for ${leadId}`, error, { leadId });

    await leadRef.update({
      status: "dead",
      notes: `Skip trace failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
});
```

### 8.5 Deliverables

- [ ] BatchLeads API access verified
- [ ] BatchLeads client with retry logic
- [ ] Cloud Tasks queue configured
- [ ] Fan-out sync orchestrator
- [ ] Per-zip worker function
- [ ] Skip trace with DNC integration
- [ ] Proper error handling and logging
- [ ] Rate limiting respected

### 8.6 Verification

```bash
# Create Cloud Tasks queue
gcloud tasks queues create listing-sync \
  --location=us-central1 \
  --max-concurrent-dispatches=10 \
  --max-attempts=3

# Test with emulator
firebase emulators:start

# Manually trigger sync
curl -X POST http://localhost:5001/PROJECT_ID/us-central1/syncListingsOrchestrator

# Check Firestore for leads
# Check logs for any errors
firebase functions:log --only syncListingsWorker
```

---

## 9. Phase 3: Email Campaigns

**Duration:** 2 weeks
**Goal:** Email sequences with warmup, tracking, and reply detection

### 9.1 Email Warmup System

```typescript
// functions/src/email/warmup.ts
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getDb } from "../config/firebase";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { logInfo, logWarn, logMetric } from "../utils/logging";
import type { Config, WarmupStatus } from "../types";

// Default warmup schedule (14 days to full volume)
const DEFAULT_WARMUP_SCHEDULE = [
  50,   // Day 1
  75,   // Day 2
  100,  // Day 3
  150,  // Day 4
  200,  // Day 5
  300,  // Day 6
  400,  // Day 7
  500,  // Day 8
  650,  // Day 9
  800,  // Day 10
  1000, // Day 11
  1250, // Day 12
  1500, // Day 13
  2000, // Day 14+
];

// Reset warmup counters daily at midnight
export const resetWarmupCounters = onSchedule({
  schedule: "0 0 * * *", // Midnight daily
  timeZone: "America/New_York",
  memory: "256MiB",
}, async () => {
  const db = getDb();
  const warmupSnap = await db.collection("warmup").get();

  const batch = db.batch();

  for (const doc of warmupSnap.docs) {
    const warmup = doc.data() as WarmupStatus;

    if (warmup.status !== "active") continue;

    // Advance to next day
    const newDay = Math.min(warmup.currentDay + 1, DEFAULT_WARMUP_SCHEDULE.length);

    batch.update(doc.ref, {
      currentDay: newDay,
      sentToday: 0,
      lastResetAt: FieldValue.serverTimestamp(),
    });

    logInfo(`Warmup advanced to day ${newDay}`, {
      configId: doc.id,
      newDay,
      dailyLimit: getDailyLimit(newDay),
    });
  }

  await batch.commit();
});

export function getDailyLimit(day: number): number {
  const index = Math.min(day - 1, DEFAULT_WARMUP_SCHEDULE.length - 1);
  return DEFAULT_WARMUP_SCHEDULE[index];
}

export async function getWarmupStatus(configId: string): Promise<{
  canSend: boolean;
  remaining: number;
  dailyLimit: number;
}> {
  const db = getDb();
  const warmupDoc = await db.collection("warmup").doc(configId).get();

  if (!warmupDoc.exists) {
    // No warmup = no limits
    return { canSend: true, remaining: Infinity, dailyLimit: Infinity };
  }

  const warmup = warmupDoc.data() as WarmupStatus;

  if (warmup.status !== "active") {
    if (warmup.status === "completed") {
      return { canSend: true, remaining: Infinity, dailyLimit: Infinity };
    }
    return { canSend: false, remaining: 0, dailyLimit: 0 };
  }

  const dailyLimit = getDailyLimit(warmup.currentDay);
  const remaining = Math.max(0, dailyLimit - warmup.sentToday);

  return {
    canSend: remaining > 0,
    remaining,
    dailyLimit,
  };
}

export async function incrementWarmupCount(
  configId: string,
  count: number
): Promise<void> {
  const db = getDb();
  await db.collection("warmup").doc(configId).update({
    sentToday: FieldValue.increment(count),
    totalSent: FieldValue.increment(count),
  });
}

export async function recordBounce(configId: string): Promise<void> {
  const db = getDb();
  const warmupRef = db.collection("warmup").doc(configId);

  await db.runTransaction(async (tx) => {
    const doc = await tx.get(warmupRef);
    if (!doc.exists) return;

    const warmup = doc.data() as WarmupStatus;
    const newBounced = warmup.totalBounced + 1;
    const bounceRate = newBounced / warmup.totalSent;

    // Pause warmup if bounce rate exceeds 5%
    if (bounceRate > 0.05 && warmup.totalSent >= 100) {
      tx.update(warmupRef, {
        totalBounced: newBounced,
        bounceRate,
        status: "paused",
        pauseReason: `Bounce rate ${(bounceRate * 100).toFixed(1)}% exceeds 5% threshold`,
      });

      logWarn(`Warmup paused due to high bounce rate`, {
        configId,
        bounceRate,
        totalBounced: newBounced,
      });
    } else {
      tx.update(warmupRef, {
        totalBounced: newBounced,
        bounceRate,
      });
    }
  });
}

export async function initializeWarmup(configId: string): Promise<void> {
  const db = getDb();
  const warmupRef = db.collection("warmup").doc(configId);

  const existing = await warmupRef.get();
  if (existing.exists) return;

  await warmupRef.set({
    configId,
    startDate: FieldValue.serverTimestamp(),
    currentDay: 1,
    dailyLimits: DEFAULT_WARMUP_SCHEDULE,
    sentToday: 0,
    lastResetAt: FieldValue.serverTimestamp(),
    totalSent: 0,
    totalBounced: 0,
    totalComplaints: 0,
    bounceRate: 0,
    complaintRate: 0,
    status: "active",
    pauseReason: null,
  });

  logInfo(`Warmup initialized`, { configId });
}
```

### 9.2 SendGrid Client with Signature Verification

```typescript
// functions/src/email/clients/sendgrid.ts
import sgMail from "@sendgrid/mail";
import { withRetry } from "../../utils/retry";
import type { Lead, EmailStep, Config } from "../../types";

export class SendGridClient {
  constructor(apiKey: string) {
    sgMail.setApiKey(apiKey);
  }

  async sendEmail(
    lead: Lead,
    step: EmailStep,
    config: Config
  ): Promise<{ messageId: string }> {
    const personalizedSubject = this.personalize(step.subject, lead, config);
    const personalizedHtml = this.personalize(step.bodyHtml, lead, config);
    const personalizedText = this.personalize(step.bodyText, lead, config);

    const msg = {
      to: lead.primaryEmail!,
      from: {
        email: config.fromEmail,
        name: config.fromName,
      },
      replyTo: config.replyToEmail || config.fromEmail,
      subject: personalizedSubject,
      html: this.addFooter(personalizedHtml, lead.id, config),
      text: this.addFooterText(personalizedText, lead.id, config),
      trackingSettings: {
        clickTracking: { enable: true, enableText: false },
        openTracking: { enable: true },
      },
      customArgs: {
        leadId: lead.id,
        oderId: lead.userId,
        sequenceId: lead.emailSequenceId,
        stepNumber: step.stepNumber.toString(),
      },
      categories: ["motivated-seller", `step-${step.stepNumber}`],
    };

    return withRetry(async () => {
      const [response] = await sgMail.send(msg);
      return {
        messageId: response.headers["x-message-id"] as string,
      };
    });
  }

  private personalize(template: string, lead: Lead, config: Config): string {
    return template
      .replace(/\{\{firstName\}\}/g, lead.ownerFirstName || "there")
      .replace(/\{\{lastName\}\}/g, lead.ownerLastName || "")
      .replace(/\{\{ownerName\}\}/g, lead.ownerName || "Homeowner")
      .replace(/\{\{address\}\}/g, lead.address)
      .replace(/\{\{city\}\}/g, lead.city)
      .replace(/\{\{state\}\}/g, lead.state)
      .replace(/\{\{zipCode\}\}/g, lead.zipCode)
      .replace(/\{\{daysOnMarket\}\}/g, lead.daysOnMarket.toString())
      .replace(/\{\{listPrice\}\}/g, this.formatCurrency(lead.listPrice))
      .replace(/\{\{bedrooms\}\}/g, lead.bedrooms?.toString() || "")
      .replace(/\{\{bathrooms\}\}/g, lead.bathrooms?.toString() || "")
      .replace(/\{\{sqft\}\}/g, lead.sqft?.toLocaleString() || "")
      .replace(/\{\{companyName\}\}/g, config.companyName)
      .replace(/\{\{yourName\}\}/g, config.fromName);
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  }

  private addFooter(html: string, leadId: string, config: Config): string {
    const unsubscribeUrl = `https://${config.inboundEmailDomain}/unsubscribe?id=${leadId}`;
    const footer = `
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
        <p>You're receiving this because your property is listed for sale.</p>
        <p>
          <a href="${unsubscribeUrl}">Unsubscribe</a> |
          ${config.companyName} |
          ${config.physicalAddress}, ${config.physicalCity}, ${config.physicalState} ${config.physicalZip}
        </p>
      </div>
    `;

    // Insert before closing body tag, or append
    if (html.includes("</body>")) {
      return html.replace("</body>", `${footer}</body>`);
    }
    return html + footer;
  }

  private addFooterText(text: string, leadId: string, config: Config): string {
    const unsubscribeUrl = `https://${config.inboundEmailDomain}/unsubscribe?id=${leadId}`;
    return `${text}

---
You're receiving this because your property is listed for sale.
Unsubscribe: ${unsubscribeUrl}
${config.companyName} | ${config.physicalAddress}, ${config.physicalCity}, ${config.physicalState} ${config.physicalZip}`;
  }
}
```

### 9.3 Email Sequence Processor (with Warmup)

```typescript
// functions/src/email/processSequence.ts
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getDb } from "../config/firebase";
import { SENDGRID_API_KEY } from "../config/secrets";
import { SendGridClient } from "./clients/sendgrid";
import { getWarmupStatus, incrementWarmupCount } from "./warmup";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { logInfo, logError, logMetric } from "../utils/logging";
import type { Config, Lead, EmailSequence, EmailStep } from "../types";

export const processEmailSequences = onSchedule({
  schedule: "0 9 * * *", // 9 AM daily
  timeZone: "America/New_York",
  memory: "512MiB",
  timeoutSeconds: 540,
  secrets: [SENDGRID_API_KEY],
}, async () => {
  const db = getDb();
  const client = new SendGridClient(SENDGRID_API_KEY.value());

  const configSnap = await db.collection("config").get();

  for (const configDoc of configSnap.docs) {
    const config = configDoc.data() as Config;
    if (!config.emailEnabled) continue;

    const userId = configDoc.id;
    logInfo(`Processing email sequences for user ${userId}`, { userId });

    // Check warmup limits
    const warmup = await getWarmupStatus(userId);
    if (!warmup.canSend) {
      logInfo(`Warmup limit reached for ${userId}`, { userId, ...warmup });
      continue;
    }

    // Get the sequence
    const sequenceDoc = await db
      .collection("emailSequences")
      .doc(config.emailSequenceId)
      .get();

    if (!sequenceDoc.exists) {
      logError(`Sequence ${config.emailSequenceId} not found`, new Error("Sequence not found"), {
        userId,
        sequenceId: config.emailSequenceId,
      });
      continue;
    }

    const sequence = sequenceDoc.data() as EmailSequence;

    // Find leads ready for email (user's leads only)
    const leadsSnap = await db
      .collection("leads")
      .where("userId", "==", userId)
      .where("status", "in", ["enriched", "outreach_active"])
      .where("emailBounced", "==", false)
      .where("emailUnsubscribed", "==", false)
      .where("primaryEmail", "!=", null)
      .limit(warmup.remaining)
      .get();

    let sentCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (const leadDoc of leadsSnap.docs) {
      // Re-check warmup (may have been updated by other leads)
      const currentWarmup = await getWarmupStatus(userId);
      if (!currentWarmup.canSend) {
        logInfo(`Warmup limit reached during processing`, { userId, sentCount });
        break;
      }

      const lead = { id: leadDoc.id, ...leadDoc.data() } as Lead;

      // Determine next step
      const nextStep = getNextStep(lead, sequence);
      if (!nextStep) {
        skipCount++;
        continue;
      }

      // Check if ready (delay passed)
      if (!isReadyForStep(lead, nextStep)) {
        skipCount++;
        continue;
      }

      try {
        const { messageId } = await client.sendEmail(lead, nextStep, config);

        // Update lead
        await leadDoc.ref.update({
          emailSequenceId: sequence.id,
          emailSequenceStep: nextStep.stepNumber,
          lastEmailSentAt: FieldValue.serverTimestamp(),
          nextEmailScheduledAt: calculateNextEmailDate(nextStep, sequence),
          status: "outreach_active",
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Log outreach
        await db.collection("outreachLog").add({
          userId,
          leadId: lead.id,
          channel: "email",
          action: "sent",
          details: {
            sequenceId: sequence.id,
            stepNumber: nextStep.stepNumber,
            subject: nextStep.subject,
            messageId,
            toEmail: lead.primaryEmail,
          },
          timestamp: FieldValue.serverTimestamp(),
        });

        // Increment warmup counter
        await incrementWarmupCount(userId, 1);

        sentCount++;

        // Rate limit: max 10 emails per second
        await delay(100);
      } catch (error) {
        logError(`Failed to send email to ${lead.id}`, error, { leadId: lead.id });
        errorCount++;
      }
    }

    logInfo(`Completed email processing for ${userId}`, {
      userId,
      sentCount,
      skipCount,
      errorCount,
    });

    logMetric("emails_sent", sentCount, { userId });
  }
});

function getNextStep(lead: Lead, sequence: EmailSequence): EmailStep | null {
  const currentStep = lead.emailSequenceStep || 0;
  const nextStepNumber = currentStep + 1;

  return sequence.steps.find((s) => s.stepNumber === nextStepNumber) || null;
}

function isReadyForStep(lead: Lead, step: EmailStep): boolean {
  if (step.stepNumber === 1) {
    return true;
  }

  if (!lead.lastEmailSentAt) {
    return false;
  }

  const lastSent = (lead.lastEmailSentAt as Timestamp).toDate();
  const delayMs = (step.delayDays * 24 + step.delayHours) * 60 * 60 * 1000;
  const readyAt = new Date(lastSent.getTime() + delayMs);

  return new Date() >= readyAt;
}

function calculateNextEmailDate(
  currentStep: EmailStep,
  sequence: EmailSequence
): Timestamp | null {
  const nextStep = sequence.steps.find(
    (s) => s.stepNumber === currentStep.stepNumber + 1
  );
  if (!nextStep) return null;

  const delayMs = (nextStep.delayDays * 24 + nextStep.delayHours) * 60 * 60 * 1000;
  return Timestamp.fromDate(new Date(Date.now() + delayMs));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

### 9.4 SendGrid Webhook Handler (with Signature Verification)

```typescript
// functions/src/email/webhooks.ts
import { onRequest } from "firebase-functions/v2/https";
import { getDb } from "../config/firebase";
import { SENDGRID_WEBHOOK_SECRET } from "../config/secrets";
import { verifySendGridWebhook } from "../utils/webhookVerification";
import { recordBounce } from "./warmup";
import { FieldValue } from "firebase-admin/firestore";
import { logInfo, logWarn, logError } from "../utils/logging";

interface SendGridEvent {
  event: string;
  email: string;
  timestamp: number;
  leadId?: string;
  oderId?: string;
  sequenceId?: string;
  stepNumber?: string;
  sg_message_id?: string;
  url?: string;
  reason?: string;
  bounce_classification?: string;
  type?: string; // For bounces: "blocked", "bounced", "expired"
}

export const sendgridWebhook = onRequest({
  memory: "256MiB",
  cors: false,
  secrets: [SENDGRID_WEBHOOK_SECRET],
}, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  // Verify webhook signature
  if (!verifySendGridWebhook(req, SENDGRID_WEBHOOK_SECRET.value())) {
    logWarn("Invalid SendGrid webhook signature", {
      ip: req.ip,
      headers: req.headers,
    });
    res.status(401).send("Invalid signature");
    return;
  }

  const events: SendGridEvent[] = req.body;

  if (!Array.isArray(events)) {
    res.status(400).send("Invalid payload");
    return;
  }

  logInfo(`Received ${events.length} SendGrid events`, { count: events.length });

  const db = getDb();

  for (const event of events) {
    try {
      // Store raw event
      await db.collection("webhookEvents").add({
        source: "sendgrid",
        eventType: event.event,
        payload: event,
        receivedAt: FieldValue.serverTimestamp(),
        processedAt: null,
        error: null,
      });

      // Process event
      const leadId = event.leadId;
      const oderId = event.oderId;
      if (!leadId) continue;

      const leadRef = db.collection("leads").doc(leadId);
      const leadDoc = await leadRef.get();

      if (!leadDoc.exists) {
        logWarn(`Lead ${leadId} not found for event ${event.event}`, {
          leadId,
          event: event.event,
        });
        continue;
      }

      switch (event.event) {
        case "open":
          await leadRef.update({
            emailOpens: FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp(),
          });
          break;

        case "click":
          await leadRef.update({
            emailClicks: FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp(),
          });
          await logOutreach(db, oderId!, leadId, "email", "clicked", {
            url: event.url,
          });
          break;

        case "bounce":
          await handleBounce(db, leadRef, event, oderId!);
          break;

        case "dropped":
          await leadRef.update({
            emailBounced: true,
            emailBounceType: "hard",
            status: "dead",
            notes: `Email dropped: ${event.reason}`,
            updatedAt: FieldValue.serverTimestamp(),
          });
          if (oderId) await recordBounce(oderId);
          break;

        case "spamreport":
          await leadRef.update({
            emailUnsubscribed: true,
            status: "dead",
            notes: "Marked as spam",
            updatedAt: FieldValue.serverTimestamp(),
          });
          await logOutreach(db, oderId!, leadId, "email", "spam_reported", {});
          break;

        case "unsubscribe":
          await leadRef.update({
            emailUnsubscribed: true,
            updatedAt: FieldValue.serverTimestamp(),
          });
          await logOutreach(db, oderId!, leadId, "email", "unsubscribed", {});
          break;
      }
    } catch (error) {
      logError(`Error processing SendGrid event`, error, { event });
    }
  }

  res.status(200).send("OK");
});

async function handleBounce(
  db: FirebaseFirestore.Firestore,
  leadRef: FirebaseFirestore.DocumentReference,
  event: SendGridEvent,
  oderId: string
): Promise<void> {
  // Differentiate hard vs soft bounces
  const isHardBounce =
    event.bounce_classification === "invalid" ||
    event.bounce_classification === "technical" ||
    event.type === "bounced";

  if (isHardBounce) {
    await leadRef.update({
      emailBounced: true,
      emailBounceType: "hard",
      status: "dead",
      notes: `Hard bounce: ${event.reason || event.bounce_classification}`,
      updatedAt: FieldValue.serverTimestamp(),
    });
    await recordBounce(oderId);
  } else {
    // Soft bounce - don't mark as dead, just log
    await leadRef.update({
      emailBounceType: "soft",
      notes: `Soft bounce: ${event.reason || event.bounce_classification}`,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  await logOutreach(db, oderId, event.leadId!, "email", "bounced", {
    reason: event.reason,
    classification: event.bounce_classification,
    type: isHardBounce ? "hard" : "soft",
  });
}

async function logOutreach(
  db: FirebaseFirestore.Firestore,
  userId: string,
  leadId: string,
  channel: string,
  action: string,
  details: Record<string, any>
): Promise<void> {
  await db.collection("outreachLog").add({
    userId,
    leadId,
    channel,
    action,
    details,
    timestamp: FieldValue.serverTimestamp(),
  });
}
```

### 9.5 Reply Detection with Inbound Parse

```typescript
// functions/src/email/inboundParse.ts
import { onRequest } from "firebase-functions/v2/https";
import { getDb } from "../config/firebase";
import { FieldValue } from "firebase-admin/firestore";
import { logInfo, logError } from "../utils/logging";
import Busboy from "busboy";

interface ParsedEmail {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  headers: string;
}

export const sendgridInboundParse = onRequest({
  memory: "256MiB",
  cors: false,
}, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  try {
    const email = await parseMultipartForm(req);
    logInfo("Received inbound email", {
      from: email.from,
      to: email.to,
      subject: email.subject,
    });

    const db = getDb();

    // Extract lead ID from reply-to or references
    const leadId = extractLeadId(email);

    if (!leadId) {
      logInfo("Could not extract leadId from inbound email", {
        to: email.to,
        subject: email.subject,
      });
      res.status(200).send("OK");
      return;
    }

    // Find and update the lead
    const leadRef = db.collection("leads").doc(leadId);
    const leadDoc = await leadRef.get();

    if (!leadDoc.exists) {
      logInfo(`Lead ${leadId} not found for reply`, { leadId });
      res.status(200).send("OK");
      return;
    }

    const lead = leadDoc.data()!;

    // Update lead status
    await leadRef.update({
      status: "responded",
      emailReplies: FieldValue.increment(1),
      respondedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Log the reply
    await db.collection("outreachLog").add({
      userId: lead.userId,
      leadId,
      channel: "email",
      action: "replied",
      details: {
        from: email.from,
        subject: email.subject,
        preview: email.text.slice(0, 500),
      },
      timestamp: FieldValue.serverTimestamp(),
    });

    // Create hot lead alert
    await db.collection("alerts").add({
      userId: lead.userId,
      type: "hot_lead",
      leadId,
      title: `${lead.ownerFirstName || "Owner"} replied!`,
      message: `Reply received for ${lead.address}`,
      preview: email.text.slice(0, 200),
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    logInfo(`Processed reply for lead ${leadId}`, { leadId, from: email.from });

    res.status(200).send("OK");
  } catch (error) {
    logError("Error processing inbound email", error);
    res.status(500).send("Error");
  }
});

async function parseMultipartForm(req: any): Promise<ParsedEmail> {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers });
    const fields: Record<string, string> = {};

    busboy.on("field", (name, value) => {
      fields[name] = value;
    });

    busboy.on("finish", () => {
      resolve({
        from: fields.from || "",
        to: fields.to || "",
        subject: fields.subject || "",
        text: fields.text || "",
        html: fields.html || "",
        headers: fields.headers || "",
      });
    });

    busboy.on("error", reject);

    req.pipe(busboy);
  });
}

function extractLeadId(email: ParsedEmail): string | null {
  // Try to extract from To address (e.g., reply+leadId@replies.domain.com)
  const toMatch = email.to.match(/reply\+([a-z0-9-]+)@/i);
  if (toMatch) {
    return toMatch[1];
  }

  // Try to extract from In-Reply-To or References headers
  const headersLower = email.headers.toLowerCase();
  const leadIdMatch = headersLower.match(/leadid[=:]\s*([a-z0-9-]+)/i);
  if (leadIdMatch) {
    return leadIdMatch[1];
  }

  // Try to extract from subject (Re: ... [lead-id])
  const subjectMatch = email.subject.match(/\[([a-z0-9-]+)\]$/i);
  if (subjectMatch) {
    return subjectMatch[1];
  }

  return null;
}
```

### 9.6 Deliverables

- [ ] SendGrid account configured
- [ ] SendGrid Inbound Parse configured (MX records)
- [ ] Webhook endpoint with signature verification
- [ ] Email warmup system
- [ ] Email sequence processor with warmup limits
- [ ] Reply detection via Inbound Parse
- [ ] Hard vs soft bounce handling
- [ ] Unsubscribe handling
- [ ] CAN-SPAM compliant footers

### 9.7 Verification

```bash
# Configure SendGrid webhook
# Settings → Mail Settings → Event Webhook
# URL: https://your-project.cloudfunctions.net/sendgridWebhook
# Enable signature verification

# Configure Inbound Parse
# Settings → Inbound Parse
# Domain: replies.yourdomain.com
# URL: https://your-project.cloudfunctions.net/sendgridInboundParse

# Test webhook signature verification
curl -X POST https://YOUR_PROJECT.cloudfunctions.net/sendgridWebhook \
  -H "Content-Type: application/json" \
  -d '[{"event":"open","leadId":"test"}]'
# Should return 401 (no signature)

# Check logs
firebase functions:log --only sendgridWebhook
firebase functions:log --only sendgridInboundParse
```

---

## 10. Phase 4: Meta Ads Integration

**Duration:** 2 weeks
**Goal:** Custom audience sync with automatic token refresh

### 10.1 Meta Token Refresh

```typescript
// functions/src/meta/tokenRefresh.ts
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getDb } from "../config/firebase";
import { META_APP_ID, META_APP_SECRET } from "../config/secrets";
import { withRetry } from "../utils/retry";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { logInfo, logWarn, logError } from "../utils/logging";

const META_API_VERSION = "v19.0";

export const checkMetaTokenExpiration = onSchedule({
  schedule: "0 1 * * *", // 1 AM daily
  timeZone: "America/New_York",
  memory: "256MiB",
  secrets: [META_APP_ID, META_APP_SECRET],
}, async () => {
  const db = getDb();
  const tokenDoc = await db.collection("tokenRefresh").doc("meta").get();

  if (!tokenDoc.exists) {
    logWarn("No Meta token found in tokenRefresh collection");
    return;
  }

  const tokenData = tokenDoc.data()!;
  const expiresAt = (tokenData.expiresAt as Timestamp).toDate();
  const daysUntilExpiry = Math.floor(
    (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  logInfo(`Meta token expires in ${daysUntilExpiry} days`, { daysUntilExpiry });

  if (daysUntilExpiry <= 7) {
    // Attempt to refresh
    try {
      const newToken = await refreshLongLivedToken(
        tokenData.accessToken,
        META_APP_ID.value(),
        META_APP_SECRET.value()
      );

      await tokenDoc.ref.update({
        accessToken: newToken.accessToken,
        expiresAt: Timestamp.fromDate(
          new Date(Date.now() + newToken.expiresIn * 1000)
        ),
        lastRefreshedAt: FieldValue.serverTimestamp(),
        refreshAttempts: 0,
        lastError: null,
      });

      logInfo("Meta token refreshed successfully", {
        newExpiresIn: newToken.expiresIn,
      });

      // Also create an alert for visibility
      await db.collection("alerts").add({
        userId: "system",
        type: "token_refreshed",
        title: "Meta token refreshed",
        message: `Token will now expire in ${Math.floor(newToken.expiresIn / 86400)} days`,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      logError("Failed to refresh Meta token", error);

      await tokenDoc.ref.update({
        refreshAttempts: FieldValue.increment(1),
        lastError: error instanceof Error ? error.message : "Unknown error",
      });

      // Create critical alert
      await db.collection("alerts").add({
        userId: "system",
        type: "token_refresh_failed",
        title: "CRITICAL: Meta token refresh failed",
        message: `Token expires in ${daysUntilExpiry} days. Manual intervention required.`,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  }
});

async function refreshLongLivedToken(
  currentToken: string,
  appId: string,
  appSecret: string
): Promise<{ accessToken: string; expiresIn: number }> {
  return withRetry(async () => {
    const url = new URL(`https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`);
    url.searchParams.set("grant_type", "fb_exchange_token");
    url.searchParams.set("client_id", appId);
    url.searchParams.set("client_secret", appSecret);
    url.searchParams.set("fb_exchange_token", currentToken);

    const response = await fetch(url.toString());

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Token refresh failed: ${JSON.stringify(error)}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in || 5184000, // Default 60 days
    };
  });
}

export async function getValidMetaToken(): Promise<string> {
  const db = getDb();
  const tokenDoc = await db.collection("tokenRefresh").doc("meta").get();

  if (!tokenDoc.exists) {
    throw new Error("No Meta token configured");
  }

  const tokenData = tokenDoc.data()!;
  const expiresAt = (tokenData.expiresAt as Timestamp).toDate();

  if (expiresAt < new Date()) {
    throw new Error("Meta token has expired");
  }

  return tokenData.accessToken;
}
```

### 10.2 Meta Ads Client (Updated)

```typescript
// functions/src/meta/clients/metaAds.ts
import crypto from "crypto";
import { withRetry } from "../../utils/retry";
import { logInfo, logError } from "../../utils/logging";
import type { Lead } from "../../types";

const META_API_VERSION = "v19.0";
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

export class MetaAdsClient {
  private accessToken: string;
  private adAccountId: string;

  constructor(accessToken: string, adAccountId: string) {
    this.accessToken = accessToken;
    this.adAccountId = adAccountId;
  }

  async createCustomAudience(
    name: string,
    description: string
  ): Promise<string> {
    return withRetry(async () => {
      const response = await fetch(
        `${META_BASE_URL}/act_${this.adAccountId}/customaudiences`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: this.accessToken,
            name,
            description,
            subtype: "CUSTOM",
            customer_file_source: "USER_PROVIDED_ONLY",
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to create audience: ${JSON.stringify(error)}`);
      }

      const data = await response.json();
      logInfo(`Created Meta audience: ${data.id}`, { audienceId: data.id });
      return data.id;
    });
  }

  async uploadToAudience(audienceId: string, leads: Lead[]): Promise<number> {
    const users = leads
      .map((lead) => this.hashLeadData(lead))
      .filter((u) => u !== null);

    if (users.length === 0) {
      logInfo("No valid users to upload to audience", { audienceId });
      return 0;
    }

    let uploadedCount = 0;
    const batchSize = 10000;

    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);

      await withRetry(async () => {
        const response = await fetch(
          `${META_BASE_URL}/${audienceId}/users`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              access_token: this.accessToken,
              payload: {
                schema: ["EMAIL", "PHONE", "FN", "LN", "ZIP", "CT", "ST"],
                data: batch,
              },
            }),
          }
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(`Failed to upload to audience: ${JSON.stringify(error)}`);
        }

        const result = await response.json();
        uploadedCount += result.num_received || batch.length;
      });

      // Rate limiting between batches
      if (i + batchSize < users.length) {
        await this.delay(1000);
      }
    }

    logInfo(`Uploaded ${uploadedCount} users to audience`, {
      audienceId,
      uploadedCount,
    });

    return uploadedCount;
  }

  async getAudienceSize(audienceId: string): Promise<number> {
    try {
      const response = await fetch(
        `${META_BASE_URL}/${audienceId}?fields=approximate_count&access_token=${this.accessToken}`
      );

      if (!response.ok) {
        return 0;
      }

      const data = await response.json();
      return data.approximate_count || 0;
    } catch {
      return 0;
    }
  }

  private hashLeadData(lead: Lead): string[] | null {
    // Must have at least email or phone
    if (
      (!lead.emails || lead.emails.length === 0) &&
      (!lead.phones || lead.phones.length === 0)
    ) {
      return null;
    }

    const hash = (value: string | undefined): string => {
      if (!value) return "";
      return crypto
        .createHash("sha256")
        .update(value.toLowerCase().trim())
        .digest("hex");
    };

    const normalizePhone = (phone: string | undefined): string => {
      if (!phone) return "";
      const digits = phone.replace(/\D/g, "");
      return digits.startsWith("1") ? digits : `1${digits}`;
    };

    return [
      hash(lead.primaryEmail || lead.emails?.[0]),
      hash(normalizePhone(lead.primaryPhone || lead.phones?.[0])),
      hash(lead.ownerFirstName),
      hash(lead.ownerLastName),
      hash(lead.zipCode),
      hash(lead.city),
      hash(lead.state),
    ];
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

### 10.3 Audience Sync Function (Updated)

```typescript
// functions/src/meta/syncAudiences.ts
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getDb } from "../config/firebase";
import { getValidMetaToken } from "./tokenRefresh";
import { MetaAdsClient } from "./clients/metaAds";
import { FieldValue } from "firebase-admin/firestore";
import { logInfo, logError, logMetric } from "../utils/logging";
import type { Config, Lead } from "../types";

const MIN_AUDIENCE_SIZE = 100; // Meta requires minimum 100 users

export const syncMetaAudiences = onSchedule({
  schedule: "0 3 * * *", // 3 AM daily
  timeZone: "America/New_York",
  memory: "512MiB",
  timeoutSeconds: 540,
}, async () => {
  const db = getDb();

  // Get valid token (will throw if expired)
  let accessToken: string;
  try {
    accessToken = await getValidMetaToken();
  } catch (error) {
    logError("Cannot sync Meta audiences - token invalid", error);
    return;
  }

  const configSnap = await db.collection("config").get();

  for (const configDoc of configSnap.docs) {
    const config = configDoc.data() as Config;
    if (!config.metaAdsEnabled) continue;

    const userId = configDoc.id;
    logInfo(`Syncing Meta audiences for user ${userId}`, { userId });

    const client = new MetaAdsClient(accessToken, config.metaAdAccountId);

    try {
      // Get or create the audience
      const audienceId = await getOrCreateAudience(db, userId, client);

      // Find leads not yet added (user's leads only)
      const leadsSnap = await db
        .collection("leads")
        .where("userId", "==", userId)
        .where("addedToMetaAudience", "==", false)
        .where("status", "in", ["enriched", "outreach_active", "responded"])
        .limit(10000)
        .get();

      if (leadsSnap.empty) {
        logInfo(`No new leads to add for user ${userId}`, { userId });
        continue;
      }

      const leads = leadsSnap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as Lead)
      );

      // Filter to leads with email or phone
      const validLeads = leads.filter(
        (l) =>
          (l.emails && l.emails.length > 0) ||
          (l.phones && l.phones.length > 0)
      );

      if (validLeads.length < MIN_AUDIENCE_SIZE) {
        logInfo(
          `Only ${validLeads.length} leads available, need ${MIN_AUDIENCE_SIZE} minimum`,
          { userId, count: validLeads.length }
        );
        // Still upload, but Meta won't activate until minimum reached
      }

      logInfo(`Uploading ${validLeads.length} leads to Meta audience`, {
        userId,
        count: validLeads.length,
      });

      const uploadedCount = await client.uploadToAudience(audienceId, validLeads);

      // Mark leads as added (batch to avoid timeout)
      const batchSize = 499;
      for (let i = 0; i < validLeads.length; i += batchSize) {
        const batch = db.batch();
        const batchLeads = validLeads.slice(i, i + batchSize);

        for (const lead of batchLeads) {
          batch.update(db.collection("leads").doc(lead.id), {
            addedToMetaAudience: true,
            metaAudienceId: audienceId,
            metaAudienceAddedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        await batch.commit();
      }

      // Update audience size
      const size = await client.getAudienceSize(audienceId);
      await db.collection("metaAudiences").doc(audienceId).update({
        memberCount: size,
        lastSyncAt: FieldValue.serverTimestamp(),
      });

      // Update config
      await configDoc.ref.update({
        lastAudienceSyncAt: FieldValue.serverTimestamp(),
      });

      // Log
      await db.collection("outreachLog").add({
        userId,
        leadId: "batch",
        channel: "meta_ad",
        action: "audience_sync",
        details: {
          leadsAdded: uploadedCount,
          audienceId,
          audienceSize: size,
        },
        timestamp: FieldValue.serverTimestamp(),
      });

      logMetric("meta_audience_synced", uploadedCount, { userId });
    } catch (error) {
      logError(`Error syncing Meta audiences for user ${userId}`, error, {
        userId,
      });
    }
  }
});

async function getOrCreateAudience(
  db: FirebaseFirestore.Firestore,
  userId: string,
  client: MetaAdsClient
): Promise<string> {
  const audienceSnap = await db
    .collection("metaAudiences")
    .where("userId", "==", userId)
    .where("type", "==", "motivated_sellers")
    .limit(1)
    .get();

  if (!audienceSnap.empty) {
    return audienceSnap.docs[0].data().metaAudienceId;
  }

  const name = `Motivated Sellers - ${new Date().toISOString().slice(0, 10)}`;
  const description = "Property owners with listings 90+ days on market";

  const metaAudienceId = await client.createCustomAudience(name, description);

  await db.collection("metaAudiences").doc(metaAudienceId).set({
    metaAudienceId,
    userId,
    adAccountId: client["adAccountId"],
    name,
    type: "motivated_sellers",
    memberCount: 0,
    createdAt: FieldValue.serverTimestamp(),
    lastSyncAt: null,
  });

  return metaAudienceId;
}
```

### 10.4 Deliverables

- [ ] Meta Business account configured
- [ ] Facebook App with Marketing API access
- [ ] Token stored in Firestore (encrypted at rest)
- [ ] Automatic token refresh (7 days before expiry)
- [ ] Alert on refresh failure
- [ ] Custom Audience creation
- [ ] Audience sync with per-user isolation
- [ ] Minimum audience size handling

---

## 11. Phase 5: Ringless Voicemail

**Duration:** 1 week
**Goal:** RVM with state law compliance

### 11.1 State Law Filtering

```typescript
// functions/src/rvm/stateFiltering.ts

// States with stricter RVM laws or outright bans
// This list should be verified with legal counsel
const RESTRICTED_STATES: Record<string, { blocked: boolean; notes: string }> = {
  FL: {
    blocked: true,
    notes: "Florida requires prior express consent for RVM",
  },
  PA: {
    blocked: true,
    notes: "Pennsylvania Telemarketer Registration Act restrictions",
  },
  WA: {
    blocked: false,
    notes: "Washington requires registration; verify compliance",
  },
  // Add more states as needed based on legal review
};

export function isRvmAllowedForState(state: string): {
  allowed: boolean;
  reason?: string;
} {
  const stateUpper = state.toUpperCase();
  const restriction = RESTRICTED_STATES[stateUpper];

  if (restriction?.blocked) {
    return {
      allowed: false,
      reason: restriction.notes,
    };
  }

  return { allowed: true };
}

export function filterLeadsByState(
  leads: Array<{ id: string; state: string }>,
  blockedStates: string[]
): {
  allowed: Array<{ id: string; state: string }>;
  blocked: Array<{ id: string; state: string; reason: string }>;
} {
  const allowed: Array<{ id: string; state: string }> = [];
  const blocked: Array<{ id: string; state: string; reason: string }> = [];

  for (const lead of leads) {
    // Check config blocked states first
    if (blockedStates.includes(lead.state.toUpperCase())) {
      blocked.push({
        ...lead,
        reason: "State blocked in config",
      });
      continue;
    }

    // Check legal restrictions
    const stateCheck = isRvmAllowedForState(lead.state);
    if (!stateCheck.allowed) {
      blocked.push({
        ...lead,
        reason: stateCheck.reason || "State restricted",
      });
      continue;
    }

    allowed.push(lead);
  }

  return { allowed, blocked };
}
```

### 11.2 RVM Scheduler (Updated)

```typescript
// functions/src/rvm/scheduleDrops.ts
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getDb } from "../config/firebase";
import {
  SLYBROADCAST_UID,
  SLYBROADCAST_PASSWORD,
  DNC_API_KEY,
  DNC_API_SECRET,
} from "../config/secrets";
import { SlybroadcastClient } from "./clients/slybroadcast";
import { DncChecker } from "../utils/dncCheck";
import { filterLeadsByState } from "./stateFiltering";
import { FieldValue } from "firebase-admin/firestore";
import { logInfo, logWarn, logError, logMetric } from "../utils/logging";
import type { Config, Lead } from "../types";

export const processRVMDrops = onSchedule({
  schedule: "0 11 * * 1-5", // 11 AM weekdays only
  timeZone: "America/New_York",
  memory: "256MiB",
  timeoutSeconds: 540,
  secrets: [SLYBROADCAST_UID, SLYBROADCAST_PASSWORD, DNC_API_KEY, DNC_API_SECRET],
}, async () => {
  const db = getDb();
  const configSnap = await db.collection("config").get();

  for (const configDoc of configSnap.docs) {
    const config = configDoc.data() as Config;
    if (!config.rvmEnabled) continue;

    const userId = configDoc.id;
    logInfo(`Processing RVM drops for user ${userId}`, { userId });

    const rvmClient = new SlybroadcastClient({
      uid: SLYBROADCAST_UID.value(),
      password: SLYBROADCAST_PASSWORD.value(),
      callerId: config.rvmCallerId,
      audioUrl: config.rvmAudioUrl,
    });

    const dncChecker = new DncChecker(
      DNC_API_KEY.value(),
      DNC_API_SECRET.value()
    );

    // Find eligible leads
    const leadsSnap = await db
      .collection("leads")
      .where("userId", "==", userId)
      .where("status", "==", "outreach_active")
      .where("emailSequenceStep", ">=", config.rvmStartAfterStep || 3)
      .where("rvmSentAt", "==", null)
      .limit(100) // Daily cap
      .get();

    if (leadsSnap.empty) {
      logInfo(`No eligible leads for RVM for user ${userId}`, { userId });
      continue;
    }

    const leads = leadsSnap.docs.map(
      (d) => ({ id: d.id, ...d.data() } as Lead)
    );

    // Filter by phone availability
    const leadsWithPhone = leads.filter(
      (l) => l.primaryPhone || (l.phones && l.phones.length > 0)
    );

    // Filter by state laws
    const { allowed: stateAllowed, blocked: stateBlocked } = filterLeadsByState(
      leadsWithPhone.map((l) => ({ id: l.id, state: l.state })),
      config.rvmBlockedStates || []
    );

    if (stateBlocked.length > 0) {
      logInfo(`${stateBlocked.length} leads blocked by state restrictions`, {
        userId,
        blocked: stateBlocked.map((l) => ({
          id: l.id,
          state: l.state,
          reason: l.reason,
        })),
      });
    }

    const eligibleLeads = leadsWithPhone.filter((l) =>
      stateAllowed.some((a) => a.id === l.id)
    );

    // Re-check DNC before sending (phones may have been added since enrichment)
    const phonesToCheck = eligibleLeads.map(
      (l) => l.primaryPhone || l.phones[0]
    );
    const dncResults = await dncChecker.checkPhones(phonesToCheck);

    let sentCount = 0;
    let failCount = 0;
    let dncBlockedCount = 0;

    for (const lead of eligibleLeads) {
      const phone = lead.primaryPhone || lead.phones[0];
      const dncResult = dncResults.get(phone);

      if (dncResult?.isBlocked) {
        dncBlockedCount++;
        await db.collection("leads").doc(lead.id).update({
          dncStatus: "blocked",
          dncBlockedPhones: FieldValue.arrayUnion(phone),
          updatedAt: FieldValue.serverTimestamp(),
        });
        continue;
      }

      try {
        const result = await rvmClient.sendVoicemail(lead);

        await db.collection("leads").doc(lead.id).update({
          rvmSentAt: FieldValue.serverTimestamp(),
          rvmDeliveryStatus: result.success ? "delivered" : "failed",
          updatedAt: FieldValue.serverTimestamp(),
        });

        await db.collection("outreachLog").add({
          userId,
          leadId: lead.id,
          channel: "rvm",
          action: result.success ? "delivered" : "failed",
          details: {
            phone,
            deliveryId: result.deliveryId,
            error: result.error,
          },
          timestamp: FieldValue.serverTimestamp(),
        });

        if (result.success) {
          sentCount++;
        } else {
          failCount++;
        }

        // Rate limit: 1 per second (Slybroadcast limit)
        await delay(1000);
      } catch (error) {
        logError(`RVM failed for ${lead.id}`, error, { leadId: lead.id });
        failCount++;
      }
    }

    logInfo(`Completed RVM drops for ${userId}`, {
      userId,
      sentCount,
      failCount,
      dncBlockedCount,
      stateBlockedCount: stateBlocked.length,
    });

    logMetric("rvm_sent", sentCount, { userId });
    logMetric("rvm_dnc_blocked", dncBlockedCount, { userId });
  }
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

### 11.3 Deliverables

- [ ] Slybroadcast account created
- [ ] Audio file recorded and hosted
- [ ] State law filtering implemented
- [ ] DNC re-check before RVM
- [ ] Rate limiting respected
- [ ] Proper logging and metrics

---

*Continued in next section (Phases 12-19)...*

## 12. Phase 6: Admin Dashboard

**Duration:** 2 weeks
**Goal:** Web interface with proper data isolation

### 12.1 Key Security Considerations

The dashboard must enforce per-user data isolation:

```typescript
// webapp/src/hooks/useLeads.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "../config/firebase";
import type { Lead } from "../types";

export function useLeads(filters?: LeadFilters) {
  const queryClient = useQueryClient();
  const userId = auth.currentUser?.uid;

  const leadsQuery = useQuery({
    queryKey: ["leads", userId, filters],
    queryFn: async () => {
      if (!userId) throw new Error("Not authenticated");

      // CRITICAL: Always filter by userId
      let q = query(
        collection(db, "leads"),
        where("userId", "==", userId),
        orderBy("createdAt", "desc")
      );

      if (filters?.status) {
        q = query(q, where("status", "==", filters.status));
      }

      q = query(q, limit(filters?.limit || 100));

      const snapshot = await getDocs(q);
      return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Lead));
    },
    enabled: !!userId,
  });

  const updateLead = useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Lead>;
    }) => {
      if (!userId) throw new Error("Not authenticated");

      // Security: Firestore rules will verify ownership
      await updateDoc(doc(db, "leads", id), {
        ...updates,
        updatedAt: serverTimestamp(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  return {
    leads: leadsQuery.data || [],
    isLoading: leadsQuery.isLoading,
    error: leadsQuery.error,
    updateLead: updateLead.mutate,
    isUpdating: updateLead.isPending,
  };
}
```

### 12.2 Settings with CAN-SPAM Fields

```typescript
// webapp/src/pages/Settings.tsx
import { useConfig } from "../hooks/useConfig";
import { TargetingSection } from "../components/Settings/TargetingSection";
import { CompanyInfoSection } from "../components/Settings/CompanyInfoSection";
import { EmailSection } from "../components/Settings/EmailSection";
import { MetaAdsSection } from "../components/Settings/MetaAdsSection";
import { RVMSection } from "../components/Settings/RVMSection";
import { WarmupStatus } from "../components/Settings/WarmupStatus";

export function Settings() {
  const { config, updateConfig, isLoading, isSaving } = useConfig();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="space-y-8">
        {/* CAN-SPAM Required Company Info */}
        <CompanyInfoSection
          config={config}
          onChange={updateConfig}
          disabled={isSaving}
        />

        <TargetingSection
          config={config}
          onChange={updateConfig}
          disabled={isSaving}
        />

        <EmailSection
          config={config}
          onChange={updateConfig}
          disabled={isSaving}
        />

        {/* Show warmup status if email enabled */}
        {config.emailEnabled && config.warmupEnabled && (
          <WarmupStatus configId={config.userId} />
        )}

        <MetaAdsSection
          config={config}
          onChange={updateConfig}
          disabled={isSaving}
        />

        <RVMSection
          config={config}
          onChange={updateConfig}
          disabled={isSaving}
        />
      </div>
    </div>
  );
}

// webapp/src/components/Settings/CompanyInfoSection.tsx
interface CompanyInfoSectionProps {
  config: Config;
  onChange: (updates: Partial<Config>) => void;
  disabled: boolean;
}

export function CompanyInfoSection({
  config,
  onChange,
  disabled,
}: CompanyInfoSectionProps) {
  return (
    <section className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-2">Company Information</h2>
      <p className="text-sm text-gray-500 mb-4">
        Required for CAN-SPAM compliance. This information appears in email
        footers.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Company Name *
          </label>
          <input
            type="text"
            value={config.companyName || ""}
            onChange={(e) => onChange({ companyName: e.target.value })}
            className="w-full rounded-md border-gray-300 shadow-sm"
            disabled={disabled}
            required
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Physical Address *
          </label>
          <input
            type="text"
            value={config.physicalAddress || ""}
            onChange={(e) => onChange({ physicalAddress: e.target.value })}
            className="w-full rounded-md border-gray-300 shadow-sm"
            disabled={disabled}
            placeholder="123 Main Street, Suite 100"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            City *
          </label>
          <input
            type="text"
            value={config.physicalCity || ""}
            onChange={(e) => onChange({ physicalCity: e.target.value })}
            className="w-full rounded-md border-gray-300 shadow-sm"
            disabled={disabled}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              State *
            </label>
            <input
              type="text"
              value={config.physicalState || ""}
              onChange={(e) =>
                onChange({ physicalState: e.target.value.toUpperCase() })
              }
              className="w-full rounded-md border-gray-300 shadow-sm"
              disabled={disabled}
              maxLength={2}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ZIP *
            </label>
            <input
              type="text"
              value={config.physicalZip || ""}
              onChange={(e) => onChange({ physicalZip: e.target.value })}
              className="w-full rounded-md border-gray-300 shadow-sm"
              disabled={disabled}
              maxLength={10}
              required
            />
          </div>
        </div>
      </div>
    </section>
  );
}
```

### 12.3 Deliverables

- [ ] Authentication flow (Firebase Auth)
- [ ] Dashboard with stats and charts
- [ ] Leads list with per-user filtering
- [ ] Lead detail view with activity timeline
- [ ] Settings page with CAN-SPAM fields
- [ ] Warmup status display
- [ ] Email sequence builder
- [ ] Alert center
- [ ] Responsive design
- [ ] Deployed to Firebase Hosting

---

## 13. Phase 7: Response Tracking & CRM

**Duration:** 1 week
**Goal:** Hot lead alerts and pipeline management

### 13.1 Hot Lead Alert Handler

```typescript
// functions/src/orchestration/hotLeadAlerts.ts
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { getDb } from "../config/firebase";
import { SENDGRID_API_KEY } from "../config/secrets";
import { FieldValue } from "firebase-admin/firestore";
import { logInfo } from "../utils/logging";
import type { Lead, Config } from "../types";
import sgMail from "@sendgrid/mail";

export const handleHotLead = onDocumentUpdated({
  document: "leads/{leadId}",
  secrets: [SENDGRID_API_KEY],
}, async (event) => {
  const before = event.data?.before.data() as Lead;
  const after = event.data?.after.data() as Lead;

  if (!before || !after) return;

  const db = getDb();

  // Detect status change to "responded"
  if (before.status !== "responded" && after.status === "responded") {
    logInfo(`Hot lead detected: ${event.params.leadId}`, {
      leadId: event.params.leadId,
    });

    // Update timestamp
    await event.data?.after.ref.update({
      respondedAt: FieldValue.serverTimestamp(),
    });

    // Create alert
    await db.collection("alerts").add({
      userId: after.userId,
      type: "hot_lead",
      leadId: event.params.leadId,
      title: `${after.ownerFirstName || "Owner"} responded!`,
      message: `Lead at ${after.address} has responded to your outreach.`,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    // Send notification email
    await sendHotLeadNotification(after, SENDGRID_API_KEY.value());
  }

  // Detect high engagement (3+ opens)
  if (after.emailOpens >= 3 && before.emailOpens < 3) {
    await db.collection("alerts").add({
      userId: after.userId,
      type: "high_engagement",
      leadId: event.params.leadId,
      title: "High email engagement",
      message: `Lead at ${after.address} has opened your emails ${after.emailOpens} times.`,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  // Detect RVM callback
  if (!before.rvmCallbackReceived && after.rvmCallbackReceived) {
    await db.collection("alerts").add({
      userId: after.userId,
      type: "rvm_callback",
      leadId: event.params.leadId,
      title: "Voicemail callback received",
      message: `Lead at ${after.address} called back after RVM.`,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
});

async function sendHotLeadNotification(
  lead: Lead,
  sendgridApiKey: string
): Promise<void> {
  const db = getDb();

  // Get user config for notification email
  const configDoc = await db.collection("config").doc(lead.userId).get();
  if (!configDoc.exists) return;

  const config = configDoc.data() as Config;
  const notifyEmail = config.replyToEmail || config.fromEmail;

  if (!notifyEmail) return;

  sgMail.setApiKey(sendgridApiKey);

  const msg = {
    to: notifyEmail,
    from: {
      email: config.fromEmail,
      name: "Lead Alert",
    },
    subject: `🔥 Hot Lead: ${lead.ownerFirstName || "Owner"} responded!`,
    html: `
      <h2>A lead has responded to your outreach!</h2>
      <p><strong>Property:</strong> ${lead.address}, ${lead.city}, ${lead.state} ${lead.zipCode}</p>
      <p><strong>Owner:</strong> ${lead.ownerName}</p>
      <p><strong>List Price:</strong> $${lead.listPrice.toLocaleString()}</p>
      <p><strong>Days on Market:</strong> ${lead.daysOnMarket}</p>
      <hr>
      <p><strong>Contact Info:</strong></p>
      <ul>
        ${lead.emails.map((e) => `<li>Email: ${e}</li>`).join("")}
        ${lead.phones.map((p) => `<li>Phone: ${p}</li>`).join("")}
      </ul>
      <p><a href="https://your-app.web.app/leads/${lead.id}">View Lead Details</a></p>
    `,
  };

  try {
    await sgMail.send(msg);
    logInfo("Sent hot lead notification", {
      leadId: lead.id,
      notifyEmail,
    });
  } catch (error) {
    // Don't throw - notification failure shouldn't break the flow
    console.error("Failed to send hot lead notification:", error);
  }
}
```

### 13.2 Deliverables

- [ ] Status change detection
- [ ] Hot lead alerts created
- [ ] Email notifications to agent
- [ ] High engagement detection
- [ ] RVM callback tracking
- [ ] Pipeline view in dashboard
- [ ] Alert center with read/unread

---

## 14. Testing Strategy

### 14.1 Unit Tests

```typescript
// functions/src/__tests__/utils/retry.test.ts
import { describe, it, expect, vi } from "vitest";
import { withRetry } from "../../utils/retry";

describe("withRetry", () => {
  it("should succeed on first attempt", async () => {
    const fn = vi.fn().mockResolvedValue("success");

    const result = await withRetry(fn);

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should retry on failure and eventually succeed", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockRejectedValueOnce(new Error("ETIMEDOUT"))
      .mockResolvedValue("success");

    const result = await withRetry(fn, { initialDelayMs: 10 });

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("should throw after max attempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("ECONNRESET"));

    await expect(
      withRetry(fn, { maxAttempts: 3, initialDelayMs: 10 })
    ).rejects.toThrow("ECONNRESET");

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("should not retry non-retryable errors", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Invalid API key"));

    await expect(withRetry(fn, { initialDelayMs: 10 })).rejects.toThrow(
      "Invalid API key"
    );

    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// functions/src/__tests__/utils/dncCheck.test.ts
describe("DncChecker", () => {
  it("should normalize phone numbers correctly", () => {
    const checker = new DncChecker("key", "secret");

    expect(checker["normalizePhone"]("(555) 123-4567")).toBe("5551234567");
    expect(checker["normalizePhone"]("1-555-123-4567")).toBe("5551234567");
    expect(checker["normalizePhone"]("15551234567")).toBe("5551234567");
    expect(checker["normalizePhone"]("555")).toBeNull();
  });
});

// functions/src/__tests__/email/warmup.test.ts
describe("Warmup", () => {
  it("should return correct daily limits", () => {
    expect(getDailyLimit(1)).toBe(50);
    expect(getDailyLimit(7)).toBe(400);
    expect(getDailyLimit(14)).toBe(2000);
    expect(getDailyLimit(100)).toBe(2000); // Max
  });
});

// functions/src/__tests__/rvm/stateFiltering.test.ts
describe("State Filtering", () => {
  it("should block restricted states", () => {
    const result = isRvmAllowedForState("FL");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Florida");
  });

  it("should allow unrestricted states", () => {
    const result = isRvmAllowedForState("TX");
    expect(result.allowed).toBe(true);
  });

  it("should filter leads by state", () => {
    const leads = [
      { id: "1", state: "TX" },
      { id: "2", state: "FL" },
      { id: "3", state: "CA" },
    ];

    const { allowed, blocked } = filterLeadsByState(leads, []);

    expect(allowed).toHaveLength(2);
    expect(blocked).toHaveLength(1);
    expect(blocked[0].id).toBe("2");
  });
});
```

### 14.2 Integration Tests

```typescript
// functions/src/__tests__/integration/emailSequence.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";

describe("Email Sequence Integration", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "demo-test",
      firestore: { host: "localhost", port: 8080 },
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  it("should enforce per-user data isolation", async () => {
    const user1 = testEnv.authenticatedContext("user1");
    const user2 = testEnv.authenticatedContext("user2");

    // User 1 creates a lead
    await user1.firestore().collection("leads").doc("lead1").set({
      userId: "user1",
      address: "123 Test St",
      status: "new",
    });

    // User 2 should not be able to read user1's lead
    const readAttempt = user2
      .firestore()
      .collection("leads")
      .doc("lead1")
      .get();

    await expect(readAttempt).rejects.toThrow();
  });
});
```

### 14.3 Deliverables

- [ ] Unit tests for all utilities
- [ ] Unit tests for state filtering
- [ ] Unit tests for warmup logic
- [ ] Integration tests with emulator
- [ ] Security rule tests
- [ ] CI pipeline running tests

---

## 15. Deployment

### 15.1 Secret Configuration

```bash
# Add all secrets
firebase functions:secrets:set BATCHLEADS_API_KEY
firebase functions:secrets:set SENDGRID_API_KEY
firebase functions:secrets:set SENDGRID_WEBHOOK_SECRET
firebase functions:secrets:set DNC_API_KEY
firebase functions:secrets:set DNC_API_SECRET
firebase functions:secrets:set META_APP_ID
firebase functions:secrets:set META_APP_SECRET
firebase functions:secrets:set SLYBROADCAST_UID
firebase functions:secrets:set SLYBROADCAST_PASSWORD

# Store Meta token in Firestore (initial setup)
# This should be done via admin script or console
```

### 15.2 Cloud Tasks Queue Setup

```bash
# Create listing sync queue
gcloud tasks queues create listing-sync \
  --location=us-central1 \
  --max-concurrent-dispatches=10 \
  --max-attempts=3 \
  --min-backoff=30s \
  --max-backoff=300s
```

### 15.3 Deploy Commands

```bash
# Deploy everything
firebase deploy

# Deploy specific components
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
firebase deploy --only functions
firebase deploy --only hosting

# Deploy specific functions
firebase deploy --only functions:syncListingsOrchestrator,functions:syncListingsWorker
```

### 15.4 CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy to Firebase

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install

      - name: Run tests
        run: pnpm --filter functions test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install

      - name: Build functions
        run: pnpm --filter functions build

      - name: Build webapp
        run: pnpm --filter webapp build

      - name: Deploy to Firebase
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: "${{ secrets.GITHUB_TOKEN }}"
          firebaseServiceAccount: "${{ secrets.FIREBASE_SERVICE_ACCOUNT }}"
          channelId: live
          projectId: ${{ secrets.FIREBASE_PROJECT_ID }}
```

---

## 16. Monitoring & Maintenance

### 16.1 Daily Health Check

```typescript
// functions/src/monitoring/healthCheck.ts
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getDb } from "../config/firebase";
import { getValidMetaToken } from "../meta/tokenRefresh";
import { FieldValue } from "firebase-admin/firestore";
import { logInfo, logError } from "../utils/logging";

export const dailyHealthCheck = onSchedule({
  schedule: "0 7 * * *",
  timeZone: "America/New_York",
}, async () => {
  const db = getDb();
  const checks: Record<string, boolean> = {};
  const errors: string[] = [];

  // Check Firestore
  try {
    await db.collection("_healthcheck").doc("test").set({
      timestamp: new Date(),
    });
    await db.collection("_healthcheck").doc("test").get();
    checks.firestore = true;
  } catch (error) {
    checks.firestore = false;
    errors.push(`Firestore: ${error}`);
  }

  // Check Meta token
  try {
    await getValidMetaToken();
    checks.metaToken = true;
  } catch (error) {
    checks.metaToken = false;
    errors.push(`Meta token: ${error}`);
  }

  // Check recent sync
  try {
    const recentLeads = await db
      .collection("leads")
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    if (!recentLeads.empty) {
      const lastLead = recentLeads.docs[0].data();
      const lastCreated = lastLead.createdAt?.toDate();
      const hoursSinceLastLead =
        (Date.now() - lastCreated.getTime()) / (1000 * 60 * 60);

      checks.recentSync = hoursSinceLastLead < 48; // Within 48 hours
      if (!checks.recentSync) {
        errors.push(`No new leads in ${hoursSinceLastLead.toFixed(0)} hours`);
      }
    }
  } catch (error) {
    checks.recentSync = false;
    errors.push(`Recent sync check: ${error}`);
  }

  // Log results
  const allPassed = Object.values(checks).every((v) => v);

  if (allPassed) {
    logInfo("Health check passed", { checks });
  } else {
    logError("Health check failed", new Error(errors.join("; ")), { checks });

    // Create alert
    await db.collection("alerts").add({
      userId: "system",
      type: "health_check_failed",
      title: "System health check failed",
      message: errors.join("\n"),
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
});
```

### 16.2 Maintenance Schedule

| Task | Frequency | Description |
|------|-----------|-------------|
| Review error logs | Daily | Check for recurring issues |
| Verify sync completion | Daily | Ensure listings synced |
| Check email deliverability | Weekly | Monitor bounce rates |
| Review warmup metrics | Weekly | Check bounce/complaint rates |
| Check Meta token expiry | Daily (automated) | Alert 7 days before |
| Review RVM costs | Monthly | Monitor spending |
| Database cleanup | Monthly | Archive old leads |
| Update dependencies | Monthly | Security patches |
| Review DNC compliance | Monthly | Verify DNC syncs |
| Legal review | Quarterly | Check state law changes |

---

## 17. Security & Compliance

### 17.1 Security Checklist

- [ ] All API keys in Secret Manager (never in code)
- [ ] Firestore security rules enforce per-user isolation
- [ ] Webhook endpoints verify signatures
- [ ] HTTPS only (Firebase Hosting default)
- [ ] Firebase Auth for dashboard access
- [ ] Input validation on all user inputs
- [ ] Rate limiting on public endpoints
- [ ] Audit logging for sensitive operations

### 17.2 Compliance Checklist

#### CAN-SPAM (Email)

- [ ] Unsubscribe link in every email
- [ ] Physical mailing address in footer (from config)
- [ ] Company name in footer
- [ ] Accurate "From" and "Subject" lines
- [ ] Honor unsubscribes immediately
- [ ] No deceptive headers or misleading subjects

#### TCPA (Phone/RVM)

- [ ] Federal DNC registry integration (DNC.com)
- [ ] Internal DNC list maintained
- [ ] State-specific RVM filtering (FL, PA blocked)
- [ ] Caller ID properly configured
- [ ] Clear identification in voicemail message
- [ ] Weekday business hours only (11 AM)

#### Meta Housing Ads

- [ ] Campaigns marked as "Housing" special category
- [ ] No discriminatory targeting
- [ ] Fair Housing Act compliance

#### Data Privacy

- [ ] Only collect necessary data
- [ ] Secure storage (encrypted at rest via Firestore)
- [ ] Per-user data isolation
- [ ] Document data retention policy
- [ ] Honor data deletion requests

---

## 18. Cost Projections (Revised)

### 18.1 Monthly Fixed Costs

| Service | Plan | Cost |
|---------|------|------|
| Firebase (Blaze) | Pay as you go | $50-100 |
| BatchLeads | Professional | $99 |
| SendGrid | Essentials 50k | $20 |
| DNC.com | API Access | $50 |
| Domain + SSL | Annual/12 | ~$3 |
| **Total Fixed** | | **~$222-272** |

### 18.2 Variable Costs

| Service | Unit | Cost | Example (1,000 leads) |
|---------|------|------|----------------------|
| Skip Tracing (if separate) | Per record | $0.10-0.15 | $100-150 |
| DNC Lookups | Per 1,000 | $5 | $5 |
| Ringless Voicemail | Per drop | $0.03 | $30 |
| Meta Ads | Budget | Variable | $500 |
| Firebase (overage) | Reads/writes | Variable | ~$20 |

### 18.3 Scaling Estimates

| Leads/Month | Fixed | Variable | Total |
|-------------|-------|----------|-------|
| 500 | $250 | $285 | ~$535 |
| 1,000 | $250 | $555 | ~$805 |
| 2,500 | $250 | $1,125 | ~$1,375 |
| 5,000 | $250 | $2,200 | ~$2,450 |

*Variable assumes: skip trace all, DNC check all, RVM 50%, $500 ad spend*

### 18.4 Cost Alerts

Set up Firebase budget alerts:
```bash
gcloud billing budgets create \
  --billing-account=BILLING_ACCOUNT_ID \
  --display-name="REMiner Monthly Budget" \
  --budget-amount=500 \
  --threshold-rule=percent=80 \
  --threshold-rule=percent=100
```

---

## 19. Timeline

### 19.1 Development Schedule

| Phase | Duration | Start | End |
|-------|----------|-------|-----|
| 0. Vendor Verification | 3 days | Week 0 | Week 0 |
| 1. Foundation | 1 week | Week 1 | Week 1 |
| 2. Data Ingestion | 2 weeks | Week 2 | Week 3 |
| 3. Email Campaigns | 2 weeks | Week 4 | Week 5 |
| 4. Meta Ads | 2 weeks | Week 6 | Week 7 |
| 5. Ringless VM | 1 week | Week 8 | Week 8 |
| 6. Admin Dashboard | 2 weeks | Week 9 | Week 10 |
| 7. Response/CRM | 1 week | Week 11 | Week 11 |
| Testing & Polish | 1 week | Week 12 | Week 12 |
| **Total** | **~13 weeks** | | |

### 19.2 Pre-Development Checklist

**CRITICAL: Complete before Week 1**

```
[ ] BatchLeads API access confirmed and tested
[ ] SendGrid account created, domain verified
[ ] SendGrid Inbound Parse MX records configured
[ ] DNC.com API access confirmed
[ ] Meta Business account verified
[ ] Meta App created, Marketing API access approved
[ ] Slybroadcast account created, audio recorded
[ ] Firebase project created, billing enabled
[ ] Legal review of state RVM laws completed
```

### 19.3 Milestones

| Milestone | Target | Criteria |
|-----------|--------|----------|
| M0: Vendors Ready | Week 0 | All API access confirmed |
| M1: Infrastructure | Week 1 | Firebase deployed, auth working |
| M2: Data Pipeline | Week 3 | Listings syncing, skip trace + DNC working |
| M3: Email Live | Week 5 | Sequences sending with warmup, reply detection |
| M4: Full Automation | Week 8 | All channels operational |
| M5: Dashboard | Week 10 | UI complete, usable by agent |
| M6: Launch | Week 12 | Production ready, documented |

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Feb 2026 | - | Initial version |
| 2.0 | Mar 2026 | - | Added: webhook verification, DNC integration, token refresh, state filtering, warmup, reply detection, per-user isolation, CAN-SPAM fields |

---

*This revised document addresses all identified gaps and provides a complete, compliance-ready blueprint for the Motivated Seller Outreach Platform.*
