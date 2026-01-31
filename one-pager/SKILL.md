# One-Pager Engineering Proposal Skill

## Overview

This skill guides engineers through the process of creating a compelling one-pager proposal using the Heilmeier Catechism framework. The goal is not to immediately produce a document, but to **thoroughly understand the problem space first**, then distill that understanding into a single page that earns every word.

A one-pager is a thinking tool, not a template. The constraint is the feature.

## When to Use This Skill

Use this skill when an engineer needs to:
- Get buy-in for a technical change or new approach
- Align stakeholders before writing an RFC or design doc
- Move a Slack debate toward a decision
- Propose a solution to an operational issue
- Justify resource allocation for a project

## Two Modes

### 1. Draft Mode (No existing document)
Guide the user through a structured interview to collect all necessary information, explore the codebase, and build supporting documents before distilling into a one-pager.

### 2. Critique Mode (Existing document)
Analyze an existing one-pager, identify gaps and weaknesses, and guide the user through targeted questions to strengthen it.

---

## The Heilmeier Catechism

This skill uses the Heilmeier Catechism as its primary framework. Developed by former DARPA director George Heilmeier, these eight questions force clarity:

1. **What are you trying to do?** Articulate objectives using absolutely no jargon.
2. **How is it done today, and what are the limits of current practice?**
3. **What is new in your approach and why do you think it will be successful?**
4. **Who cares? If you are successful, what difference will it make?**
5. **What are the risks?**
6. **How much will it cost?** (time, money, resources, opportunity cost)
7. **How long will it take?**
8. **What are the midterm and final "exams" to check for success?**

---

## Draft Mode: The Interview Process

### Phase 0: Setup

Create a working directory for this proposal:
```
{project-root}/.one-pager/
├── 00-meta.md              # Proposal metadata and status
├── interview/              # Raw interview notes
├── analysis/               # Code exploration and data
├── drafts/                 # Iteration on the one-pager
└── final/                  # Final one-pager + appendix
```

Ask the user:
- What is the working title for this proposal?
- Who is the intended audience? (their manager, a VP, a cross-functional group, their team)
- What decision are you hoping to drive?

### Phase 1: The Problem (Heilmeier Q1 & Q2)

**Goal:** Understand what the user is trying to do and why the current state is inadequate.

**Questions to ask:**
- In plain English, what are you trying to accomplish? (No jargon—imagine explaining to a smart person outside your team)
- What pain exists today? Who feels it?
- How is this currently handled? What's the workaround?
- Why is now the right time to address this?

**Code exploration tasks:**
- If relevant, explore the codebase to understand the current implementation
- Identify the specific files, systems, or patterns that are causing pain
- Quantify the problem if possible (error rates, latency, developer time wasted, etc.)

**Red flags to probe:**
- If the user leads with a solution, push back: "What problem does this solve?"
- If the problem sounds vague, ask for a specific recent example
- If there's no data, ask: "How do we know this is actually a problem?"

**Output:** Save notes to `interview/01-problem.md`

### Phase 2: The Landscape (Heilmeier Q2 continued)

**Goal:** Map the current state comprehensively.

**Questions to ask:**
- What solutions already exist (internal or external)?
- Why haven't those solutions been adopted or why aren't they working?
- What constraints exist? (technical debt, compliance, team expertise, dependencies)
- Who are the stakeholders? Who needs to approve this? Who will be impacted?

**Code exploration tasks:**
- Document the current architecture relevant to this problem
- Identify dependencies and integration points
- Note any existing attempts to solve this problem (dead code, abandoned branches, etc.)

**Output:** Save notes to `interview/02-landscape.md` and any architectural diagrams to `analysis/`

### Phase 3: The Proposal (Heilmeier Q3)

**Goal:** Articulate what's new and why it will work.

**Questions to ask:**
- What is your proposed approach?
- What's new or different about this compared to existing solutions?
- Why do you believe this will succeed where other approaches haven't?
- What assumptions are you making? (List them explicitly)

**Code exploration tasks:**
- If a proof-of-concept exists, examine it
- Identify similar patterns in the codebase that succeeded or failed
- Assess technical feasibility

**Push back on:**
- "Best practice" justifications without context
- Solutions that seem more interesting than necessary
- Missing explanation of why alternatives were rejected

**Output:** Save notes to `interview/03-proposal.md`

### Phase 4: Alternatives Analysis (Heilmeier Q3 continued)

**Goal:** Demonstrate that other options were genuinely considered.

**Questions to ask:**
- What other approaches did you consider?
- For each alternative: Why was it rejected?
- What would have to be true for one of those alternatives to be the right choice?
- Is "do nothing" a viable option? What happens if we don't act?

**Framework for each alternative:**
```
Alternative: [Name]
Description: [1-2 sentences]
Pros: [List]
Cons: [List]
Why rejected: [Specific reason]
```

**Output:** Save to `interview/04-alternatives.md`

### Phase 5: Impact & Stakeholders (Heilmeier Q4)

