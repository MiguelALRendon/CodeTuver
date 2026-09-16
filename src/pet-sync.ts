export interface PetSyncPayload {
  avatarState: string;
  avatarExpression: string;
  mouthOpen: boolean;
  activeCharacterId: string | null;
  sessionActive: boolean;
  attentionVisible: boolean;
  attentionVisualIndicator: boolean;
  attentionBubble: boolean;
  animationPoolUrls?: string[];
  poseUrl?: string;
  transitionDurationMs?: number;
}

export const PET_SYNC_EVENT = 'pet-sync';
export const PET_SYNC_REQUEST_EVENT = 'pet-sync-request';
export const PET_RESTORE_REQUESTED_EVENT = 'pet-restore-requested';
