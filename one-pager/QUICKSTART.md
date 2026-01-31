# One-Pager Skill: Quick Start

## Starting a New One-Pager

```
Hey Claude, I want to create a one-pager for [brief description of what you're proposing]
```

Claude will:
1. Create a `.one-pager/` directory in your project
2. Ask you setup questions (title, audience, decision you're driving)
3. Guide you through the Heilmeier Catechism interview
4. Explore relevant code when needed
5. Build supporting documents along the way
6. Distill everything into a one-pager + appendix

### Example Prompts

- "I want to write a one-pager for migrating our auth system to OAuth 2.0"
- "Help me build a proposal for adding caching to our API layer"
- "I need to make the case for paying down tech debt in the payment service"
- "Let's create a one-pager for adopting TypeScript in our frontend"

---

## Getting a Critique

```
Hey Claude, can you critique this one-pager? [paste document or attach file]
```

Claude will:
1. Run structural analysis against the template
2. Score each Heilmeier question
3. Check for common red flags and anti-patterns
4. Provide specific, actionable feedback
5. Offer to run a targeted interview to fill gaps

### Example Prompts

- "Review this one-pager and tell me what's missing"
- "Is this ready to share with my manager?"
- "What questions will reviewers ask that I haven't addressed?"
- "Critique this draft - be harsh"

---

## Resuming Work

```
Hey Claude, let's continue working on the [title] one-pager
```

Claude will:
1. Read existing files in `.one-pager/`
2. Identify where you left off
3. Summarize what's been captured so far
4. Continue the interview or move to the next phase

---

## Quick Commands

| You Say | Claude Does |
|---------|-------------|
| "Let's start a one-pager" | Begins Phase 0 setup |
| "Critique this" | Runs full analysis |
| "What's missing?" | Identifies gaps in existing draft |
| "Make it shorter" | Helps compress to one page |
| "Check for weasel words" | Scans for vague language |
| "Show me the Heilmeier questions" | Displays the catechism |
| "Let's explore the codebase" | Investigates relevant code |
| "Summarize what we have" | Recaps current state |
| "Generate a draft" | Creates one-pager from interview notes |

---

## Directory Structure

After setup, your project will have:

```
your-project/
└── .one-pager/
    ├── 00-meta.md              # Title, audience, status
    ├── interview/
    │   ├── 01-problem.md       # Heilmeier Q1 & Q2
    │   ├── 02-landscape.md     # Current state, constraints
    │   ├── 03-proposal.md      # Heilmeier Q3
    │   ├── 04-alternatives.md  # Other options considered
    │   ├── 05-impact.md        # Heilmeier Q4
    │   ├── 06-risks.md         # Heilmeier Q5
    │   ├── 07-cost-timeline.md # Heilmeier Q6 & Q7
    │   └── 08-success.md       # Heilmeier Q8
    ├── analysis/
    │   └── [code exploration notes, diagrams]
    ├── drafts/
    │   ├── one-pager-v1.md
    │   └── appendix-v1.md
    └── final/
        ├── one-pager.md
        └── appendix.md
```

---

## Tips

### For Better Results

1. **Be honest about uncertainty** - It's okay to say "I don't know" during the interview. We'll figure it out together.

2. **Bring data** - The more specific you can be about the problem's impact, the stronger your one-pager will be.

3. **Expect iteration** - The first draft is never the final draft. Plan for 3-5 revisions.

4. **Think about your audience** - A one-pager for your team lead is different from one for a VP.

### For Code Exploration

When Claude explores your codebase, it helps to:
- Point to the specific files/directories that are relevant
- Mention any recent changes or failed attempts
- Share links to related tickets, PRs, or discussions

### For the Critique

When asking for feedback:
- Share the full document, not just excerpts
- Mention who will read it and what decision you need
- Tell Claude if you want gentle feedback or harsh truth