**Goal:** Establish who cares and what success looks like.

**Questions to ask:**
- If this succeeds, what changes? Be specific.
- Who benefits? (Users, developers, the business, operations)
- How will you measure success? What metrics will move?
- What does "done" look like?

**Quantify where possible:**
- Developer hours saved per week/month
- Latency/performance improvements
- Error rate reductions
- User experience improvements
- Cost savings

**Output:** Save to `interview/05-impact.md`

### Phase 6: Risks (Heilmeier Q5)

**Goal:** Honestly assess what could go wrong.

**Questions to ask:**
- What are the technical risks?
- What are the organizational risks? (adoption, pushback, dependencies on other teams)
- What's the worst-case scenario if this fails?
- What's your mitigation strategy for each major risk?

**Framework:**
```
Risk: [Description]
Likelihood: [Low/Medium/High]
Impact: [Low/Medium/High]
Mitigation: [How you'll address it]
```

**Output:** Save to `interview/06-risks.md`

### Phase 7: Cost & Timeline (Heilmeier Q6 & Q7)

**Goal:** Be honest about resource requirements.

**Questions to ask:**
- What's the estimated effort? (engineer-weeks, not calendar time)
- What resources are needed? (people, infrastructure, budget)
- What's the opportunity cost? (What won't get done if we do this?)
- What's a realistic timeline? Break it into phases if helpful.
- Are there dependencies on other teams or external factors?

**Push back on:**
- Optimistic estimates without justification
- Missing infrastructure or tooling costs
- Ignored opportunity costs

**Output:** Save to `interview/07-cost-timeline.md`

### Phase 8: Success Criteria (Heilmeier Q8)

**Goal:** Define how we'll know if this worked.

**Questions to ask:**
- What are the midterm checkpoints? How will we know we're on track?
- What's the final success criterion?
- How long after launch until we can evaluate success?
- What would cause us to abandon this approach?

**Output:** Save to `interview/08-success-criteria.md`

### Phase 9: Synthesis & Distillation

**Goal:** Compress everything into a one-pager + appendix.

**Process:**
1. Review all interview notes and analysis
2. Identify the core narrative arc: Problem → Why now → Proposal → Ask
3. Draft the one-pager (see structure below)
4. Move supporting detail to the appendix
5. Apply the "so what?" test to every sentence
6. Remove weasel words: "might," "could," "potentially," "some," "many"

**One-Pager Structure:**

```markdown
# [Title]: [Subtitle that captures the value proposition]

## TL;DR
[2-3 sentences: What's the problem, what's the recommendation, what's the ask]

## The Problem
[1-2 paragraphs: Current state, pain points, why this matters now. Include data.]

## Proposed Solution
[1-2 paragraphs: What you're proposing, why it will work, high-level approach]

## Alternatives Considered
[Brief: What else was considered and why it was rejected]

## Risks & Mitigations
[Brief: Top 2-3 risks and how you'll handle them]

## Cost & Timeline
[Specific: Resources needed, phases, timeline]

## Success Criteria
[Measurable: How we'll know it worked]

## The Ask
[Explicit: What decision or action you need from the reader]
```

**Appendix Structure:**
```markdown
# Appendix: [Title]

## A. Detailed Problem Analysis
[Expanded from interview/01-problem.md]

## B. Current State Architecture
[From analysis/, including diagrams]

## C. Full Alternatives Analysis
[From interview/04-alternatives.md]

## D. Risk Register
[Full risk table from interview/06-risks.md]

## E. Detailed Timeline & Milestones
[From interview/07-cost-timeline.md]

## F. Supporting Data & Evidence
[Any metrics, benchmarks, research]
```

**Output:** 
- `drafts/one-pager-v1.md`
- `drafts/appendix-v1.md`

---

## Critique Mode: Analyzing an Existing One-Pager

When the user provides an existing one-pager, analyze it against these criteria:

### Structural Analysis

- [ ] Has a clear TL;DR that states the problem, recommendation, and ask
- [ ] Problem statement comes before solution
- [ ] Problem is quantified with data
- [ ] Solution explains "why this will work," not just "what"
- [ ] Alternatives were genuinely considered (not strawmen)
- [ ] Risks are honest, not dismissed
- [ ] Cost is realistic and includes opportunity cost
- [ ] Success criteria are measurable
- [ ] Clear ask at the end

### Writing Quality Analysis

- [ ] Can a smart person outside the team understand it? (no unexplained jargon)
- [ ] No weasel words: "might," "could," "potentially," "many," "some"
- [ ] Every sentence passes the "so what?" test
- [ ] Written for the population, not a specific person who has context
- [ ] Recommendation is stated with conviction, not hedged
- [ ] Dense but readable (no unnecessary whitespace or fluff)

### Heilmeier Completeness Check

For each Heilmeier question, assess:
- Is it answered?
- Is the answer clear and specific?
- Is there supporting evidence?

Score each section: **Strong / Adequate / Weak / Missing**

