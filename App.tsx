
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Send, Plus, Settings, Image as ImageIcon, Trash2, Menu, X, Zap, Cpu, 
  Globe, ExternalLink, Loader2, Camera, Mic, MicOff, Copy, Check, Volume2, 
  Square, Search, Keyboard, Gauge, Share2, User, AlertCircle, Headphones, 
  PhoneOff, Eye, MapPin, ChevronRight, Sparkles, Command, Languages, ChevronDown,
  Layers, Music, Palette, Wand2, Repeat, Download, Maximize2, Frame, Activity,
  Clapperboard, Play, Pause, Film, Brush, Monitor, CreditCard, RefreshCw
} from 'lucide-react';
import { Message, ChatSession, ModelType, GroundingLink, UserSettings, PersonaType, LanguageType, ResponseLength } from './types';
import { geminiService, PERSONA_PROMPTS } from './services/geminiService';
import MarkdownRenderer from './components/MarkdownRenderer';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';

const CHATS_STORAGE_KEY = 'muha_ai_v3_history';
const SETTINGS_STORAGE_KEY = 'muha_ai_v3_settings';

const LANGUAGE_LABELS: Record<LanguageType, string> = {
  'en-US': 'English',
  'so-SO': 'Soomaali',
  'ar-SA': 'العربية',
  'sv-SE': 'Svenska'
};

const AVAILABLE_VOICES = [
  { id: 'Zephyr', label: 'Zephyr (Warm & Professional)' },
  { id: 'Kore', label: 'Kore (Calm & Serene)' },
  { id: 'Puck', label: 'Puck (Youthful & Bright)' },
  { id: 'Charon', label: 'Charon (Deep & Resonant)' },
  { id: 'Fenrir', label: 'Fenrir (Strong & Direct)' },
  { id: 'Aoide', label: 'Aoide (Melodic & Expressive)' },
  { id: 'Eos', label: 'Eos (Energetic & Fresh)' },
  { id: 'Helios', label: 'Helios (Confident & Bold)' }
];

const encode = (bytes: Uint8Array) => {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

const decode = (base64: string) => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
};

const decodeAudioData = async (data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> => {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
};

const Toast: React.FC<{ message: string; type: 'error' | 'success'; onClose: () => void }> = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-3 px-5 py-3 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 animate-in slide-in-from-bottom-2 fade-in">
      {type === 'error' ? <AlertCircle className="w-4 h-4 text-rose-500" /> : <Check className="w-4 h-4 text-emerald-500" />}
      <span className="text-xs font-semibold">{message}</span>
      <button onClick={onClose} className="ml-2 hover:opacity-70"><X className="w-3 h-3" /></button>
    </div>
  );
};

