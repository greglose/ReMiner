/**
 * REMiner - Motivated Seller Outreach Platform
 * Cloud Functions Entry Point
 */

// =============================================================================
// Ingestion
// =============================================================================
export { syncListingsOrchestrator, syncListingsWorker } from "./ingestion/syncListings";
export { skipTraceNewLead } from "./ingestion/skipTrace";

// =============================================================================
// Email
// =============================================================================
export { processEmailSequences } from "./email/processSequence";
export { sendgridWebhook } from "./email/webhooks";
export { sendgridInboundParse } from "./email/inboundParse";
export { resetWarmupCounters } from "./email/warmup";

// =============================================================================
// Meta Ads
// =============================================================================
export { syncMetaAudiences } from "./meta/syncAudiences";
export { checkMetaTokenExpiration } from "./meta/tokenRefresh";

// =============================================================================
// RVM
// =============================================================================
export { processRVMDrops } from "./rvm/scheduleDrops";

// =============================================================================
// Orchestration & Alerts
// =============================================================================
export { handleHotLead } from "./orchestration/hotLeadAlerts";

// =============================================================================
// Compliance
// =============================================================================
export { handleUnsubscribe } from "./compliance/unsubscribe";

// =============================================================================
// Monitoring
// =============================================================================
export { dailyHealthCheck } from "./monitoring/healthCheck";
