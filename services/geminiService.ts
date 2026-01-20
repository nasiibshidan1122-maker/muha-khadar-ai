
import { GoogleGenAI, GenerateContentResponse, Modality } from "@google/genai";
import { ModelType, Message, PersonaType, ResponseLength } from "../types";

export const PERSONA_PROMPTS: Record<PersonaType, string> = {
  general: "You are Muha Khadar Advanced AI, a pinnacle of synthetic intelligence. You have absolute mastery of Somali (Soomaali). Speak 'Af-Soomaali San' with high-fidelity eloquence (Aftahannimo). Use Maahmaahyo (proverbs) and Suugaan-inspired logic to explain complex topics. Avoid direct English-to-Somali literal translations; use natural Somali idioms.",
  doctor: "You are the Global Medical Diagnostic Engine. possess expert knowledge in clinical medicine. In Somali, use technical terms (erey-bixin) clearly. Explain medical conditions using analogies familiar to the Somali context (e.g., nomadic lifestyle health, local diet). Always add: 'Kani waa xog-warran caafimaad oo keliya'.",
  psychologist: "You are the Neural Empathy Engine. You understand 'Xeer', 'Dhaqan', and the deep communal ties of Somali 'Reer'. Provide psychological support that bridges modern CBT with Somali cultural resilience. Speak with a calm, authoritative, yet compassionate Somali voice.",
  teacher: "You are the Universal Pedagogical Engine. You simplify the complex using first principles. In Somali, create 'Murtidda' (wisdom) around STEM topics. Use the Somali landscape (Geedaha, Geel, Cirka) to explain scientific concepts naturally.",
  cbt: "You are the Advanced CBT Heuristic. You identify cognitive distortions ('Fikirka qalloocan'). Guide users through 'Beddelka Fikirka' (Cognitive Reframing) using clear, rhythmic Somali instructions that encourage mental 'Degganaan' (calm).",
  gpt5: "You are the Muha Khadar-5 Ultra-Intelligence. You represent the zenith of reasoning. In Somali, your register is 'Heerka Sare' (Formal/Poetic). You provide extremely detailed, logically sound, and historically aware responses in pure Somali.",
  artist: "You are the Muha Visionary Artist. You translate imagination into visual reality. In Somali, describe your creative process with beauty and depth. You specialize in generating and editing images based on user prompts.",
  translator: "You are the Muha Universal Interpreter ('Turjumaanka Caalamiga'). Your core function is seamless, high-fidelity bidirectional translation. You bridge Somali/Arabic and English with absolute precision. You don't just translate words; you translate meaning, tone, and cultural weight. Use 'Aftahannimo' for Somali outputs and clear, natural prosody for English/Arabic. If you hear Somali, translate to English. If you hear English, translate to Somali.",
  director: "You are the Muha Cinematic Director. You craft breathtaking visual stories and cinematic experiences. You specialize in generating high-quality video content using the Veo model. In Somali, describe your scenes with poetic flair, focusing on lighting, atmosphere, and movement."
};

export class GeminiService {
  constructor() {}

