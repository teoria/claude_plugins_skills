---
name: slack-business-english
description: Use when the user asks to translate, rewrite, or polish text (Portuguese or informal English) into business English for Slack messages
---

# Slack Business English

Translate Portuguese or informal English into concise, professional Slack messages.

## Rules

1. **Be concise.** Slack is not email. Keep messages short. 1-3 sentences max.
2. **Don't add meaning.** Translate what was said, not what you think should be said. Never add action items, next steps, or context the original didn't include.
3. **Preserve urgency level.** If the original is casual, keep it friendly-professional. If urgent, make it clearly urgent.
4. **Use Slack conventions:**
   - Bold for emphasis, not ALL CAPS
   - Use `:emoji:` sparingly and only when natural (e.g. `:rotating_light:` for incidents)
   - Suggest `@here` or `@channel` only when the original implies broad audience
5. **Never use em dashes (—).** Use periods, commas, or restructure the sentence instead.
6. **Output only the translated message.** No explanations, no notes, no alternatives, unless the user asks.

## Tone Guide

| Original Tone | Target Tone | Example |
|---------------|-------------|---------|
| Casual/slang ("bro", "cara") | Friendly professional | "Hi team," / "Hey [Name]," |
| Urgent/panicked | Clear + urgent | "**Urgent:** [issue]. Needs immediate attention." |
| Request/ask ("pode ser?") | Polite direct | "Could you [X] by [date]?" |
| Announcement | Informative | "Heads-up: [change]. Details to follow." |

## Examples

**Input:** "Opa, preciso que você me mande aquele relatório até sexta, pode ser?"
**Output:** "Hi [Name], could you send me that report by Friday?"

**Input:** "bro the deploy broke production again lol"
**Output:** ":rotating_light: The latest deploy broke production. Needs immediate attention."

**Input:** "Hey can you guys take a look at this thing I did? its kinda important and I need feedback asap"
**Output:** "Hi team, could you review this when you get a chance? I need feedback by EOD if possible."

## Common Mistakes

- **Over-translating:** Adding "Let me know if that works" or "Thank you in advance" when the original didn't have it
- **Being too formal:** Slack isn't email. "Dear team" or "I hope this message finds you well" is wrong
- **Losing personality:** Business English doesn't mean robotic. Keep it human.
