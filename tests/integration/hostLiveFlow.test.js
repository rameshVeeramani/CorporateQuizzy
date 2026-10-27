import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function click(element) {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('host live flow', () => {
  let snapshot;
  let gameBackend;

  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    localStorage.clear();
    sessionStorage.clear();
    history.replaceState({}, '', '/?host=123456');
    snapshot = {
      id: 'host-game', pin: '123456', status: 'reveal', current: 0, deadline: null,
      quiz: { title: 'City quiz', scoring: 'plain', questions: [{ text: 'Where is the Eiffel Tower?', options: ['Rome', 'Madrid', 'Paris', 'Lisbon'], correct: 2 }] },
      players: [
        { id: 'p1', name: 'Ari', score: 1000, lastEarned: 1000, joinedAt: 1, rank: 1 },
        { id: 'p2', name: 'Sam', score: 0, lastEarned: 0, joinedAt: 2, rank: 2 },
      ],
      player_count: 2, answer_counts: [], results: null,
    };
    gameBackend = {
      isConfigured: true,
      subscribe: vi.fn(() => vi.fn()),
      snapshot: vi.fn(async () => ({ ...snapshot })),
      advance: vi.fn(async () => { snapshot = { ...snapshot, status: 'finished' }; }),
      results: vi.fn(async () => snapshot.players),
    };
    localStorage.setItem('quizzy-host-room-123456', JSON.stringify({
      id: 'host-game', pin: '123456', hostId: 'host-id', credential: 'host-secret', host: true,
    }));
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.resetModules();
    vi.doUnmock('../../src/backend.js');
  });

  it('shows the correct answer and current rankings before advancing to the podium', async () => {
    vi.doMock('../../src/backend.js', () => ({ gameBackend }));
    await import('../../src/main.js');

    await vi.waitFor(() => expect(document.querySelector('.host-reveal')).not.toBeNull());
    expect(document.querySelector('.host-reveal').textContent).toContain('Paris');
    expect(document.querySelector('.host-ranking').textContent).toContain('Ari');
    expect(document.querySelector('.live-players-panel')).toBeNull();

    click(document.querySelector('[data-action="next-step"]'));
    await vi.waitFor(() => expect(document.querySelector('.live-finished')).not.toBeNull());
    expect(gameBackend.advance).toHaveBeenCalledWith('host-game', 'host-secret');
  });
});
