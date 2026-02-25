# Workflow & Task Management

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Review lessons at session start

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- Skip this for simple, obvious fixes — don't over-engineer

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it
- Point at logs, errors, failing tests → then resolve them
- Zero context switching required from the user

---

## Task Management

1. **Plan First** — Write plan to Claude's plan file with checkable items
2. **Verify Plan** — Check in before starting implementation
3. **Track Progress** — Mark items complete as you go (TodoWrite tool)
4. **Explain Changes** — High-level summary at each step
5. **Update State** — Update `tasks/state.md` after every session
6. **Capture Lessons** — Update `tasks/lessons.md` after corrections

---

## Session Start Checklist

At the start of every new conversation:
1. Read `tasks/state.md` — understand what was last done and what's next
2. Read `tasks/lessons.md` — avoid repeating past mistakes
3. Check current phase in CLAUDE.md — don't build ahead

## Session End Checklist

At the end of every session:
1. Update `tasks/state.md` with what was done, why, and what's next
2. Run `/claude-md-management:revise-claude-md` if CLAUDE.md needs updating
3. Keep CLAUDE.md under 200 lines — move details to `docs/`
