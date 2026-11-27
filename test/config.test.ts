import { expect, test } from 'vitest';
import { loadConfig, loadMembers, memberByLogin } from '../src/server/config.js';
import { makeMember } from './fixtures.js';

const validEnv = {
  GITHUB_TOKEN: 't',
  GITHUB_REPOS: 'o/r',
  BACKLOG_SPACE: 'demo.backlog.com',
  BACKLOG_API_KEY: 'k',
  BACKLOG_PROJECT_KEY: 'DEMO',
};

test('thiếu GITHUB_TOKEN thì báo tên biến', () => {
  expect(() => loadConfig({ ...validEnv, GITHUB_TOKEN: undefined })).toThrow('Thiếu biến môi trường: GITHUB_TOKEN');
});

test('mặc định POLL_SECONDS=60, PORT=4800, AGENT_MARKERS', () => {
  const c = loadConfig(validEnv);
  expect(c.pollSeconds).toBe(60);
  expect(c.port).toBe(4800);
  expect(c.agentMarkers).toEqual(['Generated with Claude Code']);
  expect(c.membersFile).toBe('config/members.yaml');
  expect(c.dataDir).toBe('data');
});

test('GITHUB_REPOS tách theo dấu phẩy, bỏ khoảng trắng', () => {
  expect(loadConfig({ ...validEnv, GITHUB_REPOS: 'a/b, c/d' }).github.repos).toEqual(['a/b', 'c/d']);
});

test('STATUS_MAP đọc JSON', () => {
  expect(loadConfig({ ...validEnv, STATUS_MAP: '{"Chờ QA":"done"}' }).statusMap).toEqual({ 'Chờ QA': 'done' });
});

test('memberByLogin không phân biệt hoa thường, nhiều login', () => {
  const m = makeMember({ github: ['user-a', 'user-a-bot'] });
  expect(memberByLogin([m], 'User-A')?.key).toBe(m.key);
  expect(memberByLogin([m], 'user-a-bot')?.key).toBe(m.key);
  expect(memberByLogin([m], 'ghost')).toBeUndefined();
});

test('loadMembers đọc members.example.yaml, login chữ thường', () => {
  const ms = loadMembers('config/members.example.yaml');
  expect(ms.length).toBeGreaterThan(0);
  expect(ms[0]).toMatchObject({ key: 'm01', backlogUserId: 1001, github: ['user-a'], role: 'dev' });
});
