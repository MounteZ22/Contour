import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export type ShellView = 'contour' | 'agent' | 'settings';

export const sidebarCollapsedAtom = atomWithStorage<boolean>('contour-sidebar-collapsed', false);

export const activeViewAtom = atom<ShellView>('contour');

export const rightPanelOpenAtom = atomWithStorage<boolean>('contour-right-panel-open', true);

export const rightPanelWidthAtom = atomWithStorage<number>('contour-right-panel-width', 320);

export const currentProjectIdAtom = atomWithStorage<string | null>('contour-current-project-id', null);
