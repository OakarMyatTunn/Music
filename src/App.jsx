import { useState, useRef, useEffect, useCallback } from "react";

// ── Constants ──────────────────────────────────────────────────────────────
const PEXELS_API_KEY = ""; // User must add their free Pexels API key
const ANTHROPIC_PROXY = "https://api.anthropic.com/v1/messages";

const MOOD_QUERIES = {
  sad: "rain window night city",
  romantic: "sunset golden hour nature",
  chill: "clouds sky nature calm",
  hype: "neon city night lights",
  default: "nature landscape cinematic",
};

const MOOD_COLORS = {
  sad:      { primary: "#4a90d9", secondary: "#1a1a3e", accent: "#7eb8f7", grade: "rgba(10,20,60,0.45)" },
  romantic: { primary: "#f4a261", secondary: "#2d1b0e", accent: "#e9c46a", grade: "rgba(80,20,20,0.40)" },
  chill:    { primary: "#52b788", secondary: "#0d2b1e", accent: "#95d5b2", grade: "rgba(10,40,25,0.40)" },
  hype:     { primary: "#f72585", secondary: "#10002b", accent: "#7209b7", grade: "rgba(40,0,60,0.45)" },
  default:  { primary: "#a8dadc", secondary: "#1d3557", accent: "#f1faee", grade: "rgba(10,20,40,0.40)" },
};

const TEXT_POSITIONS = [
  { x: 0.5, y: 0.25, align: "center" },
  { x: 0.5, y: 0.5,  align: "center" },
  { x: 0.5, y: 0.72, align: "center" },
  { x: 0.2, y: 0.5,  align: "left"   },
  { x: 0.8, y: 0.5,  align: "right"  },
];

const LANGUAGES = [
  { code: "my", label: "မြန်မာ (Myanmar)" },
  { code: "en", label: "English" },
  { code: "zh", label: "中文 (Chinese)" },
  { code: "ja", label: "日本語 (Japanese)" },
  { code: "ko", label: "한국어 (Korean)" },
  { code: "th", label: "ภาษาไทย (Thai)" },
];

// ── Helpers ────────────────────────────────────────────────────────────────
function parseLyrics(text) {
  return text.split("\n").map((line, i) => ({
    id: i,
    original: line.trim(),
    translated: "",
    timestamp: i * 4,
    position: TEXT_POSITIONS[i % TEXT_POSITIONS.length],
  })).filter(l => l.original !== "");
}

function detectMoodFromText(lyrics) {
  const text = lyrics.toLowerCase();
  const sadWords = ["cry","tears","rain","alone","miss","hurt","pain","lonely","broken","sad","night","dark"];
  const romanticWords = ["love","heart","kiss","hold","together","forever","beautiful","dream","honey","baby"];
  const hypeWords = ["fire","hype","go","yeah","lit","power","win","energy","fast","loud","beat","drop"];
  const chillWords = ["chill","calm","slow","breathe","peace","still","soft","gentle","float","wave"];
  const score = (words) => words.reduce((s, w) => s + (text.split(w).length - 1), 0);
  const scores = { sad: score(sadWords), romantic: score(romanticWords), hype: score(hypeWords), chill: score(chillWords) };
  const top = Object.entries(scores).sort((a,b)=>b[1]-a[1])[0];
  return top[1] > 0 ? top[0] : "default";
}

