# SiS Project — Service & Subscription Cost Sheet
### Khaled International Schools — Student Information System
**Date:** April 14, 2026 | **Currency:** Saudi Riyals (SAR) | **FX Rate:** 1 USD = 3.75 SAR

---

## All Subscribed Services

| # | Service | Provider | What It Powers |
|---|---------|----------|---------------|
| 1 | Firebase (Blaze Plan) | Google | Hosting, Cloud Run SSR, Firestore DB, Auth, Storage |
| 2 | Gupshup WhatsApp API | Gupshup | WhatsApp message delivery (BSP layer) |
| 3 | Meta WhatsApp Business Platform | Meta | WhatsApp per-message charges (via Gupshup) |
| 4 | Google Gemini AI API | Google | AI Insights & AI Summary generation |
| 5 | Microsoft 365 (SMTP) | Microsoft | Email sending (smtp.office365.com) |
| 6 | Expo EAS | Expo | Mobile app builds (Android/iOS) |
| 7 | Google Play Developer | Google | Android app store listing |
| 8 | Apple Developer Program | Apple | iOS app store listing |

---

## 1. Firebase (Blaze Plan — Pay As You Go)

Firebase project: **sis-kis** | Region: **us-central1** | Function: **ssrsiskis** (512 MiB, 120s timeout)

### 1A. Firestore Database
*47 collections, ~2,632 families, ~50K+ documents total*

| Resource | Free Quota (Daily) | Unit Price (USD) | Unit Price (SAR) | Per |
|----------|--------------------|-----------------|-----------------|-----|
| Document Reads | 50,000/day (1.5M/mo) | $0.036 | 0.135 | per 100K reads |
| Document Writes | 20,000/day (600K/mo) | $0.108 | 0.405 | per 100K writes |
| Document Deletes | 20,000/day (600K/mo) | $0.012 | 0.045 | per 100K deletes |
| Storage | 1 GiB | $0.15 | 0.5625 | per GiB/month |

**Estimated monthly usage for KIS (school of ~2,632 families):**

| Usage Type | Est. Monthly Volume | Free Quota | Billable | Cost (SAR) |
|------------|-------------------|------------|----------|------------|
| Reads | ~3M | 1.5M | ~1.5M | 2.03 |
| Writes | ~200K | 600K | 0 (within free) | 0.00 |
| Deletes | ~10K | 600K | 0 (within free) | 0.00 |
| Storage | ~3 GiB | 1 GiB | 2 GiB | 1.13 |
| **Firestore Subtotal** | | | | **~SAR 3.16/mo** |

### 1B. Cloud Run (SSR Function — ssrsiskis)
*Every dashboard page load and API call invokes this function*

| Resource | Free Quota | Unit Price (USD) | Unit Price (SAR) | Per |
|----------|-----------|-----------------|-----------------|-----|
| Invocations | 2M/mo | $0.40 | 1.50 | per 1M invocations |
| CPU | 180K vCPU-sec/mo | $0.00002400 | 0.000090 | per vCPU-second |
| Memory | 360K GiB-sec/mo | $0.00000250 | 0.000009375 | per GiB-second |
| Network Egress | 1 GiB/mo | $0.12 | 0.45 | per GiB |

**Estimated monthly usage:**

| Usage Type | Est. Monthly Volume | Free Quota | Billable | Cost (SAR) |
|------------|-------------------|------------|----------|------------|
| Invocations | ~30K | 2M | 0 (within free) | 0.00 |
| CPU (1 vCPU × avg 0.5s × 30K) | ~15K vCPU-sec | 180K | 0 (within free) | 0.00 |
| Memory (0.5 GiB × avg 0.5s × 30K) | ~7.5K GiB-sec | 360K | 0 (within free) | 0.00 |
| Egress | ~5 GiB | 1 GiB free | 4 GiB | 1.80 |
| **Cloud Run Subtotal** | | | | **~SAR 1.80/mo** |

*Note: If usage grows (e.g. all parents/teachers actively using the portal daily), invocations could reach 100K+ and costs rise to ~SAR 15-40/mo.*

### 1C. Firebase Hosting
*Static assets, CDN delivery*

