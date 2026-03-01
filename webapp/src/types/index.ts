import { Timestamp } from "firebase/firestore";

export interface Lead {
  id: string;
  userId: string;
  listingId: string;
  propertyAddress: string;
  city: string;
  state: string;
  zip: string;
  ownerName: string;
  ownerEmail?: string;
  ownerPhone?: string;
  status: LeadStatus;
  emailSequenceStep: number;
  rvmSentAt?: Timestamp;
  addedToMetaAudience: boolean;
  emailBounced: boolean;
  emailUnsubscribed: boolean;
  onDncList: boolean;
  rvmBlockedByState: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type LeadStatus =
  | "new"
  | "contacted"
  | "replied"
  | "qualified"
  | "not_interested"
  | "converted";

export interface Config {
  id: string;
  userId: string;
  name: string;
  batchLeadsApiKey: string;
  sendgridApiKey: string;
  metaAccessToken?: string;
  metaAdAccountId?: string;
  slybroadcastApiKey?: string;
  emailFromAddress: string;
  emailFromName: string;
  companyName: string;
  companyAddress: string;
  emailSequences: EmailSequence[];
  rvmBlockedStates: string[];
  syncEnabled: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface EmailSequence {
  step: number;
  subject: string;
  bodyTemplate: string;
  delayDays: number;
}

export interface OutreachLog {
  id: string;
  userId: string;
  leadId: string;
  channel: "email" | "meta" | "rvm";
  action: string;
  details?: Record<string, unknown>;
  timestamp: Timestamp;
}

export interface Alert {
  id: string;
  userId: string;
  type: "error" | "warning" | "info" | "success";
  title: string;
  message: string;
  read: boolean;
  createdAt: Timestamp;
}

export interface DashboardStats {
  totalLeads: number;
  newLeads: number;
  contacted: number;
  replied: number;
  qualified: number;
  converted: number;
  emailsSent: number;
  emailsOpened: number;
  emailsClicked: number;
  rvmsSent: number;
  metaAudienceSize: number;
}

export interface WarmupStatus {
  configId: string;
  currentDay: number;
  dailyLimit: number;
  sentToday: number;
  bounceRate: number;
  isPaused: boolean;
}
