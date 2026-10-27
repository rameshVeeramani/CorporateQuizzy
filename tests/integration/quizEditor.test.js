import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function click(element) {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function fillQuestion(index, prompt, answers) {
  const editor = document.querySelectorAll('.question-editor')[index];
  editor.querySelector('[data-field="text"]').value = prompt;
  editor.querySelectorAll('[data-field="option"]').forEach((input, answerIndex) => {
    input.value = answers[answerIndex];
  });
}

describe('quiz editor browser flow', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    localStorage.clear();
    history.replaceState({}, '', '/');
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('adds a question and saves all quiz content to browser storage', async () => {
    await import('../../src/main.js');
    expect(document.body.textContent).toContain('Live games need setup');
    expect(document.querySelector('.app-shell').getAttribute('data-theme')).toBe('dark');
    expect(document.querySelector('.host-home')).not.toBeNull();
    expect(document.querySelector('.hero-art')).toBeNull();
    expect(document.querySelectorAll('.host-quiz-card')).toHaveLength(2);
    expect(document.querySelector('[data-action="host-quiz"]')).not.toBeNull();
    expect(document.querySelector('[data-action="quiz-menu"]').textContent).toContain('Edit');

    click(document.querySelector('[data-action="new-quiz"]'));
    document.querySelector('#quiz-title').value = 'World wonders';
    document.querySelector('#quiz-description').value = 'A quick geography round';
    document.querySelector('#quiz-category').value = 'Geography';
    fillQuestion(0, 'Which city has the Eiffel Tower?', ['Rome', 'Paris', 'Madrid', 'Lisbon']);

    click(document.querySelector('[data-action="add-question"]'));
    expect(document.querySelectorAll('.question-editor')).toHaveLength(2);

    fillQuestion(1, 'Which country has Machu Picchu?', ['Peru', 'Chile', 'Brazil', '']);
    click(document.querySelector('[data-action="save-quiz"]'));
    expect(document.querySelector('.toast-message').textContent).toContain('Fill in all four answer choices for Question 2.');
    expect(document.querySelector('.quiz-modal')).not.toBeNull();
    expect(document.querySelectorAll('.question-editor')[1].querySelectorAll('.invalid-field')).toHaveLength(1);
    document.querySelectorAll('.question-editor')[1].querySelectorAll('[data-field="option"]')[3].value = 'Ecuador';
    click(document.querySelector('[data-action="mark-correct"][data-question="1"][data-option="0"]'));
    click(document.querySelector('[data-action="set-scoring"][data-scoring="plain"]'));
    click(document.querySelector('[data-action="save-quiz"]'));

    const saved = JSON.parse(localStorage.getItem('quizzy-saved-quizzes-v1'));
    expect(saved[0]).toMatchObject({
      title: 'World wonders',
      description: 'A quick geography round',
      category: 'Geography',
      scoring: 'plain',
      questions: [
        { text: 'Which city has the Eiffel Tower?', options: ['Rome', 'Paris', 'Madrid', 'Lisbon'], correct: 0, seconds: 20 },
        { text: 'Which country has Machu Picchu?', options: ['Peru', 'Chile', 'Brazil', 'Ecuador'], correct: 0, seconds: 20 },
      ],
    });
    expect(document.querySelector('.quiz-modal')).toBeNull();
    expect(document.body.textContent).toContain('World wonders');

    click(document.querySelector('[data-action="host-quiz"]'));
    await vi.waitFor(() => expect(document.querySelector('.toast-message').textContent).toContain('run supabase/schema.sql'));
  });
});