| Resource | Free Quota | Unit Price (SAR) | Per |
|----------|-----------|-----------------|-----|
| Storage | 10 GiB | 0.94 | per GiB/month |
| Data Transfer | 10 GiB/mo | 0.56 | per GiB |

**Estimated:** ~2 GiB stored, ~8 GiB transfer/mo → **Within free tier = SAR 0.00/mo**

### 1D. Firebase Authentication
*4 auth systems: Admin (Firebase Auth), Teacher (Firebase Auth), Parent (custom), Student (custom)*

| Resource | Free Quota | Unit Price |
|----------|-----------|-----------|
| Email/Password MAUs | 50,000/mo | Free up to 50K |
| Phone Auth (SMS) | — | Not used |

**Estimated:** ~100 active admin/teacher users → **Within free tier = SAR 0.00/mo**
*(Parent and Student auth use custom Firestore-based login, not Firebase Auth — no additional cost)*

### 1E. Cloud Storage
*PDFs, documents, receipts, images*

| Resource | Free Quota | Unit Price (SAR) | Per |
|----------|-----------|-----------------|-----|
| Storage | 5 GiB | 0.10 | per GiB/month |
| Downloads | 1.875M ops/mo | 0.19 | per 100K ops |
| Uploads | 225K ops/mo | 0.02 | per 10K ops |
| Egress | 30 GiB/mo | 0.45 | per GiB |

**Estimated:** ~1 GiB stored, ~5K downloads/mo → **Within free tier = SAR 0.00/mo**

### Firebase Total

| Component | Monthly Cost (SAR) |
|-----------|-------------------|
| Firestore | ~3.16 |
| Cloud Run (SSR) | ~1.80 |
| Hosting | 0.00 |
| Authentication | 0.00 |
| Cloud Storage | 0.00 |
| **Firebase Total** | **~SAR 5 – 15/mo** |

*With moderate school usage. Could rise to SAR 40-80 if all 2,632 families use the parent portal actively.*

---

## 2. Gupshup (WhatsApp Business Service Provider)

**Account:** kisapp | **Bot Number:** +966531403994 | **API:** api.gupshup.io

| Item | Cost |
|------|------|
| Platform Access | Free (Self-serve / Pay-per-use) |
| Per-message Markup | ~$0.001/msg (SAR 0.00375/msg) on top of Meta charges |
| Monthly Minimum | None |

*Gupshup acts as the BSP (Business Solution Provider) between your app and Meta's WhatsApp Cloud API. They add a small per-message markup on top of Meta's charges.*

---

## 3. Meta WhatsApp Business Platform (Per-Message Pricing)

**Effective:** April 1, 2026 (per-message model, replaced conversation-based pricing July 1, 2025)

### Saudi Arabia Rate Card (SAR Billing, +966 recipients)

| Message Type | Rate per Message (SAR) | When Charged |
|-------------|----------------------|--------------|
| **Marketing** template | ~0.3750 | Always charged on delivery |
| **Utility** template | ~0.0750 | Only outside customer service window |
| **Authentication** template | ~0.0675 | Always charged on delivery |
| **Non-template** messages (text, image, etc.) | **FREE** | Only within 24h customer service window |
| **Utility** template within service window | **FREE** | Within 24h of customer's last message |

### Key Pricing Rules (Your Bot Scenario)
1. **Parent messages the bot** → Opens a 24-hour customer service window → **No charge**
2. **Bot replies with `sendText()`** (non-template) → **FREE** (within service window)
3. **All bot interactions are FREE** because parents initiate and bot replies within the window
4. **Admin bulk sends** (template messages to all families) → **CHARGED per delivery**

### Monthly Cost Scenarios

**Scenario A: Bot Only (No Bulk Sends)**

| Activity | Volume | Rate (SAR) | Cost (SAR) |
|----------|--------|-----------|------------|
| Parent-initiated bot conversations | ~500/mo | 0.00 (free) | 0.00 |
| Bot replies (sendText) | ~1,500/mo | 0.00 (free) | 0.00 |
| Gupshup markup | ~2,000 msgs | 0.00375/msg | 7.50 |
| **Scenario A Total** | | | **~SAR 7.50/mo** |

**Scenario B: Bot + Monthly Bulk Notification (1 utility template to all families)**

