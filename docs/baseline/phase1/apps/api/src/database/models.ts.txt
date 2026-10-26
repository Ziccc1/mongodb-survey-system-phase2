import type { ObjectId } from 'mongodb';
export interface UserDocument { _id: ObjectId; schemaVersion: number; username: string; usernameKey: string; passwordHash: string; createdAt: Date; updatedAt: Date }
export interface SurveyDocument {
  _id: ObjectId; schemaVersion: number; ownerId: ObjectId; publicId: string;
  title: string; description: string; status: 'draft' | 'published' | 'paused' | 'closed';
  allowAnonymous: boolean; allowRepeat: boolean; expiresAt: Date | null;
  definitionVersion: number; revision: number; currentPublishedVersion: number | null;
  currentVersionSubmissionCount: number; submissionCount: number; structureLocked: boolean;
  questions: unknown[]; copiedFromId: ObjectId | null; firstPublishedAt: Date | null; createdAt: Date; updatedAt: Date;
}
