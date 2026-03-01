# REMiner - Motivated Seller Outreach Platform

Automated multi-channel outreach platform for real estate investors to connect with motivated sellers.

## Features

- **Lead Ingestion**: Automatically sync listings from BatchLeads API
- **Skip Tracing**: Get owner contact information (email, phone)
- **Email Campaigns**: Multi-step email sequences with personalization
- **Email Warmup**: Gradual sending increases for deliverability
- **Meta Ads**: Automatic Custom Audience integration
- **Ringless Voicemail**: Slybroadcast integration with state-law compliance
- **DNC Compliance**: Federal Do-Not-Call registry integration
- **Dashboard**: Real-time analytics and lead management

## Architecture

```
├── functions/          # Firebase Cloud Functions (TypeScript)
│   ├── src/
│   │   ├── api/        # External API clients
│   │   ├── email/      # Email sending & warmup
│   │   ├── ingestion/  # Lead ingestion & sync
│   │   ├── meta/       # Meta Marketing API
│   │   ├── rvm/        # Ringless voicemail
│   │   ├── orchestration/  # Workflow orchestration
│   │   ├── monitoring/     # Health checks & alerts
│   │   └── utils/      # Shared utilities
│   └── package.json
├── webapp/             # React Dashboard (Vite + TypeScript)
│   ├── src/
│   │   ├── components/ # Shared components
│   │   ├── pages/      # Page components
│   │   ├── hooks/      # React Query hooks
│   │   ├── stores/     # Zustand stores
│   │   └── types/      # TypeScript types
│   └── package.json
├── firestore.rules     # Security rules
├── firestore.indexes.json
└── firebase.json
```

## Prerequisites

- Node.js 18+
- Firebase CLI (`npm install -g firebase-tools`)
- Firebase project with Blaze plan (for Cloud Functions)

## Setup

### 1. Firebase Project

```bash
# Login to Firebase
firebase login

# Initialize project (select existing project or create new)
firebase use <your-project-id>
```

### 2. Configure Secrets

```bash
# Set required secrets
firebase functions:secrets:set BATCHLEADS_API_KEY
firebase functions:secrets:set SENDGRID_API_KEY
firebase functions:secrets:set DNC_API_KEY

# Optional secrets
firebase functions:secrets:set META_APP_SECRET
firebase functions:secrets:set SLYBROADCAST_API_KEY
firebase functions:secrets:set SENDGRID_WEBHOOK_SECRET
```

### 3. Create Cloud Tasks Queue

```bash
gcloud tasks queues create listing-sync-queue \
  --location=us-central1 \
  --max-concurrent-dispatches=10 \
  --max-dispatches-per-second=5
```

### 4. Install Dependencies

```bash
# Install functions dependencies
cd functions && npm install

# Install webapp dependencies
cd ../webapp && npm install
```

### 5. Configure Webapp

```bash
# Copy example env file
cp .env.example .env.local

# Edit with your Firebase config
vim .env.local
```

### 6. Deploy

```bash
# Deploy everything
firebase deploy

# Or deploy individually
firebase deploy --only functions
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
firebase deploy --only hosting
```

## Development

### Run Functions Emulator

```bash
cd functions
npm run build
firebase emulators:start
```

### Run Webapp Dev Server

```bash
cd webapp
npm run dev
```

## API Integrations

### BatchLeads
- Used for listing data and skip tracing
- API docs: https://batchleads.io/api

### SendGrid
- Transactional email sending
- Inbound Parse for reply detection
- Webhook events for tracking

### Meta Marketing API
- Custom Audience management
- Requires System User token with `ads_management` scope

### Slybroadcast
- Ringless voicemail delivery
- State-law compliant filtering built-in

## Compliance

- **CAN-SPAM**: All emails include physical address and unsubscribe link
- **TCPA**: RVMs blocked in FL and PA by default
- **DNC**: Federal Do-Not-Call registry integration
- **Data Privacy**: Per-user data isolation via Firestore rules

## Environment Variables

### Functions (Secrets)
| Name | Required | Description |
|------|----------|-------------|
| BATCHLEADS_API_KEY | Yes | BatchLeads API key |
| SENDGRID_API_KEY | Yes | SendGrid API key |
| DNC_API_KEY | Yes | DNC registry API key |
| META_APP_SECRET | No | Meta app secret for webhook verification |
| SLYBROADCAST_API_KEY | No | Slybroadcast API key |
| SENDGRID_WEBHOOK_SECRET | No | SendGrid webhook signing secret |

### Webapp (Vite)
| Name | Required | Description |
|------|----------|-------------|
| VITE_FIREBASE_API_KEY | Yes | Firebase web API key |
| VITE_FIREBASE_AUTH_DOMAIN | Yes | Firebase auth domain |
| VITE_FIREBASE_PROJECT_ID | Yes | Firebase project ID |
| VITE_FIREBASE_STORAGE_BUCKET | Yes | Firebase storage bucket |
| VITE_FIREBASE_MESSAGING_SENDER_ID | Yes | Firebase messaging sender ID |
| VITE_FIREBASE_APP_ID | Yes | Firebase app ID |
| VITE_USE_EMULATORS | No | Set to "true" for local development |

## License

Private - All rights reserved