// ── Claude API ─────────────────────────────────────────────────────────────
async function translateLyrics(lines, targetLangs, mood, originalLang) {
  const lyricsText = lines.map((l, i) => `${i + 1}. ${l.original}`).join("\n");
  const langNames = targetLangs.map(c => LANGUAGES.find(l => l.code === c)?.label).join(", ");

  const prompt = `You are a professional music lyric translator specializing in poetic, context-aware translation.

Song mood: ${mood}
Original language: ${originalLang || "auto-detect"}
Lyrics to translate:
${lyricsText}

Translate each lyric line into: ${langNames}

Rules:
- Preserve the emotional tone and poetic feel, NOT word-for-word literal translation
- Keep it natural when sung or read aloud
- For Myanmar (Burmese): use colloquial, emotional phrasing that resonates with the mood
- Keep translations concise (fit on one line on screen)

Respond ONLY with a JSON array, no markdown, no explanation:
[
  {
    "line": 1,
    "translations": {
      "my": "မြန်မာဘာသာပြန်",
      "en": "English translation",
      "zh": "中文翻译"
    }
  }
]
Only include the language codes requested: ${targetLangs.join(", ")}`;

  const response = await fetch(ANTHROPIC_PROXY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await response.json();
  const text = data.content?.[0]?.text || "[]";
  try {
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch { return []; }
}

async function detectLanguage(text) {
  const response = await fetch(ANTHROPIC_PROXY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: `Detect the language of these lyrics and respond with ONLY a JSON object, no markdown:
{"language": "Chinese", "code": "zh", "mood": "romantic"}

Mood options: sad, romantic, chill, hype, default

Lyrics:
${text.slice(0, 300)}`
      }],
    }),
  });
  const data = await response.json();
  try {
    const clean = (data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch { return { language: "Unknown", code: "?", mood: "default" }; }
}

// ── Pexels Video ───────────────────────────────────────────────────────────
async function fetchPexelsVideo(mood, apiKey) {
  const query = MOOD_QUERIES[mood] || MOOD_QUERIES.default;
  const res = await fetch(
    `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape`,
    { headers: { Authorization: apiKey } }
  );
  const data = await res.json();
  const videos = data.videos || [];
  if (!videos.length) return null;
  const vid = videos[Math.floor(Math.random() * videos.length)];
  const file = vid.video_files?.find(f => f.quality === "hd" || f.quality === "sd");
  return file?.link || null;
}

// ── Canvas Renderer ────────────────────────────────────────────────────────
function useCanvasRenderer({ canvasRef, videoRef, lyrics, currentTime, mood, showLangs, isPlaying, analyserRef }) {
  const animFrameRef = useRef(null);
  const particlesRef = useRef([]);
  const colors = MOOD_COLORS[mood] || MOOD_COLORS.default;

  const initParticles = useCallback((w, h) => {
    particlesRef.current = Array.from({ length: 60 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      size: Math.random() * 3 + 1,
      speedX: (Math.random() - 0.5) * 0.6,
      speedY: mood === "sad" ? Math.random() * 1.2 + 0.3 : (Math.random() - 0.5) * 0.4,
      opacity: Math.random() * 0.6 + 0.2,
      pulse: Math.random() * Math.PI * 2,
    }));
  }, [mood]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    initParticles(canvas.width, canvas.height);
  }, [mood, initParticles, canvasRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let frame = 0;

    const getAmplitude = () => {
      if (!analyserRef.current) return 0;
      const data = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(data);
      return data.reduce((a, b) => a + b, 0) / data.length / 255;
    };

    const activeLine = lyrics.reduce((found, line) => {
      if (line.timestamp <= currentTime) return line;
      return found;
    }, null);

    const nextLine = activeLine
      ? lyrics.find(l => l.timestamp > activeLine.timestamp)
      : null;
    const lineProgress = activeLine && nextLine
      ? Math.min(1, (currentTime - activeLine.timestamp) / (nextLine.timestamp - activeLine.timestamp))
      : 0;

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      const amp = getAmplitude();
      frame++;

      // Video frame
      if (video && video.readyState >= 2) {
        ctx.drawImage(video, 0, 0, W, H);
      } else {
        const grad = ctx.createLinearGradient(0, 0, W, H);
        grad.addColorStop(0, colors.secondary);
        grad.addColorStop(1, "#000");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      }

      // Cinematic color grade overlay
      ctx.fillStyle = colors.grade;
      ctx.fillRect(0, 0, W, H);

      // Vignette
      const vig = ctx.createRadialGradient(W/2, H/2, H*0.3, W/2, H/2, H*0.85);
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, "rgba(0,0,0,0.72)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);

      // Particles
      particlesRef.current.forEach(p => {
        p.pulse += 0.03;
        p.x += p.speedX * (1 + amp * 2);
        p.y += p.speedY * (1 + amp * 1.5);
        if (p.x < 0) p.x = W;
        if (p.x > W) p.x = 0;
        if (p.y > H) p.y = 0;
        if (p.y < 0) p.y = H;
        const s = p.size * (1 + Math.sin(p.pulse) * 0.3 + amp * 0.5);
        ctx.beginPath();
        ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${hexToRgb(colors.accent)},${p.opacity * (0.5 + amp)})`;
        ctx.fill();
      });

      // Waveform ring at bottom center
      if (analyserRef.current) {
        const bufLen = analyserRef.current.frequencyBinCount;
        const freqData = new Uint8Array(bufLen);
        analyserRef.current.getByteFrequencyData(freqData);
        const cx = W / 2, cy = H - 60;
        const radius = 40;
        const slices = 64;
        ctx.save();
        for (let i = 0; i < slices; i++) {
          const angle = (i / slices) * Math.PI * 2 - Math.PI / 2;
          const val = freqData[Math.floor(i / slices * bufLen)] / 255;
          const r1 = radius;
          const r2 = radius + val * 30;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
          ctx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2);
          ctx.strokeStyle = `rgba(${hexToRgb(colors.primary)},${0.4 + val * 0.6})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.restore();
      }

      // Beat pulse flash
      if (amp > 0.6) {
        ctx.fillStyle = `rgba(${hexToRgb(colors.primary)},${(amp - 0.6) * 0.15})`;
        ctx.fillRect(0, 0, W, H);
      }

      // Lyric text
      if (activeLine?.original) {
        const pos = activeLine.position;
        const tx = pos.x * W;
        const ty = pos.y * H;
        const fadeIn = Math.min(1, lineProgress < 0.1 ? lineProgress * 10 : 1);
        const fadeOut = lineProgress > 0.85 ? (1 - lineProgress) / 0.15 : 1;
        const alpha = fadeIn * fadeOut;
        const scale = 1 + amp * 0.04;

        ctx.save();
        ctx.translate(tx, ty);
        ctx.scale(scale, scale);
        ctx.textAlign = pos.align === "left" ? "left" : pos.align === "right" ? "right" : "center";

        // Main lyric
        const fontSize = Math.max(28, Math.min(48, W / 18));
        ctx.font = `700 ${fontSize}px 'Noto Sans', sans-serif`;
        ctx.shadowColor = colors.primary;
        ctx.shadowBlur = 20 + amp * 20;
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fillText(activeLine.original, 0, 0);

        // Translations
        let yOff = fontSize + 10;
        showLangs.forEach(lang => {
          const tr = activeLine.translated?.[lang];
          if (!tr) return;
          const subSize = Math.max(18, fontSize * 0.55);
          ctx.font = `400 ${subSize}px 'Noto Sans', sans-serif`;
          ctx.shadowBlur = 10;
          ctx.fillStyle = `rgba(${hexToRgb(colors.accent)},${alpha * 0.9})`;
          ctx.fillText(tr, 0, yOff);
          yOff += subSize + 6;
        });

        ctx.restore();
      }

      animFrameRef.current = requestAnimationFrame(draw);
    };

    animFrameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [lyrics, currentTime, mood, showLangs, colors, analyserRef, canvasRef, videoRef]);
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `${r},${g},${b}`;
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function LyricMotion() {
  // State
  const [step, setStep] = useState(1);
  const [audioSrc, setAudioSrc] = useState(null);
  const [audioType, setAudioType] = useState("mp3"); // mp3 | youtube | soundcloud
  const [embedUrl, setEmbedUrl] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [lyricsRaw, setLyricsRaw] = useState("");
  const [lyrics, setLyrics] = useState([]);
  const [mood, setMood] = useState("default");
  const [detectedLang, setDetectedLang] = useState(null);
  const [selectedLangs, setSelectedLangs] = useState(["my", "en"]);
  const [showLangs, setShowLangs] = useState(["my"]);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [pexelsKey, setPexelsKey] = useState("");
  const [videoSrc, setVideoSrc] = useState(null);
  const [isFetchingVideo, setIsFetchingVideo] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [activeTab, setActiveTab] = useState("mp3");
  const [timingMode, setTimingMode] = useState(false);
  const [notification, setNotification] = useState(null);

  // Refs
  const audioRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const analyserRef = useRef(null);
  const audioCtxRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const notify = (msg, type = "info") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3500);
  };

  // Audio analyser setup
  const setupAnalyser = useCallback((source) => {
    if (audioCtxRef.current) audioCtxRef.current.close();
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtxRef.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    const src = ctx.createMediaElementSource(source);
    src.connect(analyser);
    analyser.connect(ctx.destination);
    analyserRef.current = analyser;
  }, []);

  const handleMp3Upload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setAudioSrc(url);
    setAudioType("mp3");
    notify("MP3 loaded ✓", "success");
  };

  const handleEmbedUrl = () => {
    if (!urlInput.trim()) return;
    if (urlInput.includes("youtube.com") || urlInput.includes("youtu.be")) {
      const id = urlInput.match(/(?:v=|youtu\.be\/)([^&\s]+)/)?.[1];
      if (id) { setEmbedUrl(`https://www.youtube.com/embed/${id}?enablejsapi=1`); setAudioType("youtube"); notify("YouTube embedded ✓", "success"); }
    } else if (urlInput.includes("soundcloud.com")) {
      setEmbedUrl(`https://w.soundcloud.com/player/?url=${encodeURIComponent(urlInput)}&color=%23${MOOD_COLORS[mood].primary.replace('#','')}&auto_play=false`);
      setAudioType("soundcloud");
      notify("SoundCloud embedded ✓", "success");
    }
  };

  const handleProcessLyrics = async () => {
    if (!lyricsRaw.trim()) return;
    setIsDetecting(true);
    const parsed = parseLyrics(lyricsRaw);
    const detectedMood = detectMoodFromText(lyricsRaw);
    const langInfo = await detectLanguage(lyricsRaw);
    setDetectedLang(langInfo);
    setMood(langInfo.mood || detectedMood);
    setLyrics(parsed);
    setIsDetecting(false);
    notify(`Detected: ${langInfo.language} · Mood: ${langInfo.mood || detectedMood}`, "success");
    setStep(3);
  };

  const handleTranslate = async () => {
    if (!lyrics.length) return;
    setIsTranslating(true);
    try {
      const results = await translateLyrics(lyrics, selectedLangs, mood, detectedLang?.language);
      const updated = lyrics.map((line, i) => {
        const found = results.find(r => r.line === i + 1);
        return { ...line, translated: found?.translations || {} };
      });
      setLyrics(updated);
      setShowLangs(selectedLangs.slice(0, 2));
      notify("Translation complete ✓", "success");
    } catch (e) {
      notify("Translation failed. Check API.", "error");
    }
    setIsTranslating(false);
  };

  const handleFetchVideo = async () => {
    if (!pexelsKey.trim()) { notify("Enter Pexels API key", "error"); return; }
    setIsFetchingVideo(true);
    const url = await fetchPexelsVideo(mood, pexelsKey);
    if (url) { setVideoSrc(url); notify("Background video loaded ✓", "success"); }
    else notify("No video found. Try different mood.", "error");
    setIsFetchingVideo(false);
  };

  const handleTimestamp = (lineId) => {
    if (!timingMode) return;
    const t = audioRef.current?.currentTime || currentTime;
    setLyrics(prev => prev.map(l => l.id === lineId ? { ...l, timestamp: parseFloat(t.toFixed(1)) } : l));
  };

  const handleRecord = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9" });
    chunksRef.current = [];
    recorder.ondataavailable = e => chunksRef.current.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "lyricmotion_export.webm";
      a.click();
      notify("Video downloaded ✓", "success");
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
    notify("Recording started... press Stop when done", "info");
  };

  // Audio time tracking
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onPlay = () => { setIsPlaying(true); if (!analyserRef.current) setupAnalyser(audio); };
    const onPause = () => setIsPlaying(false);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [audioSrc, setupAnalyser]);

  useCanvasRenderer({ canvasRef, videoRef, lyrics, currentTime, mood, showLangs, isPlaying, analyserRef });

  const colors = MOOD_COLORS[mood] || MOOD_COLORS.default;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0f",
      color: "#f0f0f0",
      fontFamily: "'Noto Sans', 'Segoe UI', sans-serif",
      padding: "0",
      overflowX: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "20px 32px",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "rgba(255,255,255,0.02)",
        backdropFilter: "blur(10px)",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%",
            background: `linear-gradient(135deg, ${colors.primary}, ${colors.accent})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18,
          }}>🎬</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.5px", color: colors.accent }}>LyricMotion</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: "1px", textTransform: "uppercase" }}>Animated Music Video Generator</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {[1,2,3,4].map(s => (
            <div key={s} onClick={() => setStep(s)} style={{
              width: 32, height: 32, borderRadius: "50%", cursor: "pointer",
              background: step === s ? colors.primary : step > s ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${step === s ? colors.primary : "rgba(255,255,255,0.1)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 700, color: step === s ? "#000" : "rgba(255,255,255,0.5)",
              transition: "all 0.2s",
            }}>{s}</div>
          ))}
        </div>
      </div>

      {/* Notification */}
      {notification && (
        <div style={{
          position: "fixed", top: 80, right: 24, zIndex: 999,
          background: notification.type === "success" ? "#1a4a2e" : notification.type === "error" ? "#4a1a1a" : "#1a2a4a",
          border: `1px solid ${notification.type === "success" ? "#2d7a4a" : notification.type === "error" ? "#7a2d2d" : "#2d4a7a"}`,
          borderRadius: 8, padding: "12px 20px", fontSize: 13,
          color: "#fff", backdropFilter: "blur(10px)",
          boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
          animation: "fadeIn 0.2s ease",
        }}>{notification.msg}</div>
      )}

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>

        {/* STEP 1: Audio Input */}
        {step === 1 && (
          <Section title="Step 1 — Audio Source" subtitle="Load your music" colors={colors}>
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              {["mp3","youtube","soundcloud"].map(t => (
                <TabBtn key={t} active={activeTab === t} onClick={() => setActiveTab(t)} colors={colors}>
                  {t === "mp3" ? "🎵 MP3 Upload" : t === "youtube" ? "▶ YouTube" : "☁ SoundCloud"}
                </TabBtn>
              ))}
            </div>

            {activeTab === "mp3" && (
              <div>
                <label style={{
                  display: "block", border: `2px dashed ${colors.primary}30`,
                  borderRadius: 12, padding: "40px 24px", textAlign: "center",
                  cursor: "pointer", transition: "all 0.2s",
                  background: audioSrc ? `${colors.primary}10` : "transparent",
                }}>
                  <input type="file" accept="audio/*" onChange={handleMp3Upload} style={{ display: "none" }} />
                  <div style={{ fontSize: 36, marginBottom: 12 }}>🎵</div>
                  <div style={{ fontSize: 15, color: "rgba(255,255,255,0.7)" }}>
                    {audioSrc ? "✓ MP3 loaded — click to change" : "Click or drag MP3 file here"}
                  </div>
                </label>
                {audioSrc && (
                  <audio ref={audioRef} src={audioSrc} controls style={{
                    width: "100%", marginTop: 16, borderRadius: 8,
                    filter: "invert(1) hue-rotate(180deg)",
                  }} />
                )}
              </div>
            )}

            {(activeTab === "youtube" || activeTab === "soundcloud") && (
              <div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={urlInput}
                    onChange={e => setUrlInput(e.target.value)}
                    placeholder={activeTab === "youtube" ? "Paste YouTube URL..." : "Paste SoundCloud URL..."}
                    style={inputStyle(colors)}
                    onKeyDown={e => e.key === "Enter" && handleEmbedUrl()}
                  />
                  <Btn onClick={handleEmbedUrl} colors={colors}>Load</Btn>
                </div>
                {embedUrl && (
                  <div style={{ marginTop: 16, borderRadius: 12, overflow: "hidden", border: `1px solid rgba(255,255,255,0.1)` }}>
                    <iframe
                      src={embedUrl}
                      width="100%" height={audioType === "youtube" ? 200 : 120}
                      frameBorder="0" allow="autoplay"
                      style={{ display: "block" }}
                    />
                  </div>
                )}
                <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(255,255,255,0.04)", borderRadius: 8, fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
                  ℹ For YouTube/SoundCloud, the canvas animation syncs to playback. MP4 export will be video-only — merge audio in CapCut/Premiere.
                </div>
              </div>
            )}

            <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
              <Btn onClick={() => setStep(2)} colors={colors}>Next: Lyrics →</Btn>
            </div>
          </Section>
        )}

        {/* STEP 2: Lyrics */}
        {step === 2 && (
          <Section title="Step 2 — Lyrics & Translation" subtitle="Paste lyrics, translate with Claude" colors={colors}>
            <textarea
              value={lyricsRaw}
              onChange={e => setLyricsRaw(e.target.value)}
              placeholder={"Paste your song lyrics here...\nOne line per lyric line.\n\nExample:\n你是我心中最亮的星\n每当夜深我总想起你"}
              style={{
                ...inputStyle(colors),
                width: "100%", height: 200, resize: "vertical",
                fontFamily: "'Noto Sans', sans-serif", fontSize: 15, lineHeight: 1.7,
                boxSizing: "border-box",
              }}
            />

            {detectedLang && (
              <div style={{
                marginTop: 8, padding: "8px 14px", borderRadius: 8,
                background: `${colors.primary}15`, border: `1px solid ${colors.primary}30`,
                fontSize: 13, color: colors.accent,
              }}>
                🔍 Detected: <strong>{detectedLang.language}</strong> · Mood: <strong>{mood}</strong>
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 10 }}>Translate to:</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {LANGUAGES.map(lang => (
                  <label key={lang.code} style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 12px", borderRadius: 20, cursor: "pointer",
                    background: selectedLangs.includes(lang.code) ? `${colors.primary}25` : "rgba(255,255,255,0.05)",
                    border: `1px solid ${selectedLangs.includes(lang.code) ? colors.primary : "rgba(255,255,255,0.1)"}`,
                    fontSize: 13, transition: "all 0.15s",
                  }}>
                    <input
                      type="checkbox"
                      checked={selectedLangs.includes(lang.code)}
                      onChange={e => setSelectedLangs(prev =>
                        e.target.checked ? [...prev, lang.code] : prev.filter(c => c !== lang.code)
                      )}
                      style={{ display: "none" }}
                    />
                    {lang.label}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Btn onClick={handleProcessLyrics} colors={colors} disabled={isDetecting || !lyricsRaw.trim()}>
                {isDetecting ? "Detecting..." : "🔍 Detect Language & Mood"}
              </Btn>
              <Btn onClick={handleTranslate} colors={colors} disabled={isTranslating || !lyrics.length} variant="outline">
                {isTranslating ? "Translating..." : "✨ Translate with Claude"}
              </Btn>
            </div>

            {lyrics.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 12 }}>
                  {lyrics.length} lines detected
                  {lyrics[0]?.translated && Object.keys(lyrics[0].translated).length > 0 && " · Translated ✓"}
                </div>
                <div style={{
                  maxHeight: 260, overflowY: "auto",
                  border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10,
                  padding: "4px 0",
                }}>
                  {lyrics.map((line, i) => (
                    <div key={line.id} style={{
                      padding: "10px 16px",
                      borderBottom: i < lyrics.length-1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                      display: "flex", flexDirection: "column", gap: 3,
                    }}>
                      <div style={{ fontSize: 14, color: "#fff" }}>{line.original}</div>
                      {selectedLangs.map(lang => line.translated?.[lang] && (
                        <div key={lang} style={{ fontSize: 12, color: colors.accent, opacity: 0.8 }}>
                          [{lang.toUpperCase()}] {line.translated[lang]}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: 24, display: "flex", justifyContent: "space-between" }}>
              <Btn onClick={() => setStep(1)} colors={colors} variant="ghost">← Back</Btn>
              <Btn onClick={() => setStep(3)} colors={colors} disabled={!lyrics.length}>Next: Timing →</Btn>
            </div>
          </Section>
        )}

        {/* STEP 3: Timing */}
        {step === 3 && (
          <Section title="Step 3 — Lyric Timing" subtitle="Sync lyrics to timestamps" colors={colors}>
            <div style={{
              padding: "12px 16px", borderRadius: 8, marginBottom: 16,
              background: timingMode ? `${colors.primary}20` : "rgba(255,255,255,0.04)",
              border: `1px solid ${timingMode ? colors.primary : "rgba(255,255,255,0.08)"}`,
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ fontSize: 13, color: timingMode ? colors.accent : "rgba(255,255,255,0.5)" }}>
                {timingMode ? "🔴 Timing mode ON — click a lyric line while music plays to stamp timestamp" : "Enable timing mode to sync lyrics"}
              </div>
              <Btn onClick={() => setTimingMode(t => !t)} colors={colors} variant={timingMode ? "solid" : "outline"}>
                {timingMode ? "Done" : "Enable"}
              </Btn>
            </div>

            {audioSrc && (
              <audio ref={audioRef} src={audioSrc} controls style={{
                width: "100%", marginBottom: 16, borderRadius: 8,
                filter: "invert(1) hue-rotate(180deg)",
              }} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} />
            )}

            <div style={{ maxHeight: 360, overflowY: "auto", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)" }}>
              {lyrics.map((line, i) => (
                <div
                  key={line.id}
                  onClick={() => handleTimestamp(line.id)}
                  style={{
                    padding: "10px 16px", cursor: timingMode ? "pointer" : "default",
                    borderBottom: i < lyrics.length-1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                    display: "flex", alignItems: "center", gap: 12,
                    background: currentTime >= line.timestamp && (lyrics[i+1] ? currentTime < lyrics[i+1].timestamp : true)
                      ? `${colors.primary}15` : "transparent",
                    transition: "background 0.2s",
                  }}>
                  <div style={{
                    minWidth: 52, fontSize: 12, fontFamily: "monospace",
                    color: colors.accent, opacity: 0.8,
                  }}>
                    {line.timestamp.toFixed(1)}s
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14 }}>{line.original}</div>
                    {showLangs.map(lang => line.translated?.[lang] && (
                      <div key={lang} style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                        {line.translated[lang]}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      type="number"
                      value={line.timestamp}
                      step="0.1"
                      min="0"
                      onChange={e => setLyrics(prev => prev.map(l => l.id === line.id ? { ...l, timestamp: parseFloat(e.target.value) } : l))}
                      onClick={e => e.stopPropagation()}
                      style={{
                        width: 64, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)",
                        borderRadius: 6, color: "#fff", padding: "4px 8px", fontSize: 12,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 20, display: "flex", justifyContent: "space-between" }}>
              <Btn onClick={() => setStep(2)} colors={colors} variant="ghost">← Back</Btn>
              <Btn onClick={() => setStep(4)} colors={colors}>Next: Preview →</Btn>
            </div>
          </Section>
        )}

        {/* STEP 4: Preview & Export */}
        {step === 4 && (
          <Section title="Step 4 — Preview & Export" subtitle="Watch and download your video" colors={colors}>
            {/* Pexels key */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <input
                value={pexelsKey}
                onChange={e => setPexelsKey(e.target.value)}
                placeholder="Pexels API key (free at pexels.com/api)"
                type="password"
                style={{ ...inputStyle(colors), flex: 1 }}
              />
              <Btn onClick={handleFetchVideo} colors={colors} disabled={isFetchingVideo}>
                {isFetchingVideo ? "Loading..." : "Load Video"}
              </Btn>
            </div>

            {/* Mood selector */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              {["sad","romantic","chill","hype","default"].map(m => (
                <Btn key={m} onClick={() => setMood(m)} colors={MOOD_COLORS[m]} variant={mood === m ? "solid" : "outline"}>
                  {m === "sad" ? "😢" : m === "romantic" ? "💕" : m === "chill" ? "🌿" : m === "hype" ? "🔥" : "✨"} {m}
                </Btn>
              ))}
            </div>

            {/* Show lang toggles */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Show on video:</span>
              {LANGUAGES.filter(l => lyrics[0]?.translated?.[l.code]).map(lang => (
                <label key={lang.code} style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "4px 10px", borderRadius: 16, cursor: "pointer",
                  background: showLangs.includes(lang.code) ? `${colors.primary}25` : "rgba(255,255,255,0.05)",
                  border: `1px solid ${showLangs.includes(lang.code) ? colors.primary : "rgba(255,255,255,0.1)"}`,
                  fontSize: 12,
                }}>
                  <input type="checkbox" checked={showLangs.includes(lang.code)}
                    onChange={e => setShowLangs(prev => e.target.checked ? [...prev, lang.code] : prev.filter(c => c !== lang.code))}
                    style={{ display: "none" }} />
                  {lang.label.split(" ")[0]}
                </label>
              ))}
            </div>

            {/* Hidden video element */}
            {videoSrc && (
              <video
                ref={videoRef}
                src={videoSrc}
                autoPlay loop muted playsInline
                style={{ display: "none" }}
              />
            )}

            {/* Canvas Preview */}
            <div style={{
              borderRadius: 14, overflow: "hidden",
              border: `2px solid ${colors.primary}30`,
              boxShadow: `0 0 40px ${colors.primary}20`,
              aspectRatio: "16/9", background: "#000",
              position: "relative",
            }}>
              <canvas
                ref={canvasRef}
                width={1280}
                height={720}
                style={{ width: "100%", height: "100%", display: "block" }}
              />
              {!videoSrc && (
                <div style={{
                  position: "absolute", inset: 0, display: "flex",
                  alignItems: "center", justifyContent: "center",
                  flexDirection: "column", gap: 8,
                  background: `linear-gradient(135deg, ${colors.secondary}, #000)`,
                  color: "rgba(255,255,255,0.3)", fontSize: 14,
                }}>
                  <div style={{ fontSize: 32 }}>🎬</div>
                  <div>Add Pexels API key & load video to see background</div>
                  <div style={{ fontSize: 12, opacity: 0.6 }}>Canvas animation runs without background video too</div>
                </div>
              )}
            </div>

            {/* Playback controls */}
            {audioSrc && (
              <audio
                ref={audioRef}
                src={audioSrc}
                controls
                style={{ width: "100%", marginTop: 14, borderRadius: 8, filter: "invert(1) hue-rotate(180deg)" }}
                onPlay={() => { setIsPlaying(true); if (!analyserRef.current) setupAnalyser(audioRef.current); }}
                onPause={() => setIsPlaying(false)}
                onTimeUpdate={e => setCurrentTime(e.target.currentTime)}
              />
            )}

            {(embedUrl && audioType !== "mp3") && (
              <div style={{ marginTop: 14, borderRadius: 10, overflow: "hidden" }}>
                <iframe src={embedUrl} width="100%" height={audioType === "youtube" ? 180 : 100} frameBorder="0" allow="autoplay" />
              </div>
            )}

            {/* Export */}
            <div style={{ marginTop: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Btn onClick={handleRecord} colors={colors} variant={isRecording ? "danger" : "solid"}>
                {isRecording ? "⏹ Stop & Download" : "⏺ Record & Export WebM"}
              </Btn>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", alignSelf: "center" }}>
                Export = canvas recording (WebM). Merge audio in CapCut for final video.
              </div>
            </div>
          </Section>
        )}
      </div>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;700&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
        @keyframes fadeIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
      `}</style>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────
function Section({ title, subtitle, children, colors }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 16, padding: "28px 28px 32px",
      boxShadow: "0 4px 40px rgba(0,0,0,0.3)",
    }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "-0.3px" }}>{title}</h2>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "rgba(255,255,255,0.4)" }}>{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function Btn({ children, onClick, colors, variant = "solid", disabled = false }) {
  const styles = {
    solid: { background: colors.primary, color: "#000", border: `1px solid ${colors.primary}` },
    outline: { background: "transparent", color: colors.primary, border: `1px solid ${colors.primary}50` },
    ghost: { background: "transparent", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" },
    danger: { background: "#c0392b", color: "#fff", border: "1px solid #c0392b" },
  };
  return (
    <button onClick={disabled ? undefined : onClick} style={{
      ...styles[variant],
      padding: "9px 18px", borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer",
      fontSize: 13, fontWeight: 600, transition: "all 0.15s", whiteSpace: "nowrap",
      opacity: disabled ? 0.4 : 1,
    }}>{children}</button>
  );
}

function TabBtn({ children, active, onClick, colors }) {
  return (
    <button onClick={onClick} style={{
      padding: "8px 16px", borderRadius: 8, cursor: "pointer",
      background: active ? `${colors.primary}20` : "transparent",
      border: `1px solid ${active ? colors.primary : "rgba(255,255,255,0.1)"}`,
      color: active ? colors.accent : "rgba(255,255,255,0.5)",
      fontSize: 13, fontWeight: active ? 600 : 400, transition: "all 0.15s",
    }}>{children}</button>
  );
}

function inputStyle(colors) {
  return {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 8, color: "#fff",
    padding: "10px 14px", fontSize: 14,
    outline: "none", transition: "border 0.15s",
    fontFamily: "'Noto Sans', sans-serif",
  };
}
