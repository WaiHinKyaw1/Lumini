
import { GoogleGenAI, Type, GenerateContentResponse, Modality, ThinkingLevel } from "@google/genai";

// Standard client getter with fallback for build safety and provided user key
const getAIClient = () => {
  let key = '';
  try {
    key = localStorage.getItem('VITE_GEMINI_API_KEY') || (import.meta.env.VITE_GEMINI_API_KEY) || (typeof process !== 'undefined' ? (process.env.GEMINI_API_KEY || process.env.API_KEY) : '');
  } catch (e) {
    // Ignore
  }
  key = (key || "").trim();
  
  if (!key) {
    throw new Error("Gemini API Key is missing. Please ensure GEMINI_API_KEY is set in your environment or app settings.");
  }
  return new GoogleGenAI({ apiKey: key });
};

export const generateText = async (prompt: string, systemInstruction: string) => {
  const ai = getAIClient();
  const response = await ai.models.generateContent({
    model: 'gemini-3.5-flash',
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
    model: 'veo-3.1-lite-generate-preview',
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

  let key = '';
  try {
    key = (import.meta.env.VITE_GEMINI_API_KEY) || (typeof process !== 'undefined' ? (process.env.GEMINI_API_KEY || process.env.API_KEY || "") : "");
  } catch (e) {
    // Ignore
  }
  key = (key || "").trim();
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
    model: 'gemini-3.5-flash',
    contents: {
      parts: [
        { inlineData: { data: fileBase64, mimeType } },
        { text: prompt }
      ]
    },
    config: {
      systemInstruction,
      temperature: 0.1,
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
    model: 'gemini-3.5-flash',
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

export const analyzeDocumentStream = async (
  fileBase64: string, 
  mimeType: string, 
  prompt: string, 
  systemInstruction: string,
  onChunk: (chunk: string) => void,
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

  const responseStream = await ai.models.generateContentStream({
    model: 'gemini-3.5-flash',
    contents: {
      parts: parts
    },
    config: {
      systemInstruction: systemInstruction || "You are a helpful AI assistant analyzing provided media.",
      temperature: 0.2,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
    }
  });
  
  let fullText = "";
  for await (const chunk of responseStream) {
    const text = chunk.text || "";
    fullText += text;
    onChunk(text);
  }
  return fullText;
};

// Helper to write string to DataView
function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// Subtitle chunking helper to keep sentences natural, avoiding truncation or quality drop for long text
const splitTextIntoChunks = (text: string, maxLength: number = 350): string[] => {
  // Regex splitting on Burmese period (။), English period (.), exclamation (!), question mark (?), or newlines
  const segments = text.split(/(?<=[။\.!\?\n\r\t])/);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) continue;

    if ((currentChunk + " " + trimmed).length > maxLength) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = trimmed;
      } else {
        chunks.push(trimmed);
        currentChunk = "";
      }
    } else {
      currentChunk = currentChunk ? currentChunk + " " + trimmed : trimmed;
    }
  }
  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }
  return chunks;
};

interface SpeechSegment {
  text: string;
  voice: string;
}

// Parses text into speaker segments if speaker tags such as [NILAR] or [THIHA] are present
const parseSpeechSegments = (text: string, defaultVoice: string, voiceMap?: any): SpeechSegment[] => {
  const segments: SpeechSegment[] = [];
  const normalizedVoiceMap: Record<string, string> = {
    'THIHA': 'Fenrir',
    'NILAR': 'Kore',
    'MIN KHANT': 'Puck',
    'MAY THU': 'Zephyr',
    'CHARON': 'Charon',
    ...voiceMap
  };

  const upperVoiceMap: Record<string, string> = {};
  for (const k of Object.keys(normalizedVoiceMap)) {
    upperVoiceMap[k.toUpperCase()] = normalizedVoiceMap[k];
  }

  const regex = /\[([A-Z0-9a-z\s_-]+)\]/g;
  let currentVoice = defaultVoice;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const speechPart = text.substring(lastIndex, match.index).trim();
    if (speechPart) {
      segments.push({ text: speechPart, voice: currentVoice });
    }
    
    const speakerTag = match[1].trim().toUpperCase();
    if (upperVoiceMap[speakerTag]) {
      currentVoice = upperVoiceMap[speakerTag];
    } else {
      currentVoice = defaultVoice;
    }
    lastIndex = regex.lastIndex;
  }

  const remainingPart = text.substring(lastIndex).trim();
  if (remainingPart) {
    segments.push({ text: remainingPart, voice: currentVoice });
  }

  if (segments.length === 0 && text.trim()) {
    segments.push({ text: text.trim(), voice: defaultVoice });
  }

  return segments;
};

