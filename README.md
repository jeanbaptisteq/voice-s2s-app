# French S2S Tutor (PT -> FR)

## Getting Started

```bash
cd "executions/french_s2s_app"
npm install
OPENAI_API_KEY=seu_token npm run dev
```

Open `http://localhost:3030` in your browser.

## Environment Variables

- `OPENAI_API_KEY`: OpenAI API key
- `REALTIME_MODEL`: realtime model (default: `gpt-4o-realtime-preview-2024-12-17`)
- `REALTIME_VOICE`: voice (default: `alloy`)
- `REALTIME_TRANSCRIBE_MODEL`: transcription model (default: `gpt-4o-mini-transcribe`)
- `PORT`: server port (default: `3030`)

## Where Data Lives

- Situations: `executions/french_s2s_app/data/situations.json`
- Conversations (logs): `.tmp/conversations/*.jsonl`

## Quick Adjustments

- Edit each situation prompt in the center panel and click "Save prompt".
- Click a prompt chip to send a quick idea during the conversation.
