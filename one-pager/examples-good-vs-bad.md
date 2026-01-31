# One-Pager Examples: Good vs. Bad

This document illustrates the difference between weak and strong one-pagers using the same underlying proposal.

---

## The Scenario

An engineer wants to propose adding a caching layer to reduce database load.

---

## ❌ BAD Example

### Proposal: Add Redis Caching

**Summary**

We should add Redis to our stack. Redis is an in-memory data store that can significantly improve performance. Many companies use Redis including Twitter, GitHub, and Pinterest. It could potentially help with our database issues.

**Background**

Our database has been slow lately. Users have complained. We think caching would help.

**Proposed Solution**

We will add Redis and cache frequently accessed data. This is a best practice for scaling applications. We'll use the Redis client library and add caching to our API endpoints.

**Alternatives**

- We could do nothing, but that's not a good option
- We could upgrade our database, but that's expensive
- We could optimize queries, but that takes too long

**Risks**

Risks are minimal. Redis is battle-tested and widely used.

**Timeline**

A few weeks.

**Next Steps**

Let us know what you think.

---

### Why It's Bad

| Issue | Problem |
|-------|---------|
| Weasel words | "significantly," "could potentially," "many companies" |
| Solution-first | Leads with Redis, not the problem |
| No data | "slow lately," "users have complained" - how slow? how many users? |
| Strawman alternatives | "do nothing" and "too expensive" aren't real analysis |
| Dismissed risks | "Risks are minimal" shows lack of thought |
| Vague timeline | "A few weeks" means nothing |
| No ask | "Let us know what you think" is not a decision |
| Appeal to authority | "Twitter uses it" is not a reason |

---

## ✅ GOOD Example

### Reduce API Latency by 60% with Response Caching

**Author:** Jane Smith  
**Date:** January 31, 2026  
**Status:** Draft  
**Reviewers:** [Tech Lead], [Engineering Manager]

---

**TL;DR**

Our API P95 latency has increased from 200ms to 800ms over the past quarter, causing a 12% drop in conversion rate on the checkout flow. I propose adding a Redis caching layer for our product catalog and user preference data, which our load testing shows will reduce P95 latency to under 300ms. I'm requesting approval to allocate 2 engineers for 4 weeks to implement this.

---

**The Problem**

Our API latency is degrading as we scale:

- **P95 latency:** 200ms → 800ms (4x increase since Q3)
- **Database CPU:** averaging 78%, spiking to 95% during peak hours
- **Checkout conversion:** dropped from 3.2% to 2.8% (12% decrease)
- **User complaints:** 47 support tickets mentioning "slow" or "timeout" in January alone

The root cause is repeated, identical database queries. Our product catalog endpoints alone account for 2.3M queries/day, with 89% being duplicate reads of unchanged data. Each pageview on our product listing page triggers 12-15 database queries, most of which return the same results within any 5-minute window.

This matters now because we're entering our peak season (March-May), and current trajectory suggests we'll hit database saturation before April.

---

**Proposed Solution**

Add a Redis caching layer for read-heavy, infrequently-changing data:

1. **Product catalog data** (changes ~2x daily): Cache with 5-minute TTL
2. **User preferences** (changes on explicit action): Cache with invalidation on write
3. **Category listings** (changes ~1x weekly): Cache with 1-hour TTL

Why this will work: Our load test environment shows this configuration reduces database queries by 73% and brings P95 latency to 280ms. The cache hit rate in testing was 91% for product data and 87% for user preferences.

We'll implement cache-aside pattern with explicit invalidation, avoiding the complexity of write-through caching. Redis Cluster will provide redundancy; cache misses gracefully fall back to database queries.

---

**Alternatives Considered**

**Database vertical scaling (+$2,400/mo):** Would provide ~40% headroom but doesn't address the fundamental inefficiency. We'd face this same problem in 6 months at current growth rate.

**Query optimization:** We've already done the easy wins (added indexes, fixed N+1 queries in Q4). Remaining queries are fundamentally required; the issue is volume, not efficiency.