| Activity | Volume | Rate (SAR) | Cost (SAR) |
|----------|--------|-----------|------------|
| Bot conversations (as above) | ~2,000 msgs | — | 7.50 |
| Utility template × 2,632 families × 2 phones | ~5,264 msgs | 0.0750/msg | 394.80 |
| Gupshup markup on templates | ~5,264 msgs | 0.00375/msg | 19.74 |
| **Scenario B Total** | | | **~SAR 422/mo** |

**Scenario C: Bot + Weekly Bulk Marketing (4 marketing templates/mo to all families)**

This is the **worst-case** scenario where the school sends **4 marketing-category template messages per month** (e.g. one every week) to **every family on both father and mother phones**.

**Why marketing templates are expensive:**
- Meta classifies promotional content (event invitations, open day announcements, enrollment campaigns, holiday greetings with branding) as **Marketing** — charged at **SAR 0.375/msg**
- That's **5× more expensive** than Utility templates (SAR 0.075/msg)
- Meta auto-reclassifies templates that look promotional even if you submit them as Utility

**What counts as Marketing vs Utility:**

| Marketing (SAR 0.375/msg) | Utility (SAR 0.075/msg) |
|---------------------------|------------------------|
| "Join our Open Day this Saturday!" | "Your child's report card is ready" |
| "Ramadan Kareem from KIS!" | "Fee payment reminder: SAR 5,000 due" |
| "Enroll now for 2026-27!" | "Your child was absent today" |
| "Summer camp registration open" | "Contact update: please verify your info" |
| Any message with promotional intent | Transactional/informational only |

**The math for Scenario C:**

| Step | Calculation | Result |
|------|------------|--------|
| Families | 2,632 families in Firestore | 2,632 |
| Phones per family | father_phone + mother_phone | × 2 = 5,264 phones |
| Sends per month | 1 template per week | × 4 = 4 campaigns |
| **Total messages/month** | 5,264 × 4 | **= 21,056 messages** |

| Cost Component | Volume | Rate | Cost (SAR) |
|----------------|--------|------|------------|
| Bot conversations (parent-initiated, free) | ~2,000 msgs | FREE | 0.00 |
| Gupshup markup on bot msgs | ~2,000 msgs | 0.00375/msg | 7.50 |
| **Meta fee:** Marketing templates delivered | 21,056 msgs | **0.3750/msg** | **7,896.00** |
| **Gupshup markup** on templates | 21,056 msgs | 0.00375/msg | 78.96 |
| **Firebase** (heavier load from webhook logs) | — | — | ~80.00 |
| **Gemini AI** (admin reports) | — | — | ~1.00 |
| **Apple Dev** (amortized annual) | — | — | ~31.00 |
| | | | |
| **Scenario C Total** | | | **~SAR 8,094/mo** |

**The single biggest line item: SAR 7,896 = Meta's charge for 21,056 marketing templates.**

### How to Drastically Reduce Scenario C Costs

| Strategy | Impact | New Monthly Cost |
|----------|--------|-----------------|
| **Send to 1 phone per family** (father only, not both) | -50% messages: 2,632 × 4 = 10,528 msgs | ~SAR 4,070 |
| **Send 2× per month** instead of 4× | -50% campaigns: 5,264 × 2 = 10,528 msgs | ~SAR 4,070 |
| **Target by school/class** (not all families) | E.g. 500 families = 1,000 phones × 4 | ~SAR 1,580 |
| **Use Utility templates** where possible | SAR 0.075 vs 0.375 (5× cheaper) | ~SAR 1,660 |
| **Combine all of the above** | 500 families × 1 phone × 2/mo × utility | **~SAR 120** |

**Bottom line:** The High scenario (SAR 8,094/mo) only happens if you intentionally send weekly marketing blasts to ALL 5,264 phone numbers. Most schools would realistically fall in the Moderate range (SAR 400-500/mo) with occasional utility notifications.

---

## 4. Google Gemini AI API

**Used by:** AI Insights page (`/api/ai-insights`) and AI Summary page (`/api/ai-summary`)
**Model:** Gemini via REST API | **Key:** `GOOGLE_AI_API_KEY`

