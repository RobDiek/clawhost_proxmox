# Dashboard UX Redesign — 2026-03-30

## Goal
Transform dashboard from setup-focused to operations-focused.
Non-technical users need: approval queue, content calendar, clear notifications.

## New Structure

### Header
- Agent selector dropdown (hidden if only 1 agent)

### Column 1: עדכונים והמלצות (Notifications)
- Daily brief arrived
- Recommendations (add Google Calendar, upgrade plan, etc.)
- Warnings (API rate limits, balance low)

### Column 2: משימות פעילות (Approval Queue) — PRIORITY #1
- Live feed of agent tasks with statuses
- Statuses: ⏳ בביצוע → 👁 ממתין לאישור → ✅ אושר → 📤 פורסם
- Each expandable → content preview, media, approve/reject/edit buttons
- This replaces the dead "הכל מוגדר" section

### Content Calendar (replaces פעילות אחרונה)
- Weekly view by default
- Strategy tasks mapped to days
- Color-coded by status (planned/ready/published)
- Click → details + content preview

### Agent Settings (collapsed)
- Model, API keys, Telegram, integrations
- No metrics here — just config

## Implementation Order
1. Approval Queue (משימות פעילות)
2. Calendar view
3. Agent tabs
4. Remove פעילות אחרונה

## Design Rules
- Icons: same SVG style as sidebar menu
- Font: Arial/Arial Hebrew (no Google Fonts)
- RTL first
- Colors: existing design system
