
export enum ContentType {
  TRANSCRIPTION = 'TRANSCRIPTION',
  TRANSLATION = 'TRANSLATION',
  THUMBNAIL = 'THUMBNAIL',
  VOICEOVER = 'VOICEOVER',
  VIDEO_INSIGHTS = 'VIDEO_INSIGHTS',
  MOVIE_RECAP = 'MOVIE_RECAP',
  SUBTITLE = 'SUBTITLE',
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
  [ContentType.SPEECH]: 5,
  [ContentType.VIDEO]: 25,
  [ContentType.IMAGE]: 5,
  [ContentType.TEXT]: 1,
  [ContentType.DOCUMENT]: 3
};