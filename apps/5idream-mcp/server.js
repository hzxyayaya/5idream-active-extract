import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio.js';
import * as z from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '..', '5idream-scraper');
const SCRIPTS_DIR = path.join(PROJECT_ROOT, 'scripts');
const OUTPUT_ROOT = path.join(PROJECT_ROOT, 'outputs', 'activities');
const MARKDOWN_DIR = path.join(OUTPUT_ROOT, 'md');
const ATTACHMENTS_DIR = path.join(OUTPUT_ROOT, 'attachments');
function resolveSafeChild(baseDir, filename) {
  const resolved = path.resolve(baseDir, filename);
  if (!resolved.startsWith(path.resolve(baseDir) + path.sep)) {
    throw new Error(`Refusing to access path outside ${baseDir}`);
  }
  return resolved;
}

function asTextResult(text, structuredContent = undefined) {
  const result = {
    content: [{ type: 'text', text }],
  };

  if (structuredContent !== undefined) {
    result.structuredContent = structuredContent;
  }

  return result;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  return JSON.parse(text);
}

async function runNodeScript(scriptName, timeoutMs = 300_000) {
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);
  const exists = await fileExists(scriptPath);
  if (!exists) {
    throw new Error(`Script not found: ${scriptPath}`);
  }

  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: PROJECT_ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let finished = false;

    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill('SIGTERM');
      reject(new Error(`Script timed out after ${timeoutMs}ms: ${scriptName}`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);

      const result = {
        script: scriptName,
        exitCode: code ?? -1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      };

      if (code === 0) {
        resolve(result);
      } else {
        reject(
          new Error(
            `Script failed: ${scriptName}\nexitCode=${result.exitCode}\nstdout=${result.stdout}\nstderr=${result.stderr}`
          )
        );
      }
    });
  });
}

async function listFiles(dir, ext) {
  const exists = await fileExists(dir);
  if (!exists) return [];

  const names = await fs.readdir(dir);
  return names
    .filter((name) => !ext || name.toLowerCase().endsWith(ext))
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
}

function createAppServer() {
  const server = new McpServer({
    name: '5idream-mcp',
    version: '1.0.0',
  });

  server.registerTool(
    'login_5idream',
    {
      title: 'Login 5idream',
      description: 'Open the 5idream site and save the login state after a manual QR-code login.',
      inputSchema: z.object({}),
    },
    async () => {
      const result = await runNodeScript('login-and-save.js', 360_000);
      return asTextResult(result.stdout || 'Login completed.', result);
    }
  );

  server.registerTool(
    'check_login_5idream',
    {
      title: 'Check 5idream Login',
      description: 'Open the 5idream site with the saved login state and report whether it still looks logged in.',
      inputSchema: z.object({}),
    },
    async () => {
      const result = await runNodeScript('open-with-state.js', 120_000);
      return asTextResult(result.stdout || 'Check completed.', result);
    }
  );

  server.registerTool(
    'detect_login_options',
    {
      title: 'Detect Login Options',
      description: 'Inspect public 5idream pages and report whether a password-based login form is visible.',
      inputSchema: z.object({}),
    },
    async () => {
      const result = await runNodeScript('detect-login-options.js', 120_000);
      return asTextResult(result.stdout || 'Detection completed.', result);
    }
  );

  server.registerTool(
    'extract_activities',
    {
      title: 'Extract Activities',
      description: 'Extract active 5idream activities into Markdown and attachment files using the saved login state.',
      inputSchema: z.object({}),
    },
    async () => {
      const result = await runNodeScript('extract-active-activities.js', 300_000);
      const indexPath = path.join(ATTACHMENTS_DIR, 'index.json');
      const indexExists = await fileExists(indexPath);
      const index = indexExists ? await readJson(indexPath) : [];
      return asTextResult(result.stdout || 'Extraction completed.', {
        ...result,
        extractedCount: index.length,
        indexPath,
      });
    }
  );

  server.registerTool(
    'list_activity_markdown',
    {
      title: 'List Activity Markdown',
      description: 'List the generated Markdown files for extracted activities.',
      inputSchema: z.object({}),
    },
    async () => {
      const files = await listFiles(MARKDOWN_DIR, '.md');
      return asTextResult(JSON.stringify(files, null, 2), { files, baseDir: MARKDOWN_DIR });
    }
  );

  server.registerTool(
    'get_activity_markdown',
    {
      title: 'Get Activity Markdown',
      description: 'Read a generated activity Markdown file.',
      inputSchema: z.object({
        filename: z.string().min(1).describe('A filename returned by list_activity_markdown, for example 01-xxx.md'),
      }),
    },
    async ({ filename }) => {
      const filePath = resolveSafeChild(MARKDOWN_DIR, filename);
      const text = await fs.readFile(filePath, 'utf8');
      return asTextResult(text, { filePath, filename });
    }
  );

  server.registerTool(
    'get_activity_index',
    {
      title: 'Get Activity Index',
      description: 'Read the extracted activity index JSON.',
      inputSchema: z.object({}),
    },
    async () => {
      const filePath = path.join(ATTACHMENTS_DIR, 'index.json');
      const data = await readJson(filePath);
      return asTextResult(JSON.stringify(data, null, 2), { filePath, count: data.length, data });
    }
  );

  server.registerTool(
    'list_activity_attachments',
    {
      title: 'List Activity Attachments',
      description: 'List attachment files generated during extraction, including txt, json, png, and index.json.',
      inputSchema: z.object({}),
    },
    async () => {
      const files = await listFiles(ATTACHMENTS_DIR);
      return asTextResult(JSON.stringify(files, null, 2), { files, baseDir: ATTACHMENTS_DIR });
    }
  );

  server.registerTool(
    'get_activity_attachment',
    {
      title: 'Get Activity Attachment',
      description: 'Read a generated txt/json attachment or return the full path for image attachments.',
      inputSchema: z.object({
        filename: z.string().min(1).describe('A filename returned by list_activity_attachments'),
      }),
    },
    async ({ filename }) => {
      const filePath = resolveSafeChild(ATTACHMENTS_DIR, filename);
      const lower = filename.toLowerCase();

      if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.webp')) {
        return asTextResult(filePath, { filePath, filename, kind: 'image' });
      }

      const text = await fs.readFile(filePath, 'utf8');
      if (lower.endsWith('.json')) {
        return asTextResult(text, { filePath, filename, kind: 'json', data: JSON.parse(text) });
      }
      return asTextResult(text, { filePath, filename, kind: 'text' });
    }
  );

  return server;
}

const server = createAppServer();
const transport = new StdioServerTransport();

await server.connect(transport);
console.error('5idream MCP server running on stdio');
