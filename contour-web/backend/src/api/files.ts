import { Router, type Response } from 'express';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { authorizeProjectPath, PathNotAuthorizedError } from '../services/authorizedPaths.js';
import { openWithSystem, revealInFileManager } from '../services/hostFileActions.js';
import { ValidationError } from '../vault/validate.js';
import { CONFIG } from '../config.js';
import { loadProjects } from '../vault/loader.js';

const router = Router();

const TEXT_EXTENSIONS = new Set([
  '.md', '.txt', '.json', '.yaml', '.yml', '.csv', '.tsv', '.py', '.r', '.js', '.ts', '.tsx', '.jsx',
  '.css', '.html', '.xml', '.toml', '.ini', '.log', '.tex', '.bib', '.sh', '.ps1',
]);
const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function queryString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new ValidationError(`缺少 ${name} 参数`);
  return value;
}

function handleError(error: unknown, res: Response): void {
  if (error instanceof PathNotAuthorizedError) {
    res.status(403).json({ success: false, error: error.message });
  } else if (error instanceof ValidationError) {
    res.status(400).json({ success: false, error: error.message });
  } else {
    console.error('[本机文件 API]', error);
    res.status(500).json({ success: false, error: '本机文件操作失败' });
  }
}

async function projectAccess(projectId: string, flowId: unknown): Promise<{
  linkedFiles: string[];
  projectDir?: string;
}> {
  const projects = await loadProjects(CONFIG.VAULTS_DIR, CONFIG.LEGACY_VAULT);
  const project = projects.find((item) => item.projectId === projectId);
  if (!project) throw new PathNotAuthorizedError();
  if (flowId === undefined) return { linkedFiles: [], projectDir: project.projectDir };
  if (typeof flowId !== 'string' || !flowId.trim()) throw new ValidationError('flowId 参数无效');
  const flow = project.flows.find((item) => item.flowId === flowId);
  if (!flow) throw new PathNotAuthorizedError();
  return { linkedFiles: flow.links.map((link) => link.path), projectDir: project.projectDir };
}

async function authorizeRequestPath(
  projectId: string,
  inputPath: string,
  kind: 'file' | 'directory' | 'any' = 'any',
  flowId?: unknown,
): Promise<{ authorized: string; projectDir: string }> {
  const access = await projectAccess(projectId, flowId);
  const authorized = authorizeProjectPath(
    projectId,
    inputPath,
    kind,
    access.linkedFiles,
    access.projectDir ? [access.projectDir] : [],
  );
  return { authorized, projectDir: access.projectDir ?? '' };
}

router.get('/list', async (req, res) => {
  try {
    const projectId = queryString(req.query.projectId, 'projectId');
    const { authorized: directory, projectDir } = await authorizeRequestPath(
      projectId,
      queryString(req.query.path, 'path'),
      'directory',
      req.query.flowId,
    );
    const entries = await readdir(directory, { withFileTypes: true });
    const data = entries
      .filter((entry) => entry.isDirectory() || entry.isFile())
      .slice(0, 500)
      .map((entry) => {
        const absolutePath = path.join(directory, entry.name);
        return {
          name: entry.name,
          // 返回相对于授权根目录的相对路径
          path: projectDir ? path.relative(projectDir, absolutePath) : absolutePath,
          kind: entry.isDirectory() ? 'directory' : 'file',
        };
      })
      .sort((left, right) => left.kind.localeCompare(right.kind) || left.name.localeCompare(right.name));
    res.json({ success: true, data });
  } catch (error) {
    handleError(error, res);
  }
});

router.get('/preview', async (req, res) => {
  try {
    const projectId = queryString(req.query.projectId, 'projectId');
    const { authorized: filePath, projectDir } = await authorizeRequestPath(
      projectId,
      queryString(req.query.path, 'path'),
      'file',
      req.query.flowId,
    );
    // 返回相对于授权根目录的相对路径
    const displayPath = projectDir ? path.relative(projectDir, filePath) : filePath;
    const extension = path.extname(filePath).toLowerCase();
    if (TEXT_EXTENSIONS.has(extension)) {
      const data = await readFile(filePath);
      if (data.length > 2 * 1024 * 1024) throw new ValidationError('文本文件超过 2 MB，请使用系统程序打开');
      res.json({ success: true, data: { kind: 'text', path: displayPath, content: data.toString('utf-8') } });
      return;
    }
    if (IMAGE_MIME[extension]) {
      const data = await readFile(filePath);
      if (data.length > 10 * 1024 * 1024) throw new ValidationError('图片超过 10 MB，请使用系统程序打开');
      res.json({
        success: true,
        data: { kind: 'image', path: displayPath, dataUrl: `data:${IMAGE_MIME[extension]};base64,${data.toString('base64')}` },
      });
      return;
    }
    res.json({ success: true, data: { kind: 'external', path: displayPath } });
  } catch (error) {
    handleError(error, res);
  }
});

router.post('/open', async (req, res) => {
  try {
    const projectId = queryString(req.body?.projectId, 'projectId');
    const { authorized: target } = await authorizeRequestPath(
      projectId,
      queryString(req.body?.path, 'path'),
      'any',
      req.body?.flowId,
    );
    openWithSystem(target);
    res.json({ success: true });
  } catch (error) {
    handleError(error, res);
  }
});

router.post('/reveal', async (req, res) => {
  try {
    const projectId = queryString(req.body?.projectId, 'projectId');
    const { authorized: target } = await authorizeRequestPath(
      projectId,
      queryString(req.body?.path, 'path'),
      'any',
      req.body?.flowId,
    );
    revealInFileManager(target);
    res.json({ success: true });
  } catch (error) {
    handleError(error, res);
  }
});

export default router;
