import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import type { AIContextItem } from '../types';

export interface PreviewFile {
  path: string;
  name: string;
  kind: 'text' | 'image' | 'pdf' | 'xlsx';
  content?: string;
  dataUrl?: string;
  projectId: string;
  flowId?: string;
}

export const chatContextItemsAtom = atom<AIContextItem[]>([]);

/** 按会话保存的输入框草稿，切换会话或刷新页面后仍可恢复。 */
export const chatDraftsAtom = atomWithStorage<Record<string, string>>('contour:chat-drafts', {});

/** Plan Mode 开关状态 */
export const planModeEnabledAtom = atom<boolean>(false);

export const previewFileAtom = atom<PreviewFile | null>(null);
