#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const manifestPath = path.join(root, 'skills.json');
const skillsDir = path.join(root, 'skills');

function fail(message) {
  console.error(`validate-skills: ${message}`);
  process.exitCode = 1;
}

function parseFrontMatter(filePath, contents) {
  if (!contents.startsWith('---\n')) {
    fail(`${filePath} is missing YAML front matter`);
    return {};
  }

  const end = contents.indexOf('\n---', 4);
  if (end === -1) {
    fail(`${filePath} has unterminated YAML front matter`);
    return {};
  }

  const fields = {};
  const frontMatter = contents.slice(4, end).split('\n');
  for (const line of frontMatter) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.+)$/);
    if (match) {
      fields[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
    }
  }
  return fields;
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

if (!Array.isArray(manifest.skills)) {
  fail('skills.json must contain a skills array');
}

const manifestIds = new Set();
const manifestPaths = new Set();

for (const skill of manifest.skills ?? []) {
  if (!skill || typeof skill.id !== 'string' || typeof skill.path !== 'string') {
    fail('each skills.json entry must include string id and path fields');
    continue;
  }

  if (manifestIds.has(skill.id)) {
    fail(`duplicate skill id in manifest: ${skill.id}`);
  }
  manifestIds.add(skill.id);

  if (manifestPaths.has(skill.path)) {
    fail(`duplicate skill path in manifest: ${skill.path}`);
  }
  manifestPaths.add(skill.path);

  const expectedPath = `skills/${skill.id}/SKILL.md`;
  if (skill.path !== expectedPath) {
    fail(`${skill.id} path should be ${expectedPath}, got ${skill.path}`);
  }

  const absolutePath = path.join(root, skill.path);
  let contents;
  try {
    contents = await readFile(absolutePath, 'utf8');
  } catch {
    fail(`${skill.path} does not exist`);
    continue;
  }

  const fields = parseFrontMatter(skill.path, contents);
  if (fields.name !== skill.id) {
    fail(`${skill.path} front matter name should be ${skill.id}, got ${fields.name || 'missing'}`);
  }
  if (!fields.description) {
    fail(`${skill.path} front matter is missing description`);
  }
}

const actualSkillDirs = await readdir(skillsDir, { withFileTypes: true });
for (const entry of actualSkillDirs) {
  if (!entry.isDirectory()) {
    continue;
  }

  const skillPath = `skills/${entry.name}/SKILL.md`;
  if (!manifestPaths.has(skillPath)) {
    fail(`${skillPath} exists but is missing from skills.json`);
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log(`Validated ${manifestIds.size} skills.`);
