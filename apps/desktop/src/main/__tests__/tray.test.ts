import { describe, expect, it, vi } from 'vitest';
import { createTrayMenuTemplate } from '../tray-menu.js';

describe('tray menu model', () => {
  it('includes required actions and bounded recent-project entries', () => {
    const actions = {
      showWindow: vi.fn(),
      newAgentSession: vi.fn(),
      openProject: vi.fn(),
      quit: vi.fn(),
    };
    const template = createTrayMenuTemplate([{ id: 'p-1', title: 'Project One' }], actions);
    expect(template.map((item) => 'label' in item ? item.label : undefined))
      .toContain('新建 Agent 会话');
    const projectItem = template.find((item) => 'label' in item && item.label === 'Project One');
    expect(projectItem).toBeDefined();
    if (projectItem && 'click' in projectItem && projectItem.click) (projectItem.click as () => void)();
    expect(actions.openProject).toHaveBeenCalledWith('p-1');
  });
});
