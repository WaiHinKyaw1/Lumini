
export enum ContentType {
  TRANSCRIPTION = 'TRANSCRIPTION',
  TRANSLATION = 'TRANSLATION',
  THUMBNAIL = 'THUMBNAIL',
  VOICEOVER = 'VOICEOVER',
  VIDEO_INSIGHTS = 'VIDEO_INSIGHTS',
  MOVIE_RECAP = 'MOVIE_RECAP',
  SUBTITLE = 'SUBTITLE',
  SOCIAL_GEN = 'SOCIAL_GEN',
  AUTO_CAPTION = 'AUTO_CAPTION',
  VIDEO_TRIMMER = 'VIDEO_TRIMMER',
  AI_AVATAR = 'AI_AVATAR',
  SPEECH = 'SPEECH',
  VIDEO = 'VIDEO',
  IMAGE = 'IMAGE',
  TEXT = 'TEXT',
  DOCUMENT = 'DOCUMENT'
}

export interface UserStats {
  credits: number;
  totalGenerated: number;
}

export interface CreditCosts {
  [ContentType.TRANSCRIPTION]: number;
  [ContentType.TRANSLATION]: number;
  [ContentType.THUMBNAIL]: number;
  [ContentType.VOICEOVER]: number;
  [ContentType.VIDEO_INSIGHTS]: number;
  [ContentType.MOVIE_RECAP]: number;
  [ContentType.SUBTITLE]: number;
  [ContentType.SOCIAL_GEN]: number;
  [ContentType.AUTO_CAPTION]: number;
  [ContentType.VIDEO_TRIMMER]: number;
  [ContentType.AI_AVATAR]: number;
  [ContentType.SPEECH]: number;
  [ContentType.VIDEO]: number;
  [ContentType.IMAGE]: number;
  [ContentType.TEXT]: number;
  [ContentType.DOCUMENT]: number;
}

export const CREDIT_COSTS: CreditCosts = {
  [ContentType.TRANSCRIPTION]: 10,
  [ContentType.TRANSLATION]: 10,
  [ContentType.THUMBNAIL]: 8,
  [ContentType.VOICEOVER]: 5,
  [ContentType.VIDEO_INSIGHTS]: 10,
  [ContentType.MOVIE_RECAP]: 15,
  [ContentType.SUBTITLE]: 12,
  [ContentType.SOCIAL_GEN]: 5,
  [ContentType.AUTO_CAPTION]: 15,
  [ContentType.VIDEO_TRIMMER]: 15,
  [ContentType.AI_AVATAR]: 30,
  [ContentType.SPEECH]: 5,
  [ContentType.VIDEO]: 25,
  [ContentType.IMAGE]: 5,
  [ContentType.TEXT]: 1,
  [ContentType.DOCUMENT]: 3
};