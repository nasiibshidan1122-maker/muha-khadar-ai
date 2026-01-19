
export enum ModelType {
  FLASH = 'gemini-3-flash-preview',
  PRO = 'gemini-3-pro-preview',
  IMAGE = 'gemini-2.5-flash-image',
  IMAGE_PRO = 'gemini-3-pro-image-preview',
  VIDEO = 'veo-3.1-fast-generate-preview'
}

export type PersonaType = 'general' | 'doctor' | 'psychologist' | 'teacher' | 'cbt' | 'gpt5' | 'artist' | 'translator' | 'director';

export type ThemeType = 'light' | 'dark' | 'system';
export type FontSize = 'sm' | 'base' | 'lg' | 'xl';
export type LanguageType = 'en-US' | 'so-SO' | 'ar-SA' | 'sv-SE';
export type VisualTheme = 'default' | 'nebula' | 'ocean' | 'sunset' | 'cyber' | 'minimal' | 'aurora' | 'midnight' | 'rose' | 'forest';
export type ResponseLength = 'concise' | 'balanced' | 'detailed';

export interface UserSettings {
  theme: ThemeType;
  fontSize: FontSize;
  language: LanguageType;
  visualTheme: VisualTheme;
  speechSpeed: number;
  voice: string;
  responseLength: ResponseLength;
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  image?: string;
  video?: string;
  groundingLinks?: GroundingLink[];
  isImageGeneration?: boolean;
  isVideoGeneration?: boolean;
}

export interface GroundingLink {
  title: string;
  uri: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  model: ModelType;
  persona: PersonaType;
  reasoningEnabled?: boolean;
}
