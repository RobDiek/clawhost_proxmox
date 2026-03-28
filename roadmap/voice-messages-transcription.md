# Voice Messages Transcription (Telegram)

## Problem
Agent receives voice messages in Telegram but cannot transcribe them.
Responds with "אין לי כלי תמלול זמין".

## Solution Architecture

### Option A: OpenAI Whisper API (recommended)
- Telegram sends voice as .ogg file
- OpenClaw gateway receives → downloads .ogg
- Sends to OpenAI Whisper API → gets text
- Passes text to agent as regular message
- Cost: ~$0.006/min of audio

### Option B: Google Speech-to-Text
- Same flow but using Google Cloud Speech API
- Requires Google Cloud project (already have one for Calendar)
- Cost: ~$0.006/min

### Option C: Local Whisper (on VPS)
- Install whisper.cpp on VPS
- Process locally — no external API
- Requires ~2GB RAM
- Free but slower

## Implementation

### Step 1: Check if OpenClaw has built-in voice support
- Check `openclaw channels` for voice/transcription options
- Check if there's a skill for transcription

### Step 2: If not built-in
- Create middleware that intercepts voice messages
- Downloads .ogg from Telegram
- Sends to Whisper API
- Re-injects as text message

### Step 3: Hebrew support
- Whisper supports Hebrew natively
- Test accuracy with Israeli accent

## Priority: HIGH
Users expect to send voice messages in Telegram.
This is a basic UX expectation.

## Estimated: 0.5-1 day