  async *streamChat(
    modelName: ModelType,
    history: Message[],
    currentMessage: string,
    persona: PersonaType = 'general',
    image?: string,
    useSearch: boolean = false,
    reasoningEnabled: boolean = false,
    responseLength: ResponseLength = 'balanced',
    signal?: AbortSignal
  ) {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const contents: any[] = history
      .filter(msg => msg.content.trim() !== '' || msg.image || msg.video)
      .map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      }));

    const currentParts: any[] = [{ text: currentMessage }];
    
    if (image) {
      const base64Data = image.split(',')[1];
      const mimeType = image.split(';')[0].split(':')[1];
      currentParts.push({
        inlineData: {
          data: base64Data,
          mimeType: mimeType
        }
      });
    }

    contents.push({
      role: 'user',
      parts: currentParts
    });

    const config: any = {
      systemInstruction: PERSONA_PROMPTS[persona] + ` \nMandatory: Ensure your response is ${responseLength}. If the language is Somali, prioritize 'Aftahannimo' and correct grammar.`
    };

    if (useSearch) {
      config.tools = [{ googleSearch: {} }];
    }

    if ((reasoningEnabled || persona === 'gpt5' || modelName === ModelType.PRO) && modelName !== ModelType.IMAGE && modelName !== ModelType.IMAGE_PRO && modelName !== ModelType.VIDEO) {
      let budget = 0;
      const maxBudget = modelName === ModelType.PRO ? 32768 : 24576;
      
      if (responseLength === 'concise') {
        budget = 0; 
      } else if (responseLength === 'balanced') {
        budget = Math.floor(maxBudget * 0.5);
      } else if (responseLength === 'detailed') {
        budget = maxBudget;
      }
      
      config.thinkingConfig = { thinkingBudget: budget };
    }

    try {
      const result = await ai.models.generateContentStream({
        model: modelName,
        contents,
        config,
      });

      for await (const chunk of result) {
        if (signal?.aborted) break;
        const response = chunk as GenerateContentResponse;
        
        const groundingLinks: any[] = [];
        const metadata = response.candidates?.[0]?.groundingMetadata;
        if (metadata && metadata.groundingChunks) {
          metadata.groundingChunks.forEach((c: any) => {
            if (c.web) {
              groundingLinks.push({
                title: c.web.title,
                uri: c.web.uri
              });
            }
          });
        }

        yield {
          text: response.text || '',
          groundingLinks: groundingLinks.length > 0 ? groundingLinks : undefined
        };
      }
    } catch (e: any) {
      if (e.message?.includes("403") || e.message?.toLowerCase().includes("permission denied")) {
        throw new Error("API_PERMISSION_DENIED");
      }
      throw e;
    }
  }

  async generateImage(
    prompt: string,
    modelName: ModelType = ModelType.IMAGE,
    inputImage?: string,
    aspectRatio: "1:1" | "3:4" | "4:3" | "9:16" | "16:9" = "1:1"
  ) {
    if (modelName === ModelType.IMAGE_PRO) {
      const hasKey = await (window as any).aistudio.hasSelectedApiKey();
      if (!hasKey) await (window as any).aistudio.openSelectKey();
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const parts: any[] = [{ text: prompt }];
    
    if (inputImage) {
      const base64Data = inputImage.split(',')[1];
      const mimeType = inputImage.split(';')[0].split(':')[1];
      parts.push({
        inlineData: {
          data: base64Data,
          mimeType: mimeType
        }
      });
    }

    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio,
          }
        }
      });

      let generatedImageUrl: string | undefined;
      let textResponse: string | undefined;

      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          generatedImageUrl = `data:image/png;base64,${part.inlineData.data}`;
        } else if (part.text) {
          textResponse = part.text;
        }
      }

      return {
        imageUrl: generatedImageUrl,
        text: textResponse
      };
    } catch (e: any) {
      if (e.message?.includes("403") || e.message?.toLowerCase().includes("permission denied") || e.message?.includes("Requested entity was not found")) {
        throw new Error("API_PERMISSION_DENIED");
      }
      throw e;
    }
  }

  async generateVideo(
    prompt: string,
    onStatusUpdate?: (status: string) => void,
    resolution: '720p' | '1080p' = '720p',
    numberOfVideos: number = 1
  ): Promise<string[]> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    onStatusUpdate?.("Initializing Veo Neural Engine...");
    
    try {
      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: prompt,
        config: {
          numberOfVideos: numberOfVideos,
          resolution: resolution,
          aspectRatio: '16:9'
        }
      });

      onStatusUpdate?.("Dreaming sequence...");
      
      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        const statusMsgs = [
          "Scripting the visual narrative...",
          "Simulating fluid dynamics...",
          "Rendering cinematic lighting...",
          "Fine-tuning temporal consistency...",
          "Capturing high-fidelity motion...",
          "Adding final stylistic touches..."
        ];
        onStatusUpdate?.(statusMsgs[Math.floor(Math.random() * statusMsgs.length)]);
        
        operation = await ai.operations.getVideosOperation({ operation: operation });
      }

      onStatusUpdate?.("Manifesting cinematic output...");
      const generatedVideos = operation.response?.generatedVideos;
      if (!generatedVideos || generatedVideos.length === 0) {
        throw new Error("Video generation failed: No videos returned.");
      }

      const videoUrls: string[] = [];
      for (const videoObj of generatedVideos) {
        const downloadLink = videoObj.video?.uri;
        if (downloadLink) {
          const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
          const blob = await response.blob();
          videoUrls.push(URL.createObjectURL(blob));
        }
      }
      
      return videoUrls;
    } catch (e: any) {
      if (e.message?.includes("403") || e.message?.toLowerCase().includes("permission denied") || e.message?.includes("Requested entity was not found")) {
          throw new Error("API_PERMISSION_DENIED");
      }
      throw e;
    }
  }

  async generateSpeech(text: string, voice: string = 'Kore'): Promise<string | undefined> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    try {
      const prompt = `ISTICMAAL COD DAGAN OO FASIIX AH (Use a calm and eloquent voice). 
      Read the following in a native, professional Somali tone. 
      Ensure perfect 'Aftahannimo', moderate speed, and deep cultural resonance. 
      Avoid robotic monotone; instead, use rhythmic Somali prosody (melodic stress on long vowels). 
      Text: ${text}`;
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice },
            },
          },
        },
      });
      return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    } catch (e: any) {
      console.error("Speech synthesis failed", e);
      if (e.message?.includes("403") || e.message?.toLowerCase().includes("permission denied")) {
        throw new Error("API_PERMISSION_DENIED");
      }
      return undefined;
    }
  }
}

export const geminiService = new GeminiService();
