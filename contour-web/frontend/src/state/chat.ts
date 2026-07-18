import { atom } from 'jotai';
import type { AIContextItem } from '../types';

export interface PreviewFile {
  path: string;
  name: string;
  kind: 'text' | 'image';
  content?: string;
  dataUrl?: string;
  projectId: string;
  flowId?: string;
}

export const chatContextItemsAtom = atom<AIContextItem[]>([]);

export const previewFileAtom = atom<PreviewFile | null>(null);
