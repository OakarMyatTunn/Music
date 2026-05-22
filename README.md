# 🎬 LyricMotion

**Animated Music Video Generator** — Turn any song into a cinematic lyric video with AI-powered translation and live motion animation.

## Features

- 🎵 **Audio Input** — MP3 upload, YouTube embed, or SoundCloud embed
- ✨ **AI Translation** — Claude API translates lyrics with musical context (Myanmar, English, Chinese, Japanese, Korean, Thai)
- 🎨 **Live Canvas Animation** — Audio-reactive particles, waveform rings, vignette, cinematic color grading
- 🎬 **Background Video** — Mood-matched free stock videos via Pexels API
- ⏱ **Lyric Timing Editor** — Click-to-stamp or manual timestamp per line
- 📱 **Export** — Record canvas as WebM, merge audio in CapCut for final TikTok/YouTube video

## Getting Started

### 1. Clone & Install

```bash
git clone https://github.com/OakarMyatTunn/Music.git
cd Music
npm install
npm run dev
```

### 2. API Keys Required

| API | Cost | Where to get |
|-----|------|--------------|
| **Anthropic (Claude)** | Paid | [console.anthropic.com](https://console.anthropic.com) |
| **Pexels** | Free | [pexels.com/api](https://www.pexels.com/api/) |

> Claude API key is handled via the Anthropic proxy in the artifact environment.  
> For standalone deployment, add your key to a `.env` file:
> ```
> VITE_ANTHROPIC_API_KEY=your_key_here
> ```

### 3. Workflow

```
Step 1 → Load audio (MP3 / YouTube / SoundCloud)
Step 2 → Paste lyrics → Detect language & mood → Translate with Claude
Step 3 → Sync lyric timestamps (click-to-stamp while playing)
Step 4 → Preview animation → Load background video → Record & Export
```

## Mood Themes

| Mood | Visual Style |
|------|-------------|
| 😢 Sad | Deep blue/purple, rain particles, slow drift |
| 💕 Romantic | Warm pink/gold, soft bokeh orbs |
| 🌿 Chill | Teal/green, slow wave, minimal particles |
| 🔥 Hype | Neon red/purple, heavy beat pulse, flash |
| ✨ Default | Cinematic blue, balanced motion |

## Export Notes

- **MP3 workflow** → Full audio-reactive export as WebM → merge audio in CapCut
- **YouTube/SoundCloud** → Visual canvas only (browser ToS limitation) → merge audio in CapCut/Premiere
- Recommended aspect: **16:9** for YouTube, crop to **9:16** in CapCut for TikTok/Reels

## Tech Stack

- React 18 + Vite
- Web Audio API (analyser, amplitude detection)
- HTML5 Canvas (animation renderer)
- MediaRecorder API (video export)
- Anthropic Claude API (translation + mood detection)
- Pexels Videos API (background footage)

## Deployment

```bash
npm run build
# Deploy /dist folder to Vercel, Netlify, or any static host
```

---

Built for TikTok & YouTube content creators 🎬
