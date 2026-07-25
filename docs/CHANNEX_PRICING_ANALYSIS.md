# Channex Pricing Analysis for Geeves

## Answer to Your Question

**Is Channex $130/month regardless of whether you're managing 3 properties or 1000?**

**Yes — the $130/month is a flat platform fee (the "WhiteLabel Plan")**, plus a small per-property cost:

| Component | Cost |
|---|---|
| Platform fee (WhiteLabel Plan) | $130/month flat |
| Per vacation rental unit | $0.50/month per unit |
| Per hotel property | $7/month per property |
| Setup fee | $0 |
| Staging/sandbox | Free |

### Your Scenario (3 Properties)

| Item | Monthly Cost |
|---|---|
| Platform fee | $130.00 |
| 3 vacation rental units × $0.50 | $1.50 |
| **Total** | **$131.50/month** |

### At Scale (1000 End-User Properties)

| Item | Monthly Cost |
|---|---|
| Platform fee | $130.00 |
| 1000 vacation rental units × $0.50 | $500.00 |
| **Total** | **$630/month** |
| Volume discounts available at 2000+ units | Negotiable |

### Key Insight: The $130 Is the Same Either Way

The $130 is the **WhiteLabel/API access fee** — it's what you pay to use Channex as a platform provider (i.e., building Geeves on top of it). Whether you connect 3 properties or 3,000, the platform fee stays at $130. Only the per-property cost scales.

### Alternative: Standard Plan ($30/month)

There's also a **Standard Plan at $30/month** for individual property owners (not tech providers). However, this plan likely doesn't include:
- WhiteLabel/API access for building your own product on top
- The ability to manage properties on behalf of other users
- Custom branding

For Geeves as a product, you'd need the WhiteLabel plan.

### Revenue Model for Geeves

If Geeves charges users $5–15/property/month for "Multi-Platform Sync":

| Scale | Geeves Revenue | Channex Cost | Margin |
|---|---|---|---|
| 3 properties (personal) | $15–45/mo | $131.50/mo | **-$86 to -$116** (loss) |
| 50 properties | $250–750/mo | $155/mo | **$95–595/mo profit** |
| 200 properties | $1,000–3,000/mo | $230/mo | **$770–2,770/mo profit** |
| 1000 properties | $5,000–15,000/mo | $630/mo | **$4,370–14,370/mo profit** |

### Recommendation

For your **personal use** (3 properties): The $131.50/month is expensive relative to the value. The platform export import + screenshot OCR approach we just built is more cost-effective for quarterly tax reconciliation.

For **Geeves as a commercial product**: Channex becomes profitable at ~10-25 properties (depending on your pricing). It's the right architectural choice for Phase 2 commercial tier.

**Suggested approach:** Use the free tier (iCal + email enrichment + platform export import) for your personal properties now. Build the Channex integration when you have 10+ beta users who would pay for it.
