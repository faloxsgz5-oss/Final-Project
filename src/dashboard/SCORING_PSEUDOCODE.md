# AI Dynamic Prioritization Scoring Pseudocode

```text
input: dashboard items, current time, scoring config

1. Build context
   - Find exams within config.thresholds.upcomingExamHours.
   - Find the highest wellbeing risk level.
   - Find finance categories where amountRemaining < 0.

2. Score each item
   - Start with baseUrgencyScore * config.weights.baseUrgency.
   - Add type severity from config.weights.typeSeverity.
   - Add time urgency for timed items:
     - very high when time remaining <= criticalHours
     - high when time remaining <= urgentHours
     - gradual exponential decay for later events
   - Add finance severity:
     - over budget gets strongest finance score
     - close to budget limit gets a medium finance score
   - Add wellbeing severity:
     - high wellbeing risk gets override score and must rank first
   - Penalize past items after config.thresholds.pastGraceMinutes.

3. Apply exam-day override
   - If any exam is within upcomingExamHours:
     - Set upcoming exam score to at least upcomingExamScoreFloor.
     - Set assignments related by subject to at least relatedAssignmentScoreFloor.
     - Hide non-essential note reminders and low-severity finance alerts.

4. Sort items
   - Sort by score descending.
   - If score ties, sort by event time ascending.
   - If still tied, sort by createdAt ascending.

5. Assign visibility
   - High-risk wellbeing alert is pinned.
   - Upcoming exam can be pinned.
   - Assign pinned/visible until displayCap is reached.
   - Everything else remains hidden but is returned for "see all".

output: prioritized items with score, visibility, reason, and raw data
```
