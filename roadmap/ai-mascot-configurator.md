# AI Mascot for Configurator Steps

## Idea
Animated AI bot character that appears in the empty space below the component lists on each configurator step. The bot "speaks" through typewriter-effect text bubbles, guiding the user through the process.

## Behavior per Step

### Step 1: סוכנים (Agents)
- Bot appears idle, waving
- When user selects OpenClaw Personal: "בחירה מצוינת! העוזר האישי שלכם ידע לנהל יומן, לחפש מידע ולכתוב טיוטות."
- When user selects MATEH: "וואו, 9 סוכני שיווק! מחקר שוק, כתיבת תוכן, ניתוח מתחרים — הכל אוטומטי."
- When both selected: "שילוב מנצח! עוזר אישי + צוות שיווק שלם."
- If nothing selected: "בחרו לפחות סוכן אחד כדי להמשיך 👆"

### Step 2: אוטומציה (Automation)
- "n8n מתאים למי שאוהב גמישות מקסימלית. Activepieces — פשוט ואלגנטי. שניהם מצוינים!"
- When n8n selected: "n8n — בחירה של מפתחים. 400+ אינטגרציות מוכנות."
- When Activepieces selected: "Activepieces — ממשק נקי, קל להתחיל. מושלם!"

### Step 3: מודל AI
- "הסוכנים צריכים מוח. מפתח API שלכם = שליטה מלאה על העלויות."
- When Ollama selected: "Ollama = פרטיות מקסימלית. המודל רץ על השרת שלכם, בלי לשלוח נתונים החוצה."

### Step 4: תוספות (Addons)
- "גיבוי יומי — שקט נפשי ב-₪19 לחודש. מומלץ!"
- When backup selected: "👍 בחירה חכמה. 7 ימי היסטוריה + שחזור בלחיצה."
- When storage selected: "אחסון נוסף — מושלם אם יש הרבה מסמכים, תמונות או דאטה."

## Visual Design

### Character
- Simple SVG/CSS bot face (round head, eyes, small antenna)
- Minimalist style matching ClawFlow design (blues + grays)
- Size: ~100px wide
- Position: bottom-right of the empty space, or centered below components

### Speech Bubble
- Rounded rectangle, white background, subtle shadow
- Typewriter animation: text appears character by character (30ms per char)
- Fade-in when changing text
- Max 2-3 lines

### Animations
- Bot: subtle floating/bobbing animation (CSS keyframes)
- Eyes: occasional blink (every 3-5 seconds)
- When "speaking": mouth/indicator animates
- When user makes selection: brief excited bounce

### States
1. **Idle**: gentle float, occasional blink
2. **Speaking**: typewriter text + mouth indicator
3. **Excited**: quick bounce when user selects something
4. **Waiting**: looking up at the components (when nothing selected)

## Technical

- Pure CSS + vanilla JS (no libraries)
- Inline SVG for the bot character
- Integration with existing configurator step change events
- Listen to component checkbox changes to trigger contextual messages
- Responsive: hide on very small screens or show smaller version

## Files to modify
- `apps/web/public/index.html` — add mascot HTML/CSS/JS to configurator section

## Priority
Nice-to-have for launch, but strong UX differentiator. Can implement after core bugs are resolved.