// Safely decode any audio base64 returned by Gemini into an AudioBuffer using the browser's standard AudioContext
const decodeBase64ToAudioBuffer = async (ctx: AudioContext, base64: string): Promise<AudioBuffer> => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return await ctx.decodeAudioData(bytes.buffer);
};

// Seamlessly join multiple audio chunks into a single clean stream
const concatenateAudioBuffers = (ctx: AudioContext, buffers: AudioBuffer[]): AudioBuffer => {
  if (buffers.length === 0) {
    return ctx.createBuffer(1, 1, 24000);
  }
  const numberOfChannels = buffers[0].numberOfChannels;
  const sampleRate = buffers[0].sampleRate;
  
  let totalLength = 0;
  for (const b of buffers) {
    totalLength += b.length;
  }
  
  const outBuffer = ctx.createBuffer(numberOfChannels, totalLength, sampleRate);
  
  for (let channel = 0; channel < numberOfChannels; channel++) {
    const outData = outBuffer.getChannelData(channel);
    let offset = 0;
    for (const b of buffers) {
      outData.set(b.getChannelData(channel), offset);
      offset += b.length;
    }
  }
  
  return outBuffer;
};

// Standard clean PCM WAV generation from Float32 AudioBuffer
const audioBufferToWav = (buffer: AudioBuffer): Blob => {
  const numOfChan = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  let result;
  if (numOfChan === 2) {
    result = interleave(buffer.getChannelData(0), buffer.getChannelData(1));
  } else {
    result = buffer.getChannelData(0);
  }
  
  const bufferLength = result.length * 2;
  const wavBuffer = new ArrayBuffer(44 + bufferLength);
  const view = new DataView(wavBuffer);
  
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + bufferLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numOfChan, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numOfChan * (bitDepth / 8), true);
  view.setUint16(32, numOfChan * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, bufferLength, true);
  
  floatTo16BitPCM(view, 44, result);
  
  return new Blob([wavBuffer], { type: 'audio/wav' });
};

const interleave = (inputL: Float32Array, inputR: Float32Array): Float32Array => {
  const length = inputL.length + inputR.length;
  const result = new Float32Array(length);
  let index = 0;
  let inputIndex = 0;
  
  while (index < length) {
    result[index++] = inputL[inputIndex];
    result[index++] = inputR[inputIndex];
    inputIndex++;
  }
  return result;
};

