import { atom } from 'jotai';
import type { AIContextItem } from '../types';

export interface PreviewFile {
  path: string;
  name: string;
  content: string;
}

export const chatContextItemsAtom = atom<AIContextItem[]>([]);

export const previewFileAtom = atom<PreviewFile | null>(null);