**CDN caching:** Considered for static assets but doesn't help with personalized/authenticated API responses, which are 78% of our traffic.

**Do nothing:** Database saturation projected for April based on current growth. Peak season would be severely impacted.

---

**Risks & Mitigations**

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Cache stampede on invalidation | Medium | High | Implement staggered TTLs and request coalescing |
| Stale data shown to users | Medium | Medium | Conservative TTLs + explicit invalidation for price/inventory |
| Redis becomes single point of failure | Low | High | Redis Cluster with 3 nodes + graceful degradation to DB |

---

**Cost & Timeline**

**Effort:** 8 engineer-weeks (2 engineers × 4 weeks)

**Resources:**
- Redis Cluster (3 nodes): $180/month
- 2 engineers from Platform team

**Opportunity cost:** Delays the admin dashboard redesign by 4 weeks

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Phase 1: Infrastructure | Week 1-2 | Redis cluster deployed, monitoring configured |
| Phase 2: Product caching | Week 2-3 | Product catalog cached, 50% traffic migrated |
| Phase 3: Full rollout | Week 3-4 | All targeted endpoints cached, 100% traffic |

---

**Success Criteria**

**Midterm (Week 2):** 
- Redis cluster healthy with <10ms P95 read latency
- Product endpoint P95 reduced to <400ms on 50% traffic

**Final (Week 4):**
- API P95 latency ≤300ms
- Database CPU ≤50% at peak
- Cache hit rate ≥85%

**Evaluation (Week 8):**
- Checkout conversion rate recovers to ≥3.0%

---

**The Ask**

- [ ] Approve allocation of 2 Platform engineers for 4 weeks starting February 10
- [ ] Approve $180/month infrastructure cost increase
- [ ] Accept 4-week delay to admin dashboard redesign

Please provide feedback by February 5 so we can begin before peak season.

---

*See Appendix for: database query analysis, load test methodology, Redis cluster architecture, and detailed risk mitigation playbooks.*

---

### Why It's Good

| Strength | How It's Demonstrated |
|----------|----------------------|
| Problem-first | Leads with latency data and business impact |
| Quantified pain | Specific numbers: 4x latency increase, 12% conversion drop |
| Clear mechanism | Explains WHY caching will work (89% duplicate queries) |
| Real alternatives | Each alternative has a genuine reason for rejection |
| Honest risks | Identifies real risks with specific mitigations |
| Specific timeline | Phased with concrete milestones |
| Measurable success | Specific numbers for each checkpoint |
| Explicit ask | Three specific decisions needed, with deadline |
| No weasel words | "will reduce" not "could potentially improve" |

---

## Side-by-Side Comparison

| Element | Bad Version | Good Version |
|---------|-------------|--------------|
| Opening | "We should add Redis" | "P95 latency increased 4x, causing 12% conversion drop" |
| Data | "slow lately" | "200ms → 800ms, 47 tickets, 78% CPU" |
| Why now | Not mentioned | "Database saturation projected for April" |
| Mechanism | "Best practice" | "89% duplicate queries, 91% cache hit in tests" |
| Alternatives | Strawmen | Real tradeoffs with numbers |
| Risks | "Minimal" | Specific risks with mitigation plans |
| Timeline | "A few weeks" | "4 weeks, 3 phases with milestones" |
| Ask | "Let us know" | "Approve 2 engineers, $180/mo, 4-week delay" |

---

## Key Takeaways

1. **Lead with the problem, not the solution** - The reader should understand why this matters before hearing about Redis.

2. **Quantify everything** - "Slow" means nothing. "4x latency increase causing 12% conversion drop" means everything.

3. **Explain the mechanism** - "Best practice" is not a reason. "89% of queries are duplicates" is.

4. **Steel-man alternatives** - If your alternatives are obviously bad, you haven't thought hard enough.

5. **Be honest about risks** - "Risks are minimal" destroys credibility. Specific risks with mitigations builds trust.

6. **Make a specific ask** - The reader should know exactly what decision you need from them.