const floatTo16BitPCM = (output: DataView, offset: number, input: Float32Array) => {
  for (let i = 0; i < input.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
};

const getVoiceDirectionPrompt = (voice: string, tone?: string): string => {
  const normVoice = (voice || "").trim().toLowerCase();
  const normTone = (tone || "").trim().toLowerCase();
  
  let basePrompt = "";
  
  // Custom tone overlay instructions matching movie recap style or user selections
  let tonePrompt = "";
  if (normTone === 'thrilling') {
    tonePrompt = " Speeches must sound incredibly thrilling, fast-paced, dramatic, and extremely exciting like a professional movie recap voiceover.";
  } else if (normTone === 'sarcastic') {
    tonePrompt = " Speeches must sound playfully sarcastic, witty, slightly cynical, and highly engaging with mocking expressions.";
  } else if (normTone === 'emotional') {
    tonePrompt = " Speeches must sound deeply emotional, expressive, warm, and highly heartfelt, conveying rich feelings.";
  } else if (normTone === 'mystery') {
    tonePrompt = " Speeches must sound highly mysterious, slow, suspenseful, deep, and intriguing, keeping audiences on the edge of their seats.";
  } else if (normTone === 'professional') {
    tonePrompt = " Speeches must sound perfectly professional, calm, authoritative, prestigious, and clear, like standard news broadcasting.";
  } else if (normTone === 'sweet') {
    tonePrompt = " Speeches must sound sweet, gentle, natural, warm, friendly, and beautifully conversational like a friendly storyteller.";
  }
  
  if (normVoice.includes("fenrir")) {
    basePrompt = "သတင်း သို့မဟုတ် ကွန်မြူနတီ ကြေညာချက်ဖတ်နေသလိုမျိုး လေးနက်ပြီး ပြတ်သားကြည်လင်တဲ့ ခန့်ညားပြီး ဩဇာအပြည့်ရှိတဲ့ပုံစံနဲ့ ဖတ်ပေးပါ။ Speeches must sound powerful, highly clear, authoritative, and professional.";
  } else if (normVoice.includes("kore")) {
    basePrompt = "ချိုသာကြည်လင်အေးချမ်းတဲ့ နေ့စဉ်စကားပြောပုံစံ သို့မဟုတ် စိတ်ဝင်စားစရာပုံပြင်ပြောပြနေသလို သဘာဝကျပြီး သာယာချိုအေးတဲ့ပုံစံနဲ့ ဖတ်ပေးပါ။ Speeches must sound sweet, natural, friendly, and perfectly flowing.";
  } else if (normVoice.includes("puck")) {
    basePrompt = "မြန်မာ movie recap channel သို့မဟုတ် Review ကြည့်နေရသလိုမျိုး စိတ်လှုပ်ရှားစရာကောင်းပြီး လျင်မြန်တက်ကြွတဲ့ narration style နဲ့ ပရိသတ်ကို ဆွဲဆောင်နိုင်တဲ့အသံနေအသံထားမျိုးနဲ့ ဖတ်ပေးပါ။ Speeches must sound exceptionally energetic, fast-paced, exciting, and highly authentic.";
  } else if (normVoice.includes("zephyr")) {
    basePrompt = "နူးညံ့သိမ်မွေ့ပြီး စိတ်ခံစားမှုအပြည့်နဲ့ ကဗျာဆန်ဆန် ညင်သာကြည်နူးဖွယ်ကောင်းတဲ့ အသံနေအသံထားမျိုးနဲ့ ဖတ်ပေးပါ။ Speeches must sound exceptionally soft, sweet, poetic, and emotionally warm.";
  } else if (normVoice.includes("charon")) {
    basePrompt = "Please read this in a deep, professional, high-fidelity formal native narration tone. Speeches must sound exceptionally crisp, deep, and authoritative.";
  } else {
    // Default fallback
    basePrompt = "မြန်မာ movie recap channel ကြည့်နေရသလိုမျိုး စိတ်လှုပ်ရှားစရာကောင်းပြီး လျင်မြန်တဲ့ narration style နဲ့ ပရိသတ်ကို ဆွဲဆောင်နိုင်တဲ့အသံနေအသံထားမျိုးနဲ့ ဖတ်ပေးပါ။ Speeches should sound highly energetic, natural, and authentic.";
  }

  return `${basePrompt}${tonePrompt}`;
};

const synthesizeSingleChunk = async (
  ai: ReturnType<typeof getAIClient>,
  text: string,
  voice: string,
  speedPrompt: string,
  pitchPrompt: string,
  tone?: string
): Promise<string> => {
  const cleanText = text.trim();
  const directionPrompt = getVoiceDirectionPrompt(voice, tone);
  const storytellingPrompt = `${directionPrompt} Do NOT read any instructions, metadata, or speaker tags; read ONLY the actual Burmese or English script text. ${speedPrompt}${pitchPrompt} Text: ${cleanText}`;

  const MAX_RETRIES = 3;
  let attempt = 0;

  while (attempt <= MAX_RETRIES) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: storytellingPrompt }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) throw new Error("No audio generated");
      return base64Audio;
    } catch (err: any) {
      const errorMsg = err.message ? err.message.toUpperCase() : "";
      const isQuotaError = errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("QUOTA EXCEEDED") || errorMsg.includes("429");
      
      if (isQuotaError && attempt < MAX_RETRIES) {
        attempt++;
        const delay = Math.pow(2, attempt) * 1500 + Math.random() * 1000;
        console.warn(`Quota limit exceeded during single-chunk voice generation. Retrying in ${delay}ms... (Attempt ${attempt}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      console.error(`Audio synthesis failed for script segment:`, err);
      throw err;
    }
  }
  throw new Error("Max retries exceeded for audio segment generation.");
};

export const generateSpeech = async (
  text: string, 
  voice: string = 'Kore', 
  speedOffset: number = 0, 
  pitchOffset: number = 0,
  voiceMap?: any,
  tone?: string
) => {
  const ai = getAIClient();
  const rawText = text.trim();

  if (!rawText) {
    throw new Error("Voiceover text is empty.");
  }

  // Speed and pitch prompting guidance values
  let speedPrompt = "";
  if (speedOffset !== 0) {
    if (speedOffset >= 0.5 && speedOffset <= 2.0) {
      speedPrompt = ` Please adjust your speaking pace to exactly ${speedOffset}x speed.`;
    } else if (speedOffset > 0) {
      speedPrompt = ` Please speak faster (speed rate adjustment: +${speedOffset}%).`;
    } else if (speedOffset < 0) {
      speedPrompt = ` Please speak slower (speed rate adjustment: ${speedOffset}%).`;
    }
  }

  let pitchPrompt = "";
  if (pitchOffset !== 0) {
    if (pitchOffset > 0) {
      pitchPrompt = ` Adjust your vocal pitch to be higher (+${pitchOffset}%).`;
    } else {
      pitchPrompt = ` Adjust your vocal pitch to be lower (${pitchOffset}%).`;
    }
  }

  // Parse text into logical speaker segments (supports dynamic speaker tags like [NILAR] or [THIHA])
  const parsedSegments = parseSpeechSegments(rawText, voice, voiceMap);

  // Split any segment further into smaller sub-chunks if they are too long to ensure highest sound quality
  const subChunks: SpeechSegment[] = [];
  for (const segment of parsedSegments) {
    const chunks = splitTextIntoChunks(segment.text, 350); // Set chunk limit to 350 characters for maximum voice continuity and natural phrase flow
    for (const chunk of chunks) {
      subChunks.push({ text: chunk, voice: segment.voice });
    }
  }

  if (subChunks.length === 0) {
    throw new Error("Could not split speech text into valid chunks.");
  }

  // Synthesize chunks in batches with limited concurrency to avoid exceeding key rate limits while maximizing speed
  const base64Chunks: string[] = new Array(subChunks.length);
  const BATCH_SIZE = 3;

  for (let i = 0; i < subChunks.length; i += BATCH_SIZE) {
    const batch = subChunks.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (chunk, index) => {
      const actualIndex = i + index;
      const b64 = await synthesizeSingleChunk(ai, chunk.text, chunk.voice, speedPrompt, pitchPrompt, tone);
      if (b64) {
        base64Chunks[actualIndex] = b64;
      }
    });
    await Promise.all(promises);
  }

  // Setup AudioContext for standard decoding and join operations
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioContextClass();
  const buffers: AudioBuffer[] = [];

  for (const b64 of base64Chunks) {
    if (b64) {
      try {
        const buf = await decodeBase64ToAudioBuffer(ctx, b64);
        buffers.push(buf);
      } catch (decodeErr) {
        console.error("Failed to decode speech chunk base64 data to audio buffer", decodeErr);
      }
    }
  }

  if (buffers.length === 0) {
    ctx.close();
    throw new Error("Failed to decode any generated speech chunks successfully.");
  }

  // Join the individual decoded frames together
  const concatenatedBuffer = concatenateAudioBuffers(ctx, buffers);

  // Close the audio parser context to release browser resources
  ctx.close();

  // Dynamic float-sample conversion to WAV Blob
  const wavBlob = audioBufferToWav(concatenatedBuffer);
  return URL.createObjectURL(wavBlob);
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