| Tier | Limit | Cost |
|------|-------|------|
| Free Tier | 15 requests/minute, 1,500 requests/day | **FREE** |
| Pay-as-you-go (Gemini 1.5 Flash) | Unlimited | ~$0.075/1M input tokens, ~$0.30/1M output tokens |

**Estimated usage:** Admin generates ~20-50 AI reports/month → **Within free tier = SAR 0.00/mo**

*If usage exceeded free tier: ~50 reports × ~2K tokens each = ~100K tokens/mo → ~$0.01 = negligible*

---

## 5. Microsoft 365 (SMTP Email)

**Server:** smtp.office365.com:587 (STARTTLS) | **Used for:** System emails, notifications

| Item | Cost |
|------|------|
| Microsoft 365 Business Basic | ~SAR 22.50/user/month ($6/user/mo) |
| Microsoft 365 Business Standard | ~SAR 46.88/user/month ($12.50/user/mo) |

**Estimated:** 1 email account (noreply@school domain) → **~SAR 22.50 – 46.88/mo**

*This is likely already part of the school's existing Microsoft 365 subscription — no additional cost if so.*

---

## 6. Expo EAS (Mobile App Builds)

**Used for:** Building Android APK/AAB for the mobile app (React Native/Expo)

| Plan | Builds/Month | Cost |
|------|-------------|------|
| **Free** | 15 builds | **FREE** |
| Production ($49/mo) | 100 builds | SAR 183.75/mo |

**Estimated:** ~2-4 builds/month → **Within free tier = SAR 0.00/mo**

---

## 7. Google Play Developer Account

**Used for:** Publishing KiS-SiS Android app (com.kis.sis)

| Item | Cost |
|------|------|
| Registration Fee | **SAR 93.75 (one-time)** ($25 USD) |
| Annual Fee | None (one-time only) |

---

## 8. Apple Developer Program

**Used for:** Publishing KiS-SiS iOS app (com.kis.sis)

| Item | Cost |
|------|------|
| Annual Membership | **SAR 374.00/year** ($99 USD/year) |

---

## Monthly Cost Summary

### YOUR Fixed Costs (What You Must Cover in the Selling Price)

These are the costs YOU bear to keep the system running — regardless of how much WhatsApp the school uses.

| # | Cost Item | Monthly (SAR) | Annual (SAR) | Notes |
|---|-----------|--------------|-------------|-------|
| 1 | **Firebase Firestore** (reads beyond free tier) | ~3 – 15 | ~36 – 180 | 47 collections, grows with portal traffic |
| 2 | **Firebase Cloud Run** (SSR function) | ~2 – 40 | ~24 – 480 | Every page load = 1 invocation |
| 3 | **Firebase Hosting** (CDN, static assets) | 0 | 0 | Within free 10 GiB tier |
| 4 | **Firebase Auth** | 0 | 0 | Within free 50K MAU tier |
| 5 | **Firebase Cloud Storage** | 0 | 0 | Within free 5 GiB tier |
| 6 | **Google Gemini AI API** | 0 | 0 | Within free 1,500 req/day tier |
| 7 | **Expo EAS** (mobile builds) | 0 | 0 | Within free 15 builds/mo tier |
| 8 | **Apple Developer Program** | ~31 | 374 | Annual renewal ($99/year) |
| 9 | **Google Play Developer** | 0 | 0 | One-time SAR 93.75 already paid |
| 10 | **Microsoft 365 SMTP** | 0 | 0 | School's existing subscription |
| | | | | |
| | **YOUR TOTAL FIXED COST** | **~SAR 36 – 86/mo** | **~SAR 434 – 1,034/yr** | |

### School's Variable Cost (Pass-Through — School Recharges Gupshup Wallet)

WhatsApp messaging costs are **100% pass-through**. The school recharges their Gupshup wallet balance when they want to send bulk templates. Bot replies are free.

| Activity | Who Pays | Cost |
|----------|----------|------|
| Bot conversations (parent-initiated) | Nobody — FREE | SAR 0 |
| Bot replies (sendText) | Nobody — FREE | SAR 0 |
| Admin sends utility template (1 blast to all) | School wallet | ~SAR 415/blast |
| Admin sends marketing template (1 blast to all) | School wallet | ~SAR 1,994/blast |
| Per-message Gupshup markup | School wallet | ~SAR 0.004/msg |

