import { defineSecret } from "firebase-functions/params";

// Data Provider
export const BATCHLEADS_API_KEY = defineSecret("BATCHLEADS_API_KEY");
export const BATCHLEADS_API_SECRET = defineSecret("BATCHLEADS_API_SECRET");
export const PROPSTREAM_API_KEY = defineSecret("PROPSTREAM_API_KEY");

// Email
export const SENDGRID_API_KEY = defineSecret("SENDGRID_API_KEY");
export const SENDGRID_WEBHOOK_SECRET = defineSecret("SENDGRID_WEBHOOK_SECRET");

// DNC Compliance
export const DNC_API_KEY = defineSecret("DNC_API_KEY");
export const DNC_API_SECRET = defineSecret("DNC_API_SECRET");

// Meta Ads
export const META_APP_ID = defineSecret("META_APP_ID");
export const META_APP_SECRET = defineSecret("META_APP_SECRET");

// RVM
export const SLYBROADCAST_UID = defineSecret("SLYBROADCAST_UID");
export const SLYBROADCAST_PASSWORD = defineSecret("SLYBROADCAST_PASSWORD");
