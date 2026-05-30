// Generates registry/skill-descriptions.json from SKILL.md frontmatter descriptions in the central skills directory.
import { join } from 'node:path';
import { generateSkillDescriptionTable } from '../../packages/core/src/index.js';

const projectRoot = process.cwd();
const result = generateSkillDescriptionTable({
  skillsDir: join(projectRoot, 'skills'),
  registryPath: join(projectRoot, 'registry', 'skill-descriptions.json'),
});

console.log(JSON.stringify(result, null, 2));