const VideoPlayer: React.FC<{ src: string; className?: string }> = ({ src, className = "" }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) videoRef.current.pause();
      else videoRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div className={`relative group/vid overflow-hidden rounded-xl shadow-2xl border border-black/5 dark:border-white/5 bg-black ring-1 ring-white/10 ${className}`}>
      <video 
        ref={videoRef}
        src={src} 
        className="w-full h-full object-cover" 
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        loop
        playsInline
      />
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/vid:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
          <button onClick={togglePlay} className="p-3 bg-white/20 backdrop-blur-md rounded-full text-white border border-white/20 pointer-events-auto hover:bg-white/40 transition-all">
            {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current translate-x-0.5" />}
          </button>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem(CHATS_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });
  
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    const saved = localStorage.getItem(CHATS_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.length > 0 ? parsed[0].id : null;
      } catch (e) { return null; }
    }
    return null;
  });

  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [useSearch, setUseSearch] = useState(false);
  const [isImageMode, setIsImageMode] = useState(false);
  const [isVideoMode, setIsVideoMode] = useState(false);
  const [videoStatus, setVideoStatus] = useState('');
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [pendingVideos, setPendingVideos] = useState<string[]>([]);
  const [videoQuality, setVideoQuality] = useState<'720p' | '1080p'>('720p');
  const [videoCount, setVideoCount] = useState<number>(1);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPersonaModalOpen, setIsPersonaModalOpen] = useState(false);
  const [modalModel, setModalModel] = useState<ModelType>(ModelType.FLASH);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null);
  const [isVoiceModeActive, setIsVoiceModeActive] = useState(false);
  const [activeVoiceDropdown, setActiveVoiceDropdown] = useState<'language' | 'voice' | null>(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [voiceTranscription, setVoiceTranscription] = useState('');
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [showApiKeyError, setShowApiKeyError] = useState(false);
  
  const [settings, setSettings] = useState<UserSettings>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
      return saved ? JSON.parse(saved) : {
        theme: 'system',
        fontSize: 'sm',
        language: 'so-SO',
        visualTheme: 'default',
        speechSpeed: 1.0,
        voice: 'Zephyr',
        responseLength: 'balanced'
      };
    } catch (e) {
      return {
        theme: 'system',
        fontSize: 'sm',
        language: 'so-SO',
        visualTheme: 'default',
        speechSpeed: 1.0,
        voice: 'Zephyr',
        responseLength: 'balanced'
      };
    }
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const liveSessionRef = useRef<any>(null);
  const liveAudioCtxInRef = useRef<AudioContext | null>(null);
  const liveAudioCtxOutRef = useRef<AudioContext | null>(null);
  const liveSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const liveNextStartTimeRef = useRef(0);
  const isMicMutedRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const frameIntervalRef = useRef<number | null>(null);

  useEffect(() => { isMicMutedRef.current = isMicMuted; }, [isMicMuted]);

  const activeSession = useMemo(() => sessions.find(s => s.id === activeSessionId), [sessions, activeSessionId]);

  useEffect(() => { localStorage.setItem(CHATS_STORAGE_KEY, JSON.stringify(sessions)); }, [sessions]);
  useEffect(() => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    const isDark = settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
  }, [settings]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [activeSession?.messages, isStreaming]);

  const stopVoiceMode = useCallback(() => {
    try {
      if (liveSessionRef.current) liveSessionRef.current.close();
      if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
      liveSourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
      liveSourcesRef.current.clear();
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (liveAudioCtxInRef.current) liveAudioCtxInRef.current.close();
      if (liveAudioCtxOutRef.current) liveAudioCtxOutRef.current.close();
      
      liveSessionRef.current = null;
      streamRef.current = null;
      liveAudioCtxInRef.current = null;
      liveAudioCtxOutRef.current = null;
      setIsVoiceModeActive(false);
      setIsMicMuted(false);
      setIsCameraActive(false);
      setVoiceTranscription('');
      setActiveVoiceDropdown(null);
    } catch (e) { console.error(e); }
  }, []);

  const handleApiKeyError = useCallback(async () => {
    setShowApiKeyError(true);
    setToast({ message: "Cillad API Key: Hubi in aad isticmaalayso 'Paid Project'.", type: 'error' });
  }, []);

  const startVoiceMode = useCallback(async (explicitLang?: LanguageType, explicitVoice?: string) => {
    if (!activeSession) return setToast({ message: "Saldhigga horta bilow.", type: 'error' });
    
    try {
      setIsVoiceModeActive(true);
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      liveAudioCtxInRef.current = new AudioCtx({ sampleRate: 16000 });
      liveAudioCtxOutRef.current = new AudioCtx({ sampleRate: 24000 });
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isCameraActive });
      streamRef.current = stream;
      if (isCameraActive && videoRef.current) videoRef.current.srcObject = stream;

      const targetLang = explicitLang || settings.language;
      const targetVoice = explicitVoice || settings.voice;
      
      let personaInstruction = "";
      if (activeSession.persona === 'doctor') {
        personaInstruction = "EXPERT MEDICAL MODE. Use clinical terminology precisely.";
      } else if (activeSession.persona === 'teacher') {
        personaInstruction = "ACADEMIC TUTOR MODE. Be pedagogically clear and structured.";
      } else if (activeSession.persona === 'translator') {
        personaInstruction = "UNIVERSAL INTERPRETER. Seamless bidirectional translation.";
      }
      
      let langInfo = targetLang === 'so-SO' 
          ? "DYNAMIC MODE: SOMALI. Speak elegant 'Af-Soomaali San' with rhythmic prosody." 
          : `DYNAMIC MODE: ${LANGUAGE_LABELS[targetLang]}. Professional and articulate.`;
        
      const instruction = `${personaInstruction} ${PERSONA_PROMPTS[activeSession.persona]}. ${langInfo} Use visual data if camera is active.`;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            const ctx = liveAudioCtxInRef.current!;
            const source = ctx.createMediaStreamSource(stream);
            const scriptProcessor = ctx.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              if (isMicMutedRef.current) return;
              const inputData = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                const s = Math.max(-1, Math.min(1, inputData[i]));
                int16[i] = s < 0 ? s * 32768 : s * 32767;
              }
              const pcmBlob = { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
              sessionPromise.then(s => s.sendRealtimeInput({ media: pcmBlob }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(ctx.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            const audioData = msg.serverContent?.modelTurn?.parts?.find(p => p.inlineData?.mimeType.includes('audio'))?.inlineData?.data;
            if (audioData && liveAudioCtxOutRef.current) {
              const ctx = liveAudioCtxOutRef.current;
              liveNextStartTimeRef.current = Math.max(liveNextStartTimeRef.current, ctx.currentTime);
              const buffer = await decodeAudioData(decode(audioData), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = buffer;
              source.connect(ctx.destination);
              source.onended = () => liveSourcesRef.current.delete(source);
              source.start(liveNextStartTimeRef.current);
              liveNextStartTimeRef.current += buffer.duration;
              liveSourcesRef.current.add(source);
            }
            if (msg.serverContent?.interrupted) {
              liveSourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
              liveSourcesRef.current.clear();
              liveNextStartTimeRef.current = 0;
            }
            if (msg.serverContent?.inputTranscription) setVoiceTranscription(msg.serverContent.inputTranscription.text);
            else if (msg.serverContent?.outputTranscription) setVoiceTranscription(msg.serverContent.outputTranscription.text);
          },
          onerror: (err) => { 
            console.error(err);
            if (err.toString().includes("403") || err.toString().includes("permission denied")) {
              handleApiKeyError();
            } else {
              setToast({ message: "Xidhiidhka ayaa go'ay.", type: "error" });
            }
            stopVoiceMode(); 
          },
          onclose: () => setIsVoiceModeActive(false)
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: targetVoice } } },
          outputAudioTranscription: {}, inputAudioTranscription: {},
          systemInstruction: instruction
        }
      });
      liveSessionRef.current = await sessionPromise;
    } catch (e: any) {
      if (e.message?.includes("API_PERMISSION_DENIED") || e.message?.includes("403")) {
        handleApiKeyError();
      } else {
        setToast({ message: e.message || "Cillad ayaa dhacday", type: "error" });
      }
      stopVoiceMode();
    }
  }, [activeSession, settings.language, settings.voice, isCameraActive, stopVoiceMode, handleApiKeyError]);

  const handleCopyMessage = useCallback((content: string, id: string) => {
    if (!content) return;
    navigator.clipboard.writeText(content).then(() => {
        setCopiedMessageId(id);
        setTimeout(() => setCopiedMessageId(null), 2000);
    }).catch(err => {
        console.error("Failed to copy text: ", err);
        setToast({ message: "Failed to copy", type: "error" });
    });
  }, []);

  const handleVoiceLanguageChange = useCallback((lang: LanguageType) => {
    setSettings(prev => ({ ...prev, language: lang }));
    stopVoiceMode();
    startVoiceMode(lang, settings.voice);
  }, [stopVoiceMode, startVoiceMode, settings.voice]);

  const handleVoiceChange = useCallback((voice: string) => {
    setSettings(prev => ({ ...prev, voice }));
    stopVoiceMode();
    startVoiceMode(settings.language, voice);
  }, [stopVoiceMode, startVoiceMode, settings.language]);

  const handleSendMessage = async () => {
    if ((!inputText.trim() && !pendingImage) || isStreaming || !activeSession) return;

    const currentInput = inputText;
    const currentImage = pendingImage;
    const history = [...activeSession.messages];
    
    setInputText(''); setPendingImage(null); setIsStreaming(true);

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: currentInput, timestamp: Date.now(), image: currentImage || undefined };
    const modelMsg: Message = { id: (Date.now() + 1).toString(), role: 'model', content: '', timestamp: Date.now() };

    setSessions(prev => prev.map(s => s.id === activeSession.id ? { ...s, messages: [...s.messages, userMsg, modelMsg], title: s.messages.length === 0 ? currentInput.slice(0, 30) : s.title } : s));

    try {
      if (isImageMode) {
        const imgModel = activeSession.model === ModelType.PRO ? ModelType.IMAGE_PRO : ModelType.IMAGE;
        const response = await geminiService.generateImage(currentInput, imgModel, currentImage || undefined);
        setSessions(prev => prev.map(s => s.id === activeSession.id ? { 
          ...s, 
          messages: s.messages.map(m => m.id === modelMsg.id ? { 
            ...m, 
            content: response.text || (settings.language === 'so-SO' ? "Waa kan farshaxankii aad curisay." : "Behold the masterpiece born from your vision."), 
            image: response.imageUrl,
            isImageGeneration: true
          } : m) 
        } : s));
      } else if (isVideoMode) {
        const hasKey = await (window as any).aistudio.hasSelectedApiKey();
        if (!hasKey) {
          await (window as any).aistudio.openSelectKey();
        }
        
        const videoUrls = await geminiService.generateVideo(currentInput, (status) => setVideoStatus(status), videoQuality, videoCount);
        setPendingVideos(videoUrls);
        
        setSessions(prev => prev.map(s => s.id === activeSession.id ? { 
          ...s, 
          messages: s.messages.map(m => m.id === modelMsg.id ? { 
            ...m, 
            content: settings.language === 'so-SO' ? "Fiidiyowyadii aad curisay waa diyaar." : "Your cinematic visions have been rendered.", 
            video: videoUrls[0],
            isVideoGeneration: true
          } : m) 
        } : s));
        setVideoStatus('');
      } else {
        abortControllerRef.current = new AbortController();
        const stream = geminiService.streamChat(activeSession.model, history, currentInput, activeSession.persona, currentImage || undefined, useSearch, activeSession.reasoningEnabled, settings.responseLength, abortControllerRef.current.signal);
        let full = '';
        let links: GroundingLink[] | undefined;

        for await (const chunk of stream) {
          if (chunk.text) full += chunk.text;
          if (chunk.groundingLinks) links = chunk.groundingLinks;
          setSessions(prev => prev.map(s => s.id === activeSession.id ? { ...s, messages: s.messages.map(m => m.id === modelMsg.id ? { ...m, content: full, groundingLinks: links } : m) } : s));
        }
      }
    } catch (err: any) {
      if (err.message === "API_PERMISSION_DENIED" || err.message?.includes("403")) {
        handleApiKeyError();
      } else if (err.name !== 'AbortError') {
        setToast({ message: err.message || "Khalad ayaa dhacay.", type: "error" });
      }
    } finally {
      setIsStreaming(false); abortControllerRef.current = null;
      setVideoStatus('');
    }
  };

  const createSession = (model: ModelType, persona: PersonaType) => {
    const newSession: ChatSession = { 
      id: Date.now().toString(), 
      title: settings.language === 'so-SO' ? 'Query Cusub' : 'New Session', 
      messages: [], 
      createdAt: Date.now(), 
      model, 
      persona, 
      reasoningEnabled: true 
    };
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setIsPersonaModalOpen(false);
  };

  const updateActiveSessionModel = (model: ModelType) => {
    if (!activeSessionId) return;
    setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, model } : s));
    setIsModelMenuOpen(false);
  };

  useKeyboardShortcuts({
    'mod+n': () => setIsPersonaModalOpen(true),
    'mod+b': () => setIsSidebarOpen(!isSidebarOpen),
    'mod+v': () => isVoiceModeActive ? stopVoiceMode() : startVoiceMode(),
    'mod+i': () => { setIsImageMode(!isImageMode); setIsVideoMode(false); },
    'mod+m': () => { setIsVideoMode(!isVideoMode); setIsImageMode(false); },
    'escape': () => { 
      setIsSettingsOpen(false); 
      setIsPersonaModalOpen(false); 
      setIsModelMenuOpen(false);
      if(isVoiceModeActive) stopVoiceMode(); 
    }
  });

  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-zinc-950 transition-colors duration-500 overflow-hidden text-zinc-900 dark:text-zinc-100">
      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-72 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-xl border-r border-zinc-200 dark:border-zinc-800 transition-transform duration-500 ease-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:relative lg:translate-x-0`}>
        <div className="flex flex-col h-full">
          <div className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-zinc-950 dark:bg-zinc-100 rounded-lg flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-zinc-100 dark:text-zinc-950" />
              </div>
              <span className="font-bold tracking-tight">Muha AI</span>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden hover:opacity-70"><X className="w-5 h-5" /></button>
          </div>

          <div className="px-4 mb-4">
            <button onClick={() => setIsPersonaModalOpen(true)} className="w-full flex items-center gap-2 px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity">
              <Plus className="w-4 h-4" /> {settings.language === 'so-SO' ? 'Kalfadhi Cusub' : 'New Session'}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-2 space-y-1 no-scrollbar">
            {sessions.map(s => (
              <div key={s.id} onClick={() => setActiveSessionId(s.id)} className={`group relative flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${activeSessionId === s.id ? 'bg-zinc-200/50 dark:bg-zinc-800/50' : 'hover:bg-zinc-100/50 dark:hover:bg-zinc-800/20'}`}>
                <div className={`w-2 h-2 rounded-full ${s.model === ModelType.PRO ? 'bg-amber-400' : 'bg-sky-400'}`} />
                <span className="flex-1 text-sm font-medium truncate opacity-80">{s.title}</span>
                <button onClick={(e) => { e.stopPropagation(); setSessions(prev => prev.filter(x => x.id !== s.id)); }} className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-500 transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>

          <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <button onClick={() => setIsSettingsOpen(true)} className="p-2 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 rounded-xl transition-colors opacity-60 hover:opacity-100">
              <Settings className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 px-3 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
               <div className="w-5 h-5 rounded-full bg-zinc-950 dark:bg-white flex items-center justify-center text-[10px] font-bold text-white dark:text-zinc-900">M</div>
               <span className="text-[11px] font-bold opacity-60">PRO</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col relative overflow-hidden">
        {/* Main Header */}
        <header className="h-16 flex items-center justify-between px-6 border-b border-zinc-200/50 dark:border-zinc-800/50 glass z-40 relative">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className={`p-2 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 rounded-xl transition-all ${isSidebarOpen ? 'opacity-0 scale-90 pointer-events-none' : 'opacity-100'}`}><Menu className="w-5 h-5" /></button>
            {activeSession && (
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold tracking-tight truncate max-w-[150px]">{activeSession.title}</h2>
                <div className="relative">
                  <button 
                    onClick={() => setIsModelMenuOpen(!isModelMenuOpen)}
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${activeSession.model === ModelType.PRO ? 'bg-amber-400/10 text-amber-500 border-amber-400/20' : 'bg-sky-400/10 text-sky-500 border-sky-400/20'}`}
                  >
                    {activeSession.model === ModelType.PRO ? <Cpu className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
                    {activeSession.model === ModelType.PRO ? 'PRO' : 'FLASH'}
                    <ChevronDown className={`w-3 h-3 transition-transform ${isModelMenuOpen ? 'rotate-180' : ''}`} />
                  </button>
                  
                  {isModelMenuOpen && (
                    <div className="absolute top-full left-0 mt-2 w-40 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl p-1 animate-in slide-in-from-top-1">
                      <button onClick={() => updateActiveSessionModel(ModelType.FLASH)} className="w-full flex items-center justify-between p-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg text-left transition-colors">
                        <div className="flex items-center gap-2">
                          <Zap className="w-3.5 h-3.5 text-sky-500" />
                          <span className="text-xs font-bold">Flash</span>
                        </div>
                        {activeSession.model === ModelType.FLASH && <Check className="w-3.5 h-3.5 text-sky-500" />}
                      </button>
                      <button onClick={() => updateActiveSessionModel(ModelType.PRO)} className="w-full flex items-center justify-between p-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg text-left transition-colors">
                        <div className="flex items-center gap-2">
                          <Cpu className="w-3.5 h-3.5 text-amber-500" />
                          <span className="text-xs font-bold">Pro</span>
                        </div>
                        {activeSession.model === ModelType.PRO && <Check className="w-3.5 h-3.5 text-amber-500" />}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setUseSearch(!useSearch)} className={`p-2 rounded-xl transition-all ${useSearch ? 'bg-sky-500/10 text-sky-500' : 'opacity-60 hover:opacity-100'}`} title="Google Search"><Globe className="w-5 h-5" /></button>
            <button onClick={() => { setIsImageMode(!isImageMode); setIsVideoMode(false); }} className={`p-2 rounded-xl transition-all relative ${isImageMode ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20' : 'opacity-60 hover:opacity-100'}`} title="Art Studio Mode">
               <Palette className="w-5 h-5" />
            </button>
            <button onClick={() => { setIsVideoMode(!isVideoMode); setIsImageMode(false); }} className={`p-2 rounded-xl transition-all relative ${isVideoMode ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'opacity-60 hover:opacity-100'}`} title="Movie Studio Mode">
               <Clapperboard className="w-5 h-5" />
            </button>
            <button onClick={() => startVoiceMode()} className="p-2 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 rounded-xl transition-colors opacity-60 hover:opacity-100"><Headphones className="w-5 h-5" /></button>
          </div>
        </header>

        {/* API Error Callout */}
        {showApiKeyError && (
          <div className="m-6 p-6 bg-rose-500/10 border border-rose-500/30 rounded-3xl animate-in slide-in-from-top-4">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-rose-500 rounded-2xl text-white">
                <CreditCard className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-rose-500 mb-1">Cillad Xagga API-ga Ah (403 Permission Denied)</h3>
                <p className="text-xs opacity-70 mb-4 leading-relaxed">
                  Cilladan waxay badanaa dhacdaa marka key-ga aad isticmaalayso uusan haysan oggolaanshaha model-kan (sida Veo ama Pro). 
                  Fadlan dooro API Key ka tirsan 'Paid Project' (GCP project with billing enabled).
                </p>
                <div className="flex flex-wrap gap-3">
                  <button 
                    onClick={async () => {
                      await (window as any).aistudio.openSelectKey();
                      setShowApiKeyError(false);
                    }} 
                    className="px-5 py-2.5 bg-rose-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-rose-600 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" /> Dooro Key Paid Ah
                  </button>
                  <a 
                    href="https://ai.google.dev/gemini-api/docs/billing" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="px-5 py-2.5 bg-zinc-200 dark:bg-zinc-800 rounded-xl text-xs font-bold hover:opacity-80 transition-opacity"
                  >
                    Wax badan ka baro
                  </a>
                  <button onClick={() => setShowApiKeyError(false)} className="px-5 py-2.5 text-xs font-bold opacity-50 hover:opacity-100 transition-opacity">Xir</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Chat History */}
        <main className="flex-1 overflow-y-auto px-6 py-10 space-y-8 no-scrollbar pb-32 max-w-4xl mx-auto w-full relative z-10">
          {!activeSession ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-6 animate-in fade-in duration-1000">
              <Sparkles className="w-12 h-12 text-zinc-300 dark:text-zinc-700" />
              <h1 className="text-4xl font-extrabold tracking-tighter opacity-10">Ambient Intelligence</h1>
              <button onClick={() => setIsPersonaModalOpen(true)} className="px-8 py-3 bg-zinc-950 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-950 rounded-2xl text-sm font-bold shadow-2xl hover:scale-105 active:scale-95 transition-all">
                Initialize Hub
              </button>
            </div>
          ) : (
            <>
              {activeSession.messages.map(m => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in duration-500`}>
                  <div className="max-w-[90%]">
                    <div className={`p-5 rounded-2xl group relative ${m.role === 'user' ? 'bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800' : ''}`}>
                      {m.image && (
                        <div className="relative overflow-hidden rounded-xl mb-4 shadow-2xl">
                          <img src={m.image} className="max-h-[600px] w-full object-contain" alt="AI Generated" />
                        </div>
                      )}
                      {m.video && <VideoPlayer src={m.video} className="aspect-video" />}
                      <MarkdownRenderer content={m.content} fontSize={settings.fontSize} />
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </main>

        <footer className="fixed bottom-0 left-0 right-0 lg:left-72 p-6 z-40">
          <div className="max-w-3xl mx-auto">
            {isVideoMode && !isStreaming && (
              <div className="flex items-center gap-2 mb-3 px-4 animate-in slide-in-from-bottom-1">
                <div className="flex items-center gap-1 p-1 bg-white/50 dark:bg-zinc-900/50 backdrop-blur border border-zinc-200 dark:border-zinc-800 rounded-xl">
                  {(['720p', '1080p'] as const).map(q => (
                    <button key={q} onClick={() => setVideoQuality(q)} className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase transition-all ${videoQuality === q ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20' : 'opacity-40 hover:opacity-100'}`}>
                      {q}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1 p-1 bg-white/50 dark:bg-zinc-900/50 backdrop-blur border border-zinc-200 dark:border-zinc-800 rounded-xl">
                  <span className="px-2 text-[10px] font-black uppercase opacity-30">Count:</span>
                  {[1, 2, 3].map(c => (
                    <button key={c} onClick={() => setVideoCount(c)} className={`w-7 h-6 flex items-center justify-center rounded-lg text-[10px] font-black transition-all ${videoCount === c ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20' : 'opacity-40 hover:opacity-100'}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className={`relative bg-white/80 dark:bg-zinc-900/80 backdrop-blur-2xl border transition-all duration-700 shadow-2xl p-2 flex items-end gap-2 rounded-[2.5rem] overflow-hidden ${isImageMode ? 'ring-2 ring-purple-500/40 border-purple-500/70' : isVideoMode ? 'ring-2 ring-emerald-500/40 border-emerald-500/70' : 'border-zinc-200 dark:border-zinc-800'}`}>
              <button onClick={() => startVoiceMode()} className={`p-3.5 rounded-full transition-all relative z-10 ${isVoiceModeActive ? 'bg-sky-500 text-white shadow-lg' : 'opacity-40 hover:opacity-100 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>
                <Mic className="w-5 h-5" />
              </button>
              
              <button onClick={() => { setIsImageMode(!isImageMode); setIsVideoMode(false); }} className={`p-3.5 rounded-full transition-all relative z-10 ${isImageMode ? 'bg-purple-600 text-white shadow-lg' : 'opacity-40 hover:opacity-100 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>
                <Palette className="w-5 h-5" />
              </button>

              <button onClick={() => { setIsVideoMode(!isVideoMode); setIsImageMode(false); }} className={`p-3.5 rounded-full transition-all relative z-10 ${isVideoMode ? 'bg-emerald-600 text-white shadow-lg' : 'opacity-40 hover:opacity-100 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>
                <Clapperboard className="w-5 h-5" />
              </button>
              
              <textarea 
                rows={1} 
                value={inputText} 
                onChange={(e) => setInputText(e.target.value)} 
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendMessage())} 
                placeholder={isImageMode ? "Imagine an image..." : isVideoMode ? "Describe a video scene..." : "Message Muha..."} 
                className="flex-1 bg-transparent border-none focus:ring-0 py-3.5 text-sm font-semibold resize-none max-h-48 relative z-10" 
                style={{ height: 'auto' }} 
                onInput={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }} 
              />
              
              <button onClick={handleSendMessage} disabled={isStreaming || !inputText.trim()} className="p-3.5 bg-zinc-950 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-950 rounded-full disabled:opacity-20 shadow-lg">
                {isStreaming ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </footer>
      </div>

      {/* Voice Mode Overlay */}
      {isVoiceModeActive && (
        <div className={`fixed inset-0 z-[500] backdrop-blur-[80px] flex flex-col items-center justify-center p-12 animate-in fade-in duration-700 ${settings.language === 'so-SO' ? 'bg-sky-400/20 dark:bg-sky-950/40' : 'bg-white/60 dark:bg-black/80'}`}>
          <canvas ref={canvasRef} hidden />
          <div className="absolute top-10 left-0 right-0 px-10 flex items-center justify-between z-10">
            <div className="flex items-center gap-4">
               <div className="relative group">
                <div className="flex items-center gap-3 px-5 py-2.5 bg-black/5 dark:bg-white/5 backdrop-blur-xl rounded-2xl border border-black/10 dark:border-white/10 hover:bg-black/10 dark:hover:bg-white/10 transition-all cursor-pointer">
                  <Languages className={`w-4 h-4 ${settings.language === 'so-SO' ? 'text-white' : 'text-sky-500'}`} />
                  <div className="flex flex-col items-start leading-none">
                    <span className="text-[8px] font-black uppercase tracking-widest opacity-40 mb-1">Language</span>
                    <span className="text-[11px] font-black uppercase tracking-widest opacity-90">{LANGUAGE_LABELS[settings.language]}</span>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 opacity-40 group-hover:translate-y-0.5 transition-transform" />
                  <select 
                    value={settings.language} 
                    onChange={(e) => handleVoiceLanguageChange(e.target.value as LanguageType)}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  >
                    {Object.entries(LANGUAGE_LABELS).map(([code, label]) => (
                      <option key={code} value={code} className="text-zinc-900">{label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <button onClick={stopVoiceMode} className="p-3 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-all group">
              <X className="w-6 h-6 group-hover:rotate-90 transition-transform" />
            </button>
          </div>
          <div className="space-y-16 text-center w-full max-w-2xl relative">
            <div className="relative flex justify-center items-center h-24">
              {!isMicMuted && (
                <div className="flex gap-2 items-center">
                  {[...Array(24)].map((_, i) => (
                    <div 
                      key={i} 
                      className={`w-1.5 rounded-full animate-wave ${settings.language === 'so-SO' ? 'bg-white' : 'bg-sky-500'}`} 
                      style={{ 
                        height: '40px', 
                        animationDelay: `${i * 80}ms`,
                        opacity: 0.3 + (Math.sin(i * 0.5) * 0.7)
                      }} 
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-4 px-6">
              <h2 className="text-4xl sm:text-6xl font-extrabold tracking-tighter italic leading-[1.1]">
                {voiceTranscription || "Say something..."}
              </h2>
            </div>
            <div className="flex items-center justify-center gap-12">
               <button onClick={() => setIsMicMuted(!isMicMuted)} className={`p-8 rounded-full border transition-all duration-500 ${isMicMuted ? 'bg-rose-500/10 text-rose-500 border-rose-500/30' : 'bg-sky-500 text-white border-sky-400 shadow-[0_0_60px_rgba(14,165,233,0.4)]'}`}>
                 {isMicMuted ? <MicOff className="w-10 h-10" /> : <Mic className="w-10 h-10" />}
               </button>
               <button onClick={stopVoiceMode} className="p-10 bg-zinc-900 dark:bg-zinc-100 text-rose-500 rounded-full shadow-2xl transition-all hover:scale-105 active:scale-95">
                 <PhoneOff className="w-12 h-12" />
               </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Persona Selection */}
      {isPersonaModalOpen && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-8 animate-in fade-in duration-500">
          <div className="absolute inset-0 bg-white/20 dark:bg-black/20 backdrop-blur-xl" onClick={() => setIsPersonaModalOpen(false)} />
          <div className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-[2.5rem] p-10 shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-y-auto max-h-[90vh] no-scrollbar">
            <h2 className="text-3xl font-bold tracking-tighter mb-8">Choose AI Core</h2>
            <div className="grid grid-cols-2 gap-4">
              {(['gpt5', 'doctor', 'psychologist', 'teacher', 'general', 'cbt', 'artist', 'translator', 'director'] as PersonaType[]).map(p => (
                <button key={p} onClick={() => createSession(modalModel, p)} className="p-6 rounded-2xl border border-zinc-100 dark:border-zinc-800 text-left hover:border-zinc-300 dark:hover:border-zinc-600 transition-all">
                   <h3 className="text-sm font-bold uppercase tracking-widest">{p}</h3>
                   <p className="text-[10px] font-medium opacity-50 mt-1 uppercase">Subsystem</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
};

export default App;
