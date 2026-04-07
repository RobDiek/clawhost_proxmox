# Multi-Agent Dashboard — Per-Agent Views

## Problem
When user has multiple agents (e.g. OpenClaw Personal + MATEH + Bare), the dashboard shows a flat list. Each agent needs its own dedicated dashboard view with agent-specific features.

## Solution

### Agent Switcher (Header)
- Dropdown/tabs in header or sidebar showing all installed agents
- Current active agent highlighted
- Quick-switch between agents
- Each switch reloads the dashboard content for that agent type

### Per-Agent Dashboard Views

#### OpenClaw Personal (oc)
- Chat (embedded OpenClaw)
- Calendar (morning summary schedule)
- Integrations relevant to personal (Google Calendar, Telegram)
- Simple task list

#### MATEH Marketing Agent (mt)
- Full marketing dashboard: Daily Brief, Research, Strategy
- Content calendar with scheduled posts
- Sub-agent grid (9 agents with model selector)
- Publishing channels (WordPress, Meta, Newsletter)
- Research & Strategy panels
- Approval queue for agent outputs

#### Bare Agent (bare)
- File manager (prominent)
- Terminal/Console access
- Minimal UI — for developers
- No pre-configured panels

### Technical Implementation

#### Option A: Tab-based (simpler)
- Add agent tabs above main content
- Each tab click shows/hides relevant sections
- State stored in localStorage

#### Option B: Sub-routing (cleaner)
- URL: /dashboard?agent=mt or /dashboard?agent=oc
- Each agent type renders different component set
- Shared sidebar, different main content

### Data Flow
- `instanceData.selectedComponents` → list of agents
- For each agent: show relevant sections only
- Agent detail view already exists — extend it to be the "dashboard" for that agent
- Home tab shows summary cards for ALL agents

### Files to modify
- dashboard.html: agent switcher UI, conditional rendering per type
- Home tab: multi-agent summary cards
- Agents tab: becomes the per-agent dashboard
- Chat tab: needs agent selector if multiple agents have chat

### Priority
HIGH — core UX for multi-agent users. Should be done before marketing launch to differentiate from single-agent competitors.
