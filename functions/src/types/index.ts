import { Timestamp, FieldValue } from "firebase-admin/firestore";

// Allow both Timestamp and FieldValue for write operations
type TimestampField = Timestamp | FieldValue;

// =============================================================================
// Config
// =============================================================================

export interface Config {
  userId: string;

  // Targeting
  targetZipCodes: string[];
  minDaysOnMarket: number;
  minListPrice: number;
  maxListPrice: number;
  propertyTypes: PropertyType[];

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
  inboundEmailDomain: string;

  // Email Warmup
  warmupEnabled: boolean;
  warmupStartDate: Timestamp | null;
  warmupCurrentDay: number;
  warmupDailyLimits: number[];

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
  rvmBlockedStates: string[];

  // Data Provider
  dataProvider: "batchleads" | "propstream";

  // Sync state
  lastListingSyncAt: Timestamp | null;
  lastAudienceSyncAt: Timestamp | null;
  lastDncSyncAt: Timestamp | null;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type PropertyType = "single_family" | "multi_family" | "condo" | "townhouse";

// =============================================================================
// Lead
// =============================================================================

export interface Lead {
  id: string;
  userId: string;

  // Property info
  address: string;
  city: string;
  state: string;
  zipCode: string;
  county: string;

  listPrice: number;
  listDate: TimestampField | Date;
  daysOnMarket: number;
  propertyType: string;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  yearBuilt: number;

  mlsNumber: string;
  listingAgentName: string;
  listingAgentPhone: string;

  // Owner info
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
  dncCheckedAt: TimestampField | null;
  dncStatus: "clear" | "blocked" | "pending" | null;
  dncBlockedPhones: string[];

  // Pipeline
  status: LeadStatus;
  source: "batchleads" | "propstream" | "manual";
  tags: string[];
  notes: string;
  assignedTo: string | null;

  // Email tracking
  emailSequenceId: string | null;
  emailSequenceStep: number;
  lastEmailSentAt: TimestampField | null;
  nextEmailScheduledAt: TimestampField | null;
  emailOpens: number;
  emailClicks: number;
  emailReplies: number;
  emailBounced: boolean;
  emailBounceType: "hard" | "soft" | null;
  emailUnsubscribed: boolean;

  // Meta tracking
  addedToMetaAudience: boolean;
  metaAudienceId: string | null;
  metaAudienceAddedAt: TimestampField | null;

  // RVM tracking
  rvmSentAt: TimestampField | null;
  rvmDeliveryStatus: "pending" | "delivered" | "failed" | null;
  rvmCallbackReceived: boolean;

  // Timestamps
  createdAt: TimestampField;
  updatedAt: TimestampField;
  enrichedAt: TimestampField | null;
  respondedAt: TimestampField | null;
  convertedAt: TimestampField | null;
}

export type LeadStatus =
  | "new"
  | "enriching"
  | "enriched"
  | "dnc_blocked"
  | "outreach_active"
  | "responded"
  | "appointment"
  | "deal"
  | "closed"
  | "dead"
  | "paused";

// =============================================================================
// Email
// =============================================================================

export interface EmailSequence {
  id: string;
  userId: string;
  name: string;
  description: string;
  isDefault: boolean;
  isActive: boolean;

  steps: EmailStep[];

  totalSent: number;
  totalOpens: number;
  totalClicks: number;
  totalReplies: number;

  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

export interface EmailStep {
  stepNumber: number;
  delayDays: number;
  delayHours: number;

  subject: string;
  preheaderText: string;
  bodyHtml: string;
  bodyText: string;

  variants: EmailVariant[];
  winningVariant: string | null;

  sent: number;
  opens: number;
  clicks: number;
  replies: number;
}

export interface EmailVariant {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  weight: number;
}

// =============================================================================
// Warmup
// =============================================================================

export interface WarmupStatus {
  configId: string;
  startDate: Timestamp;
  currentDay: number;
  dailyLimits: number[];
  sentToday: number;
  lastResetAt: Timestamp;

  totalSent: number;
  totalBounced: number;
  totalComplaints: number;
  bounceRate: number;
  complaintRate: number;

  status: "active" | "paused" | "completed" | "failed";
  pauseReason: string | null;
}

// =============================================================================
// Outreach Log
// =============================================================================

export interface OutreachLog {
  userId: string;
  leadId: string;
  channel: "email" | "meta_ad" | "rvm" | "skip_trace" | "manual";
  action: string;
  details: Record<string, unknown>;
  timestamp: Timestamp;
}

// =============================================================================
// Meta
// =============================================================================

export interface MetaAudience {
  metaAudienceId: string;
  userId: string;
  adAccountId: string;
  name: string;
  type: "motivated_sellers" | "lookalike" | "retargeting";
  memberCount: number;
  createdAt: Timestamp;
  lastSyncAt: Timestamp | null;
}

export interface TokenRefresh {
  service: "meta" | "google" | "other";
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Timestamp;
  lastRefreshedAt: Timestamp;
  refreshAttempts: number;
  lastError: string | null;
}

// =============================================================================
// Alerts
// =============================================================================

export interface Alert {
  userId: string;
  type: "hot_lead" | "high_engagement" | "rvm_callback" | "token_refreshed" | "token_refresh_failed" | "health_check_failed";
  leadId?: string;
  title: string;
  message: string;
  preview?: string;
  read: boolean;
  createdAt: Timestamp;
}

// =============================================================================
// DNC
// =============================================================================

export interface DncEntry {
  phoneHash: string;
  source: "federal" | "state" | "internal" | "complaint";
  addedAt: Timestamp;
  expiresAt: Timestamp | null;
  reason: string | null;
}

// =============================================================================
// Webhook Events
// =============================================================================

export interface WebhookEvent {
  source: "sendgrid" | "meta" | "slybroadcast";
  eventType: string;
  payload: Record<string, unknown>;
  receivedAt: Timestamp;
  processedAt: Timestamp | null;
  error: string | null;
}
