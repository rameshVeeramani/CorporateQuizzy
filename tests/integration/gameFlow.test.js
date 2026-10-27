import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createGameBackend } from '../../src/backend.js';
import { rankPlayers, scoreAnswer } from '../../src/gameLogic.js';
import { deterministicCrypto, MemoryStorage } from '../helpers.js';

function makeRoomService() {
  const room = { id: 'integration-game', pin: '190000', hostId: null, hostCredential: null, quiz: null, status: 'lobby', current: 0, deadline: null, players: [], answers: new Map(), rankings: null };
  const apiCalls = [];
  const client = {
    async rpc(name, args) {
      apiCalls.push(name);
      switch (name) {
        case 'quizzy_create_game':
          room.pin = args.p_pin; room.hostId = args.p_host_id; room.hostCredential = args.p_credential; room.quiz = args.p_quiz;
          return { data: { game_id: room.id, pin: room.pin }, error: null };
        case 'quizzy_join_game': {
          if (args.p_pin !== room.pin) return { error: { message: 'ROOM_NOT_FOUND' } };
          if (room.status !== 'lobby') return { error: { message: 'GAME_ALREADY_STARTED' } };
          if (room.players.some((player) => player.name.toLowerCase() === args.p_name.toLowerCase())) return { error: { message: 'NAME_TAKEN' } };
          const player = { id: `player-${room.players.length + 1}`, name: args.p_name, credential: args.p_credential, score: 0, lastEarned: 0, joinedAt: room.players.length + 1 };
          room.players.push(player);
          return { data: { game_id: room.id, player_id: player.id, pin: room.pin, name: player.name }, error: null };
        }
        case 'quizzy_game_state': {
          const host = args.p_is_host && args.p_credential === room.hostCredential;
          const own = room.players.find((p) => p.credential === args.p_credential);
          if (!host && !own) return { error: { message: 'UNAUTHORIZED' } };
          const question = room.quiz.questions[room.current];
          const tally = [0, 1, 2, 3].map((option) => ({ option, count: [...room.answers.values()].filter((answer) => answer.question === room.current && answer.option === option).length })).filter((item) => item.count);
          const ranked = rankPlayers(room.players).map((player, i) => ({ id: player.id, name: player.name, score: player.score, lastEarned: player.lastEarned, joinedAt: player.joinedAt, rank: i + 1 }));
          const playerQuiz = structuredClone(room.quiz);
          if (!host && room.status === 'question') playerQuiz.questions = playerQuiz.questions.map(({ correct, ...visible }) => visible);
          if (!host && room.status === 'reveal') playerQuiz.questions = playerQuiz.questions.map((item, index) => index === room.current ? item : (({ correct, ...visible }) => visible)(item));
          return { data: { id: room.id, pin: room.pin, status: room.status, current: room.current, deadline: room.deadline ? new Date(room.deadline).toISOString() : null, quiz: playerQuiz, players: host ? ranked : ranked.slice(0, 10), player_count: room.players.length, own_player: own ? ranked.find((p) => p.id === own.id) : null, own_answer: own ? room.answers.get(own.id)?.option ?? null : null, answer_counts: tally, results: room.rankings }, error: null };
        }
        case 'quizzy_start_game':
          if (args.p_credential !== room.hostCredential) return { error: { message: 'UNAUTHORIZED' } };
          room.status = 'question'; room.deadline = Date.now() + room.quiz.questions[0].seconds * 1000;
          return { data: null, error: null };
        case 'quizzy_submit_answer': {
          const player = room.players.find((p) => p.id === args.p_player_id && p.credential === args.p_credential);
          if (!player) return { error: { message: 'UNAUTHORIZED' } };
          if (room.status !== 'question' || Date.now() >= room.deadline) return { error: { message: 'QUESTION_CLOSED' } };
          if (room.answers.has(player.id)) return { error: { message: 'ANSWER_ALREADY_SUBMITTED' } };
          room.answers.set(player.id, { question: room.current, option: args.p_option, answeredAt: Date.now() });
          return { data: null, error: null };
        }
        case 'quizzy_reveal':
          if (args.p_credential !== room.hostCredential) return { error: { message: 'UNAUTHORIZED' } };
          for (const player of room.players) {
            const answer = room.answers.get(player.id);
            player.lastEarned = answer?.question === room.current ? scoreAnswer({ correct: room.quiz.questions[room.current].correct, answer: answer.option, scoring: room.quiz.scoring, answeredAt: answer.answeredAt, deadline: room.deadline, seconds: room.quiz.questions[room.current].seconds }) : 0;
            player.score += player.lastEarned;
          }
          room.status = 'reveal';
          return { data: null, error: null };
        case 'quizzy_advance':
          if (args.p_credential !== room.hostCredential) return { error: { message: 'UNAUTHORIZED' } };
          room.status = 'finished'; room.rankings = rankPlayers(room.players).map((p, index) => ({ ...p, rank: index + 1 }));
          return { data: null, error: null };
        case 'quizzy_host_results':
        case 'quizzy_list_results':
          return { data: room.rankings, error: null };
        default: return { error: { message: `Unknown RPC ${name}` } };
      }
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel() {},
  };
  return { room, apiCalls, client };
}

describe('live quiz workflow integration through the RPC adapter', () => {
  it('uses public database broadcasts to match anonymous room subscribers', () => {
    const schema = readFileSync(`${process.cwd()}/supabase/schema.sql`, 'utf8');
    expect(schema).toMatch(/realtime\.send\(jsonb_build_object\('kind',tg_table_name\),'room_refresh','quizzy:'\|\|rid::text,false\)/);
  });

  it('creates a room, joins from a participant context, accepts one answer, reveals, and persists the podium', async () => {
    const { room, apiCalls, client } = makeRoomService();
    const storage = new MemoryStorage();
    const participantStorage = new MemoryStorage();
    const cryptoApi = deterministicCrypto();
    const host = createGameBackend({ client, configured: true, storage, session: new MemoryStorage(), cryptoApi, random: () => 0.1 });
    const participant = createGameBackend({ client, configured: true, storage: new MemoryStorage(), session: participantStorage, cryptoApi, random: () => 0.1 });
    const quiz = { title: 'Integration quiz', scoring: 'plain', questions: [{ text: 'Pick B', options: ['A', 'B', 'C', 'D'], correct: 1, seconds: 30 }] };

    const hostSession = await host.create(quiz);
    expect(hostSession).toMatchObject({ id: room.id, pin: room.pin });
    const joined = await participant.join(room.pin, 'Riley');
    expect(joined).toMatchObject({ id: room.id, playerId: 'player-1', name: 'Riley' });
    expect((await host.snapshot(room.id, hostSession.credential, true)).players).toHaveLength(1);
    await host.start(room.id, hostSession.credential);
    const questionView = await participant.snapshot(room.id, joined.credential, false);
    expect(questionView.status).toBe('question');
    expect(questionView.quiz.questions[0]).not.toHaveProperty('correct');
    await participant.answer(room.id, joined.playerId, joined.credential, 1);
    await expect(participant.answer(room.id, joined.playerId, joined.credential, 2)).rejects.toThrow('answer is already locked in');
    expect((await host.snapshot(room.id, hostSession.credential, true)).answer_counts).toEqual([{ option: 1, count: 1 }]);

    await host.reveal(room.id, hostSession.credential);
    const reveal = await participant.snapshot(room.id, joined.credential, false);
    expect(reveal.status).toBe('reveal');
    expect(reveal.quiz.questions[0].correct).toBe(1);
    expect(reveal.own_player.score).toBe(1000);
    await host.advance(room.id, hostSession.credential);
    expect(await host.results(room.id, hostSession.credential)).toHaveLength(1);
    expect(await host.listResults(hostSession.hostId, hostSession.credential)).toHaveLength(1);
    expect(apiCalls).toEqual(expect.arrayContaining(['quizzy_create_game', 'quizzy_join_game', 'quizzy_start_game', 'quizzy_submit_answer', 'quizzy_reveal', 'quizzy_advance', 'quizzy_host_results', 'quizzy_list_results']));
  });

  it('rejects unknown rooms and duplicate participant names through friendly adapter errors', async () => {
    const { client } = makeRoomService();
    const api = createGameBackend({ client, configured: true, storage: new MemoryStorage(), session: new MemoryStorage(), cryptoApi: deterministicCrypto() });
    await expect(api.join('111111', 'Riley')).rejects.toThrow('couldn’t find that room');
    const host = await api.create({ title: 'Q', scoring: 'plain', questions: [{ text: 'Q', options: ['a', 'b', 'c', 'd'], correct: 0, seconds: 10 }] });
    await api.join(host.pin, 'Riley');
    await expect(api.join(host.pin, 'riley')).rejects.toThrow('name is already in the room');
  });
});
