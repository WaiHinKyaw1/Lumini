
import { GoogleGenAI, Type, GenerateContentResponse, Modality, ThinkingLevel } from "@google/genai";

// Standard client getter with fallback for build safety and provided user key
const getAIClient = () => {
  const key = (process.env.GEMINI_API_KEY || process.env.API_KEY || "").trim();
  if (!key) {
    throw new Error("Gemini API Key is missing. Please ensure GEMINI_API_KEY is set in the environment.");
  }
  return new GoogleGenAI({ apiKey: key });
};

export const generateText = async (prompt: string, systemInstruction: string) => {
  const ai = getAIClient();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      systemInstruction,
      temperature: 0.7,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
    },
  });
  return response.text || "No response generated.";
};

export const generateImage = async (prompt: string, aspectRatio: "1:1" | "16:9" | "9:16" = "1:1", imageBase64?: string, mimeType: string = 'image/png') => {
  const ai = getAIClient();
  const parts: any[] = [];
  
  if (imageBase64) {
    parts.push({ inlineData: { data: imageBase64, mimeType } });
  }
  parts.push({ text: prompt });

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts },
    config: {
      imageConfig: { 
        aspectRatio,
      }
    }
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }
  throw new Error("No image data returned from API");
};

export const generateVideo = async (prompt: string) => {
  const ai = getAIClient();
  let operation = await ai.models.generateVideos({
    model: 'veo-3.1-fast-generate-preview',
    prompt: prompt,
    config: {
      numberOfVideos: 1,
      resolution: '720p',
      aspectRatio: '16:9'
    }
  });

  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    operation = await ai.operations.getVideosOperation({operation: operation});
  }

  const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!videoUri) throw new Error("Video generation failed");

  const key = (process.env.GEMINI_API_KEY || process.env.API_KEY || "").trim();
  return `${videoUri}&key=${key}`;
};

export const generateSubtitles = async (
  fileBase64: string, 
  mimeType: string, 
  language: string = 'BURMESE'
) => {
  const ai = getAIClient();
  
  const systemInstruction = `You are a professional media transcriptionist and subtitle editor. 
Your task is to transcribe the provided audio/video file and generate a high-quality SubRip (.srt) subtitle file.

STRICT RULES:
1. Output ONLY the valid SRT content. No preamble, no markdown code blocks, no explanations.
2. Use the format:
   1
   00:00:00,000 --> 00:00:04,000
   Subtitle text here.

3. Ensure timestamps are accurate to the audio.
4. Target language: ${language}.
5. If the audio is in a different language, translate it accurately to ${language}.
6. Handle overlapping speech gracefully.`;

  const prompt = "Transcribe this media file into a professional SRT subtitle file.";

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { data: fileBase64, mimeType } },
        { text: prompt }
      ]
    },
    config: {
      systemInstruction,
      temperature: 0.1,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
    }
  });
  
  let result = response.text || "";
  // Clean up any markdown artifacts if the model ignores instructions
  result = result.replace(/```srt|```|```text/g, '').trim();
  return result;
};

export const analyzeDocument = async (
  fileBase64: string, 
  mimeType: string, 
  prompt: string, 
  systemInstruction: string,
  audioBase64?: string, 
  audioMimeType?: string
) => {
  const ai = getAIClient();
  
  const parts: any[] = [
    { inlineData: { data: fileBase64, mimeType } },
  ];

  if (audioBase64 && audioMimeType) {
    parts.push({ inlineData: { data: audioBase64, mimeType: audioMimeType } });
  }

  parts.push({ text: prompt });

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: parts
    },
    config: {
      systemInstruction: systemInstruction || "You are a helpful AI assistant analyzing provided media.",
      temperature: 0.2,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
    }
  });
  
  return response.text || "The AI was unable to generate a result.";
};

// Helper to write string to DataView
function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export const generateSpeech = async (
  text: string, 
  voice: string = 'Kore', 
  speedOffset: number = 0, 
  pitchOffset: number = 0
) => {
  const ai = getAIClient();
  
  // Clean text to ensure no prompt injection artifacts are spoken
  const cleanText = text.trim();

  let response;
  try {
    response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: cleanText }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
          },
        },
      },
    });
  } catch (err: any) {
    const errorMsg = err.message ? err.message.toUpperCase() : "";
    if (errorMsg.includes("LOAD FAILED") || errorMsg.includes("FAILED TO FETCH")) {
      throw new Error("Network request failed. Please check your internet connection, disable any adblockers, or ensure your API key is valid and unrestricted.");
    }
    throw err;
  }

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("No audio generated");

  const binaryString = atob(base64Audio);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  const sampleRate = 24000;
  const numChannels = 1;
  const bitsPerSample = 16;
  
  const buffer = new ArrayBuffer(44 + bytes.length);
  const view = new DataView(buffer);
  
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + bytes.length, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
  view.setUint16(32, numChannels * (bitsPerSample / 8), true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, 'data');
  view.setUint32(40, bytes.length, true);
  
  const audioDataView = new Uint8Array(buffer, 44);
  audioDataView.set(bytes);
  
  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
};

export const playAudio = async (url: string, onEnded?: () => void) => {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  
  try {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    
    source.onended = () => {
      if (onEnded) onEnded();
      if (ctx.state !== 'closed') ctx.close();
    };
    
    source.start(0);
    return { ctx, source };
  } catch (err) {
    console.error("Audio playback error:", err);
    if (ctx.state !== 'closed') ctx.close();
    throw err;
  }
};