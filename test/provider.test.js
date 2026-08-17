/** Unit test for the ctx.skills provider. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerStyleSkillProvider } from '../lib/provider.js';

function mockRegistry() {
  const state = { provider: null, control: null };
  return {
    state,
    skills: {
      registerProvider(create) {
        const control = {
          signal: new AbortController().signal,
          invalidated: 0,
          invalidate() { this.invalidated += 1; },
        };
        state.control = control;
        state.provider = create(control);
        return () => { state.provider = null; };
      },
    },
  };
}

test('provider lists bundles and loads definitions from the skills root', async () => {
  const root = join(mkdtempSync(join(tmpdir(), 'dus-prov-')), 'skills');
  await fs.mkdir(join(root, 'ui-style-acme-com'), { recursive: true });
  await fs.writeFile(join(root, 'ui-style-acme-com', 'SKILL.md'), [
    '---',
    'name: ui-style-acme-com',
    'description: Acme UI style.',
    'whenToUse: Use for Acme-branded UI.',
    'metadata:',
    '  kind: ui-style',
    '---',
    '',
    '# Acme Style',
    '',
    'Body text.',
  ].join('\n'), 'utf8');
  // Non-skill entries are ignored.
  await fs.mkdir(join(root, 'Not A Skill'), { recursive: true });
  await fs.writeFile(join(root, 'random.md'), 'no frontmatter', 'utf8');

  const { state, skills } = mockRegistry();
  const controlRef = { current: null };
  const dispose = registerStyleSkillProvider(skills, root, controlRef);
  assert.ok(state.provider);
  assert.equal(controlRef.current, state.control);

  const candidates = await state.provider.list({});
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].name, 'ui-style-acme-com');
  assert.equal(candidates[0].description, 'Acme UI style.');
  assert.equal(candidates[0].whenToUse, 'Use for Acme-branded UI.');
  assert.equal(candidates[0].provider, 'dsh-ui-style');
  assert.deepEqual(candidates[0].invocation, { modelInvocable: true, userInvocable: true });

  const definition = await state.provider.get(candidates[0], {});
  assert.equal(definition.name, 'ui-style-acme-com');
  assert.match(definition.content, /# Acme Style/);
  assert.match(definition.content, /Body text\./);
  assert.ok(!definition.content.includes('name:'), 'frontmatter is stripped from the body');

  // A renamed bundle no longer matches the stale candidate.
  const stale = await state.provider.get({ ...candidates[0], name: 'ui-style-other' }, {});
  assert.equal(stale, undefined);

  state.control.invalidate();
  assert.equal(state.control.invalidated, 1);
  dispose();
  assert.equal(state.provider, null);
});

test('provider tolerates a missing skills root', async () => {
  const { state, skills } = mockRegistry();
  registerStyleSkillProvider(skills, join(tmpdir(), 'dus-prov-missing', 'skills'));
  const candidates = await state.provider.list({});
  assert.deepEqual(candidates, []);
});