### Critique Output Format

```markdown
# One-Pager Critique: [Title]

## Overall Assessment
[1-2 sentences: Is this ready? What's the biggest gap?]

## Heilmeier Scorecard

| Question | Score | Notes |
|----------|-------|-------|
| Q1: What are you trying to do? | [Score] | [Notes] |
| Q2: Current state & limits | [Score] | [Notes] |
| Q3: What's new & why it will work | [Score] | [Notes] |
| Q4: Who cares? | [Score] | [Notes] |
| Q5: Risks | [Score] | [Notes] |
| Q6: Cost | [Score] | [Notes] |
| Q7: Timeline | [Score] | [Notes] |
| Q8: Success criteria | [Score] | [Notes] |

## Section-by-Section Feedback

### TL;DR
[Feedback]

### Problem Statement
[Feedback]

[... etc for each section ...]

## Missing Information
[List of questions that need answers before this is ready]

## Recommended Next Steps
1. [Specific action]
2. [Specific action]
3. [Specific action]
```

### Targeted Interview for Gaps

After critique, offer to run a targeted interview to fill gaps:
- "Your problem statement is missing quantified impact. Can you tell me..."
- "The alternatives section feels like strawmen. What would have to be true for [Alternative X] to be the right choice?"
- "Your success criteria aren't measurable. What metric would move if this succeeds?"

---

## Anti-Patterns to Watch For

### Solution-First Thinking
**Symptom:** The user leads with technology or approach before explaining the problem.
**Response:** "Let's step back. What problem are you solving? Who feels this pain today?"

### Weasel Words
**Symptom:** "This could potentially improve performance for some users."
**Response:** "Let's be specific. How much improvement? Which users? Based on what evidence?"

### Missing "So What?"
**Symptom:** Statements of fact without implication.
**Response:** "That's interesting context, but why does it matter for this decision?"

### Strawman Alternatives
**Symptom:** Alternatives that are obviously worse than the proposal.
**Response:** "What would have to be true for [Alternative] to be the right choice?"

### Optimism Without Evidence
**Symptom:** "This should only take a few weeks."
**Response:** "What are you basing that on? What similar work has the team done?"

### No Ask
**Symptom:** Document ends without a clear request.
**Response:** "What specifically do you need from the reader? Approval? Feedback? Resources?"

---

## Code Exploration Guidelines

When exploring the codebase to support a one-pager:

### For Problem Understanding
- Find the code that implements the current solution
- Look for TODO comments, FIXME notes, or workarounds
- Check git history for related issues or attempted fixes
- Identify error handling patterns that indicate known problems

### For Solution Validation
- Assess if similar patterns exist elsewhere in the codebase
- Identify integration points and dependencies
- Estimate scope by counting affected files/modules
- Look for tests that would need updating

### For Risk Assessment
- Identify critical paths that would be affected
- Check for undocumented dependencies
- Look for areas with low test coverage
- Note any "here be dragons" comments

### Document Findings
Save code exploration notes to `analysis/` with:
- File paths examined
- Key findings
- Relevant code snippets (keep brief)
- Questions raised by the exploration

---

## Final Checklist Before Sharing

Before the one-pager is ready for review:

- [ ] TL;DR is 2-3 sentences max and captures the entire pitch
- [ ] A smart person outside the team could understand it
- [ ] Problem is quantified with actual data
- [ ] Solution explains WHY it will work, not just WHAT
- [ ] At least 2-3 real alternatives were considered
- [ ] Risks are honest (not "risks are minimal")
- [ ] Cost includes time, resources, AND opportunity cost
- [ ] Timeline has specific milestones
- [ ] Success criteria are measurable numbers
- [ ] The Ask is explicit and actionable
- [ ] No weasel words remain
- [ ] Every sentence passes the "so what?" test
- [ ] Appendix contains supporting detail, not fluff
- [ ] Total one-pager length is actually one page (dense, single-spaced)

---

## Invocation Examples

### Starting Fresh
```
User: I want to write a one-pager for migrating our auth system to OAuth 2.0

Claude: [Begins Phase 0, asks setup questions, then proceeds through interview]
```

### Critique Mode
```
User: Can you critique this one-pager? [attaches document]

Claude: [Runs structural analysis, Heilmeier scorecard, provides specific feedback]
```

### Resume Work
```
User: Let's continue working on the auth migration one-pager

Claude: [Reads existing files in .one-pager/, identifies where they left off]
```

---

## Remember

> "A one-pager without a recommendation is just a report. Can you read the document and still say 'So what?' If so, you've failed."

> "The great memos are written and re-written, shared with colleagues who are asked to improve the work, set aside for a couple of days, and then edited again with a fresh mind. They simply can't be done in a day or two."

> "Engineers who advance aren't necessarily the strongest coders—they're the ones who can communicate complex ideas simply."

The goal is not to fill out a template. The goal is to think so clearly about a problem that you can explain it—and your solution—in a single page that earns every word.