*School controls their own spend. No surprise bills for you.*

---

## Pricing Guide (For Setting Your Selling Price)

### Step 1: Your Actual Annual Base Cost

| Item | Annual (SAR) |
|------|-------------|
| Firebase (Firestore + Cloud Run, moderate usage) | ~600 |
| Apple Developer renewal | 374 |
| **Your annual infrastructure cost** | **~SAR 974** |

### Step 2: Hidden Costs to Factor In

| Item | Value (SAR) | Basis |
|------|------------|-------|
| **Your time — maintenance & support** | 12,000 – 24,000/yr | ~2-4 hrs/week × SAR 100-125/hr |
| **Your time — updates & new features** | 6,000 – 18,000/yr | ~1-3 hrs/week for bug fixes, school requests |
| **Data sync runs** (SQL Server → Firestore) | 3,000 – 6,000/yr | Each term you run extraction scripts |
| **Deployment & monitoring** | 2,000 – 4,000/yr | Deploys, log checking, incident response |
| **Domain name** (if custom domain needed) | 150 – 300/yr | e.g., sis.kis.edu.sa |
| | | |
| **Total hidden costs** | **~SAR 23,150 – 52,300/yr** | |

### Step 3: Suggested Pricing Models

**Option A: Annual License + Support**

| Component | Annual (SAR) |
|-----------|-------------|
| Infrastructure cost | ~1,000 |
| Your time (maintenance + support) | ~18,000 |
| Profit margin (30%) | ~5,700 |
| **Annual license fee to school** | **~SAR 25,000/yr** |
| WhatsApp messaging | Pass-through (school's wallet) |

**Option B: Monthly SaaS Subscription**

| Component | Monthly (SAR) |
|-----------|--------------|
| Infrastructure cost | ~82 |
| Your time (maintenance + support) | ~1,500 |
| Profit margin (30%) | ~475 |
| **Monthly fee to school** | **~SAR 2,000/mo** |
| WhatsApp messaging | Pass-through (school's wallet) |

**Option C: One-Time Sale + Annual Maintenance**

| Component | Cost (SAR) |
|-----------|-----------|
| **One-time license** (project value) | 100,000 – 150,000 |
| **Annual maintenance contract** (15-20% of license) | 15,000 – 30,000/yr |
| Infrastructure (included in maintenance) | — |
| WhatsApp messaging | Pass-through (school's wallet) |

### Step 4: What to Tell the School About WhatsApp Costs

> "The WhatsApp bot is **free** for parents — they message and get instant replies at zero cost.
>
> For **bulk notifications** (fee reminders, report cards, announcements), the school maintains a prepaid Gupshup wallet. You recharge it when needed:
> - **Utility notification** to all families: ~**SAR 415** per blast
> - **Marketing campaign** to all families: ~**SAR 1,994** per blast
> - Targeted sends (one class/school) cost proportionally less
>
> This is a direct Meta/Gupshup charge — not our fee."

---

## Annual Cost Projection (Your Costs Only — Excluding WhatsApp Pass-Through)

| Scenario | Monthly (SAR) | Annual (SAR) |
|----------|--------------|-------------|
| **Light usage** (few portal users) | ~36 | ~434 |
| **Moderate** (active portal + mobile app) | ~55 | ~660 |
| **Heavy** (all parents/teachers daily) | ~86 | ~1,034 |

*WhatsApp bulk messaging is excluded — that's the school's direct expense via their Gupshup wallet.*

---

## One-Time Costs (Already Incurred)

| Item | Cost (SAR) | Status |
|------|-----------|--------|
| Google Play Developer registration | 93.75 | Paid |
| Apple Developer first year | 374.00 | Paid (renews annually) |
| **Total One-Time** | **SAR 467.75** | |

---

## Cost Comparison vs. Alternatives

To justify your pricing, here's what similar school systems cost in Saudi market:

| Solution | Annual Cost (SAR) | Includes WhatsApp? |
|----------|-------------------|-------------------|
| **Classera** (Saudi EdTech SaaS) | 50,000 – 150,000/yr | No |
| **Skolera** / **Mashreq Education** | 30,000 – 80,000/yr | No |
| **Custom development** (agency quote) | 200,000 – 500,000 build + 40,000+/yr maintenance | Usually not |
| **QuickWorks** (WhatsApp only, no SIS) | ~12,000 – 24,000/yr | Yes but limited |
| **Your SiS** (full platform + bot) | Your price | Yes — built in |

**Your competitive advantage:** Full SIS + WhatsApp bot + Mobile app + AI insights — all in one platform. Most competitors charge separately for each module.

---

## What's Completely Free

| Service | Why Free |
|---------|---------|
| Firebase Auth | <50K MAUs (school has ~100 admin/teacher) |
| Firebase Hosting storage + CDN | <10 GiB (school uses ~2 GiB) |
| Cloud Storage | <5 GiB stored (school uses ~1 GiB) |
| WhatsApp Bot replies | Non-template messages within 24h service window |
| Utility templates (within bot conversation) | Free within customer service window |
| Google Gemini AI | Free tier: 1,500 requests/day (school uses ~2/day) |
| Expo EAS builds | Free tier: 15 builds/month (school uses ~3) |
| Firestore Writes | Free quota: 600K/mo (school uses ~200K) |
| Firestore Deletes | Free quota: 600K/mo (school uses ~10K) |

---

## Cost Reduction Tips

1. **WhatsApp is the biggest variable cost** — Marketing templates at SAR 0.375/msg add up fast. Use utility templates (SAR 0.075) where possible, or better yet, encourage parents to initiate conversations so bot replies are free.
2. **Avoid bulk marketing templates** — One marketing blast to all families costs ~SAR 1,974 per send. Consider sending only to targeted groups (by class, by school) rather than all 2,632 families.
3. **Utility within service window = FREE** — If a parent has messaged the bot within 24 hours, ANY follow-up message (including utility templates) is free.
4. **Firebase will stay cheap** — At the school's scale (~2,632 families, ~100 staff), Firebase costs stay well under SAR 100/month even with heavy use.
5. **No domain cost** — Using Firebase's free `sis-kis.web.app` domain. Custom domain (e.g., sis.kis.edu.sa) would only cost hosting DNS changes, no additional Firebase charge.

---

## Notes

1. **USD → SAR:** Converted at 3.75 SAR/USD. Firebase and Google billed in USD.
2. **Meta WhatsApp rates:** Saudi Arabia SAR rates effective April 1, 2026. Meta may update rates quarterly (Jan/Apr/Jul/Oct).
3. **Gupshup markup:** Approximate $0.001/msg based on standard self-serve tier. Exact markup depends on your Gupshup contract.
4. **Microsoft 365:** Assumed already part of school's existing IT subscription. If not, add ~SAR 22.50-46.88/mo per email account.
5. **Firebase Blaze Plan:** No monthly minimum. You only pay for what you use beyond free quotas. There's no downgrade risk — if usage drops, costs drop.
6. **All prices exclude VAT** (15% Saudi VAT may apply to some services).
7. **WhatsApp is pass-through:** School recharges Gupshup wallet directly. You don't handle or mark up WhatsApp costs.
8. **Your time is your biggest cost** — infrastructure is nearly free at this scale. Price your time, not the cloud bills.
9. **Scaling to more schools:** If you sell to a second school, your infrastructure cost per school drops (shared Firebase project or separate project at same ~SAR 1,000/yr). Your time cost is the only thing that scales linearly.

---

## Quick Reference: Your Costs vs. School's Costs

| Who Pays | What | Amount |
|----------|------|--------|
| **YOU** | Firebase (hosting, database, functions) | ~SAR 36-86/mo |
| **YOU** | Apple Developer annual renewal | SAR 374/yr |
| **YOU** | Your maintenance/support time | Your rate × hours |
| **SCHOOL** | Gupshup wallet (bulk WhatsApp) | Per-blast, as needed |
| **SCHOOL** | Microsoft 365 (their existing SMTP) | Already paying |
| **NEITHER** | WhatsApp bot (parent-initiated) | FREE |
| **NEITHER** | Gemini AI, Expo EAS, Google Play | FREE tier |

---

*Prepared for Khaled International Schools — SiS Project — Selling Price Guide*
