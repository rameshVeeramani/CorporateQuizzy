import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGameBackend } from '../../src/backend.js';
import { deterministicCrypto, MemoryStorage } from '../helpers.js';

const quiz = { title: 'Quiz', scoring: 'speed', questions: [{ text: 'Q?', options: ['A', 'B', 'C', 'D'], correct: 0, seconds: 20 }] };
let local;
let session;
let cryptoApi;
let calls;
let client;
function makeBackend(handler = async () => ({ data: {}, error: null }), options = {}) {
  calls = [];
  client = {
    rpc: vi.fn(async (name, args) => { calls.push({ name, args }); return handler(name, args); }),
    channel: vi.fn(() => ({ on: vi.fn(function () { return this; }), subscribe: vi.fn(function () { return this; }) })),
    removeChannel: vi.fn(),
  };
  return createGameBackend({ client, configured: true, storage: local, session, cryptoApi, random: options.random || (() => 0.1) });
}

beforeEach(() => { local = new MemoryStorage(); session = new MemoryStorage(); cryptoApi = deterministicCrypto(); });

describe('game backend credentials and room creation', () => {
  it('creates a persistent host identity and creates a room using its secret', async () => {
    const api = makeBackend(async () => ({ data: { game_id: 'game-1', pin: '190000' }, error: null }));
    const created = await api.create(quiz);
    expect(created).toMatchObject({ id: 'game-1', pin: '190000', hostId: '00000000-0000-4000-8000-000000000001' });
    expect(created.credential).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(local.getItem('quizzy-host-identity'))).toEqual({ id: created.hostId, credential: created.credential });
    expect(calls[0]).toEqual({ name: 'quizzy_create_game', args: { p_pin: '190000', p_host_id: created.hostId, p_credential: created.credential, p_quiz: quiz } });
  });

  it('reuses the stored host identity and retries PIN collisions', async () => {
    local.setItem('quizzy-host-identity', JSON.stringify({ id: '00000000-0000-4000-8000-000000000099', credential: 'kept-secret' }));
    const handler = vi.fn().mockResolvedValueOnce({ error: { message: 'PIN_COLLISION' } }).mockResolvedValueOnce({ data: { game_id: 'g2', pin: '190000' }, error: null });
    const api = makeBackend(handler);
    const result = await api.create(quiz);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(result.hostId).toBe('00000000-0000-4000-8000-000000000099');
    expect(result.credential).toBe('kept-secret');
  });

  it('retries the alternate “taken” collision wording and stops after four collisions', async () => {
    const handler = vi.fn().mockResolvedValueOnce({ error: { message: 'PIN already taken' } }).mockResolvedValueOnce({ data: { game_id: 'g', pin: '190000' }, error: null });
    await expect(makeBackend(handler).create(quiz)).resolves.toMatchObject({ id: 'g' });
    const repeated = vi.fn().mockResolvedValue({ error: { message: 'PIN_COLLISION' } });
    await expect(makeBackend(repeated).create(quiz)).rejects.toThrow('That room PIN was just taken.');
    expect(repeated).toHaveBeenCalledTimes(4);
  });

  it('stops on a non-collision error', async () => {
    const handler = vi.fn().mockResolvedValue({ error: { message: 'INVALID_GAME' } });
    await expect(makeBackend(handler).create(quiz)).rejects.toThrow('INVALID_GAME');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('keeps room creation available when host identity storage is blocked', async () => {
    const brokenStorage = { getItem: () => null, setItem: () => { throw new Error('blocked'); } };
    const client = { rpc: vi.fn(async () => ({ data: { game_id: 'game-volatile', pin: '190000' }, error: null })) };
    const api = createGameBackend({ client, configured: true, storage: brokenStorage, session, cryptoApi: { getRandomValues: cryptoApi.getRandomValues } });
    const created = await api.create(quiz);
    expect(created).toMatchObject({ id: 'game-volatile', pin: '190000' });
    expect(created.hostId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(api.getHostIdentity()).toMatchObject({ id: created.hostId, credential: created.credential });
    expect(client.rpc).toHaveBeenCalledOnce();
  });

  it('replaces a malformed host identity with a valid one', async () => {
    local.setItem('quizzy-host-identity', '{bad');
    const api = makeBackend();
    const created = await api.create(quiz);
    expect(JSON.parse(local.getItem('quizzy-host-identity'))).toMatchObject({ id: created.hostId, credential: created.credential });
  });

  it('replaces a legacy non-UUID host ID before sending it to Supabase', async () => {
    local.setItem('quizzy-host-identity', JSON.stringify({ id: 'host-cbc95c0f392bd74fa90c5c80e497c75f', credential: 'old-secret' }));
    const api = makeBackend();
    const created = await api.create(quiz);
    expect(created.hostId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(calls[0].args.p_host_id).toBe(created.hostId);
    expect(JSON.parse(local.getItem('quizzy-host-identity'))).toMatchObject({ id: created.hostId, credential: created.credential });
  });
});

describe('game backend room actions', () => {
  it('joins a room with a generated participant credential and stores the participant receipt', async () => {
    const api = makeBackend(async () => ({ data: { game_id: 'game-2', player_id: 'player-2', pin: '123456', name: 'Riley' }, error: null }));
    const joined = await api.join('123456', 'Riley');
    expect(joined).toMatchObject({ id: 'game-2', playerId: 'player-2', name: 'Riley' });
    expect(joined.credential).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(session.getItem('quizzy-player-game-2'))).toEqual({ id: 'player-2', credential: joined.credential });
    expect(calls[0].args).toMatchObject({ p_pin: '123456', p_name: 'Riley', p_credential: joined.credential });
  });

  it('normalizes timestamp and current-question aliases in snapshots', async () => {
    const api = makeBackend(async () => ({ data: { current_question: 2, deadline: '2026-10-24T12:00:00Z' }, error: null }));
    const dated = await api.snapshot('g', 'secret', true);
    expect(dated.current).toBe(2);
    expect(dated.deadline).toBe(Date.parse('2026-10-24T12:00:00Z'));
    const empty = await makeBackend(async () => ({ data: { current: 0, deadline: null }, error: null })).snapshot('g', 'secret', false);
    expect(empty).toMatchObject({ current: 0, deadline: null });
  });

  it('forwards all state-changing and result RPCs with their credentials', async () => {
    const api = makeBackend();
    await api.start('g', 'host');
    await api.answer('g', 'p', 'player', 2);
    await api.reveal('g', 'host');
    await api.advance('g', 'host');
    await api.results('g', 'host');
    await api.listResults('owner', 'host');
    expect(calls.map((call) => call.name)).toEqual(['quizzy_start_game', 'quizzy_submit_answer', 'quizzy_reveal', 'quizzy_advance', 'quizzy_host_results', 'quizzy_list_results']);
    expect(calls[1].args).toEqual({ p_game_id: 'g', p_player_id: 'p', p_credential: 'player', p_option: 2 });
    expect(calls[5].args).toEqual({ p_host_id: 'owner', p_credential: 'host' });
  });

  it('maps known backend errors to participant-friendly messages', async () => {
    const errors = {
      PIN_COLLISION: 'That room PIN was just taken.', ROOM_NOT_FOUND: 'We couldn’t find that room.',
      GAME_ALREADY_STARTED: 'That quiz has already started.', ROOM_FULL: '500-player limit.',
      NAME_TAKEN: 'That name is already in the room.', ANSWER_ALREADY_SUBMITTED: 'Your answer is already locked in.',
      QUESTION_CLOSED: 'Time is up for this question.', UNAUTHORIZED: 'This game link has expired.',
    };
    for (const [code, expected] of Object.entries(errors)) {
      const api = makeBackend(async () => ({ error: { message: `RPC failed: ${code}` } }));
      await expect(api.start('g', 'c')).rejects.toThrow(expected);
    }
  });

  it('uses a safe fallback for missing and unexpected RPC errors', async () => {
    await expect(makeBackend(async () => ({ error: {} })).start('g', 'c')).rejects.toThrow('The quiz service could not complete that action.');
    await expect(makeBackend(async () => ({ error: { message: 'exception INVALID_QUESTION' } })).start('g', 'c')).rejects.toThrow('INVALID_QUESTION');
    await expect(makeBackend(async () => ({ error: { message: 'x'.repeat(220) } })).start('g', 'c')).rejects.toThrow('x'.repeat(180));
  });

  it('handles an unconfigured backend and a configured realtime channel', async () => {
    const unavailable = createGameBackend({ client: null, configured: false, storage: local, session, cryptoApi });
    expect(unavailable.isConfigured).toBe(false);
    const noOpCleanup = unavailable.subscribe('g', vi.fn());
    expect(noOpCleanup).toBeTypeOf('function');
    noOpCleanup();
    await expect(unavailable.start('g', 'c')).rejects.toThrow('run supabase/schema.sql');

    const api = makeBackend();
    expect(api.isConfigured).toBe(true);
    const callback = vi.fn();
    const cleanup = api.subscribe('g-1', callback);
    expect(client.channel).toHaveBeenCalledWith('quizzy:g-1', expect.any(Object));
    const channel = client.channel.mock.results[0].value;
    expect(channel.on).toHaveBeenCalledWith('broadcast', { event: 'room_refresh' }, callback);
    cleanup();
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });
});
