/**
 * Feature flags for enabling/disabling services
 * Set to false to disable a feature globally
 */
export const FEATURES = {
  // Core features (always on)
  LISTING_SYNC: true,
  SKIP_TRACE: true,

  // Outreach channels (disabled until configured)
  SENDGRID_EMAIL: false,
  META_ADS: false,
  SLYBROADCAST_RVM: false,

  // Compliance (disabled until configured)
  DNC_CHECK: false,
} as const;

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(feature: keyof typeof FEATURES): boolean {
  return FEATURES[feature];
}
