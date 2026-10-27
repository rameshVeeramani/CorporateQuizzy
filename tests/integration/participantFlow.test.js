import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function click(element) {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('mobile participant live flow', () => {
  let realtimeCallback;
  let snapshot;
  let gameBackend;

  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    sessionStorage.clear();
    history.replaceState({}, '', '/?join=123456');
    snapshot = {
      id: 'game-1', pin: '123456', status: 'lobby', current: 0, deadline: null,
      quiz: { title: 'Colors', questions: [{ text: 'Which is blue?', options: ['Red', 'Green', 'Blue', 'Yellow'] }] },
      players: [{ id: 'player-1', name: 'Jamie', score: 0, color: 1 }],
      own_player: { id: 'player-1', name: 'Jamie', score: 0, color: 1 },
      player_count: 1, own_answer: null, answer_counts: [],
    };
    realtimeCallback = null;
    gameBackend = {
      isConfigured: true,
      getHostIdentity: vi.fn(),
      subscribe: vi.fn((_id, callback) => { realtimeCallback = callback; return vi.fn(); }),
      snapshot: vi.fn(async () => ({ ...snapshot, deadline: snapshot.deadline })),
      answer: vi.fn(async () => { snapshot.own_answer = 2; }),
    };
    sessionStorage.setItem('quizzy-player-room-123456', JSON.stringify({
      id: 'game-1', pin: '123456', playerId: 'player-1', credential: 'player-secret', name: 'Jamie', host: false,
    }));
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.resetModules();
    vi.doUnmock('../../src/backend.js');
  });

  it('waits for the host, receives the question, and submits an answer', async () => {
    vi.doMock('../../src/backend.js', () => ({ gameBackend }));
    await import('../../src/main.js');

    await vi.waitFor(() => expect(document.body.textContent).toContain('Waiting for the host'));
    expect(document.querySelector('.participant-app')).not.toBeNull();
    expect(document.querySelector('.participant-app').getAttribute('data-theme')).toBe('dark');
    expect(document.querySelector('.sidebar')).toBeNull();
    expect(document.querySelector('.topbar')).toBeNull();
    expect(document.querySelector('[data-action="start-game"]')).toBeNull();

    snapshot = { ...snapshot, status: 'question', deadline: Date.now() + 30_000 };
    realtimeCallback();
    await vi.waitFor(() => expect(document.querySelectorAll('[data-action="submit-answer"]')).toHaveLength(4));
    expect(document.body.textContent).toContain('Which is blue?');
    expect(document.querySelector('.participant-header').textContent).toContain('Jamie');

    click(document.querySelector('[data-action="submit-answer"][data-option="2"]'));
    await vi.waitFor(() => expect(document.body.textContent).toContain('Answer locked in'));
    expect(gameBackend.answer).toHaveBeenCalledWith('game-1', 'player-1', 'player-secret', 2);
  });
});
