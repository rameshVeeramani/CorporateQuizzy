import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

const liveEnabled = process.env.QUIZZY_ALLOW_LIVE_SUPABASE_TESTS === '1'
  && Boolean(process.env.SUPABASE_TEST_URL && process.env.SUPABASE_TEST_ANON_KEY);

describe.skipIf(!liveEnabled)('configured Supabase integration', () => {
  it('runs a full authoritative room workflow against the test project', async () => {
    const client = createClient(process.env.SUPABASE_TEST_URL, process.env.SUPABASE_TEST_ANON_KEY, { auth: { persistSession: false } });
    const hostId = crypto.randomUUID();
    const hostCredential = randomSecret();
    const playerCredential = randomSecret();
    const pin = String(100000 + Math.floor(Math.random() * 900000));
    const suffix = crypto.randomUUID().slice(0, 8);
    const quiz = { title: `Integration ${suffix}`, scoring: 'plain', questions: [{ text: 'Choose B', options: ['A', 'B', 'C', 'D'], correct: 1, seconds: 120 }] };

    const created = await client.rpc('quizzy_create_game', { p_pin: pin, p_host_id: hostId, p_credential: hostCredential, p_quiz: quiz });
    expect(created.error).toBeNull();
    const gameId = created.data.game_id;
    const joined = await client.rpc('quizzy_join_game', { p_pin: pin, p_name: `Player ${suffix}`, p_credential: playerCredential });
    expect(joined.error).toBeNull();
    const playerId = joined.data.player_id;

    expect((await client.rpc('quizzy_start_game', { p_game_id: gameId, p_credential: hostCredential })).error).toBeNull();
    const beforeAnswer = await client.rpc('quizzy_game_state', { p_game_id: gameId, p_credential: playerCredential, p_is_host: false });
    expect(beforeAnswer.data.status).toBe('question');
    expect(beforeAnswer.data.quiz.questions[0]).not.toHaveProperty('correct');
    expect((await client.rpc('quizzy_submit_answer', { p_game_id: gameId, p_player_id: playerId, p_credential: playerCredential, p_option: 1 })).error).toBeNull();
    const duplicate = await client.rpc('quizzy_submit_answer', { p_game_id: gameId, p_player_id: playerId, p_credential: playerCredential, p_option: 2 });
    expect(duplicate.error?.message).toContain('ANSWER_ALREADY_SUBMITTED');
    expect((await client.rpc('quizzy_reveal', { p_game_id: gameId, p_credential: hostCredential })).error).toBeNull();

    const reveal = await client.rpc('quizzy_game_state', { p_game_id: gameId, p_credential: playerCredential, p_is_host: false });
    expect(reveal.data.status).toBe('reveal');
    expect(reveal.data.quiz.questions[0].correct).toBe(1);
    expect(reveal.data.own_player.score).toBe(1000);
    expect((await client.rpc('quizzy_advance', { p_game_id: gameId, p_credential: hostCredential })).error).toBeNull();
    const hostResults = await client.rpc('quizzy_host_results', { p_game_id: gameId, p_credential: hostCredential });
    expect(hostResults.error).toBeNull();
    expect(hostResults.data[0].score).toBe(1000);
    const reportList = await client.rpc('quizzy_list_results', { p_host_id: hostId, p_credential: hostCredential });
    expect(reportList.error).toBeNull();
    expect(reportList.data.some((report) => report.game_id === gameId)).toBe(true);
  }, 30000);
});

function randomSecret() {
  return [...crypto.getRandomValues(new Uint8Array(32))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
