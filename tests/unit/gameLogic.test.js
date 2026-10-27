import { describe, expect, it } from 'vitest';
import { rankPlayers, scoreAnswer, validateQuiz } from '../../src/gameLogic.js';

const validQuiz = () => ({ title: 'Space', scoring: 'speed', questions: [{ text: 'Planet?', options: ['A', 'B', 'C', 'D'], correct: 1, seconds: 20 }] });

describe('rankPlayers', () => {
  it('does not mutate the supplied list and orders by score, last award, then join time', () => {
    const input = [{ id: 'later', score: 5, lastEarned: 1, joinedAt: 3 }, { id: 'first', score: 5, lastEarned: 2, joinedAt: 2 }, { id: 'top', score: 8, joinedAt: 4 }, { id: 'earlier', score: 5, lastEarned: 2, joinedAt: 1 }];
    expect(rankPlayers(input).map((p) => p.id)).toEqual(['top', 'earlier', 'first', 'later']);
    expect(input[0].id).toBe('later');
  });
  it('handles an omitted player list and nullish numeric fields', () => {
    expect(rankPlayers()).toEqual([]);
    expect(rankPlayers([{ id: 'a' }, { id: 'b', score: 0, lastEarned: 0, joinedAt: 0 }])).toHaveLength(2);
  });
});

describe('scoreAnswer', () => {
  it('awards no points for an incorrect answer', () => {
    expect(scoreAnswer({ correct: 1, answer: 0, scoring: 'speed', answeredAt: 0, deadline: 20000, seconds: 20 })).toBe(0);
  });
  it('awards fixed points in correct-only mode', () => {
    expect(scoreAnswer({ correct: 1, answer: '1', scoring: 'plain', answeredAt: 19000, deadline: 20000, seconds: 20 })).toBe(1000);
  });
  it('adds the maximum speed bonus for an immediate answer', () => {
    expect(scoreAnswer({ correct: 2, answer: 2, scoring: 'speed', answeredAt: 0, deadline: 20000, seconds: 20 })).toBe(1000);
  });
  it('awards base points after the deadline and guards invalid duration', () => {
    expect(scoreAnswer({ correct: 0, answer: 0, scoring: 'speed', answeredAt: 30000, deadline: 20000, seconds: 0 })).toBe(500);
  });
});

describe('validateQuiz', () => {
  it('accepts a complete quiz', () => { expect(validateQuiz(validQuiz())).toEqual([]); });
  it('rejects missing quiz, title, and questions', () => {
    expect(validateQuiz(null)).toEqual(['Quiz is required.']);
    expect(validateQuiz({ title: ' ', questions: [], scoring: 'speed' })).toContain('Give your quiz a title first.');
    expect(validateQuiz({ title: 'Okay', questions: [], scoring: 'speed' })).toContain('Add at least one question.');
    expect(validateQuiz({ questions: [{ text: 'Q', options: ['A', 'B', 'C', 'D'], correct: 0, seconds: 5 }], scoring: 'speed' })).toContain('Give your quiz a title first.');
  });
  it('rejects more than 30 questions', () => {
    const quiz = validQuiz(); quiz.questions = Array(31).fill(quiz.questions[0]);
    expect(validateQuiz(quiz)).toContain('A quiz can have up to 30 questions.');
  });
  it('reports invalid question prompts, options, key, and timer', () => {
    const quiz = validQuiz();
    quiz.questions = [{ text: ' ', options: ['A', '', 'C'], correct: 8, seconds: 121 }];
    expect(validateQuiz(quiz)).toEqual([
      'Question 1 needs a prompt.', 'Question 1 needs four answers.',
      'Question 1 needs one correct answer.', 'Question 1 needs a timer from 5 to 120 seconds.',
    ]);
  });
  it('handles malformed question objects and unsupported scoring', () => {
    expect(validateQuiz({ title: 'Oops', questions: [null], scoring: 'random' })).toContain('Choose a supported scoring mode.');
    expect(validateQuiz({ title: 'Oops', questions: [null], scoring: 'random' })).toContain('Question 1 needs four answers.');
    expect(validateQuiz({ title: 'Oops', questions: 'not-an-array', scoring: 'speed' })).toContain('Add at least one question.');
    const blankOption = validQuiz(); blankOption.questions[0].options[2] = '';
    expect(validateQuiz(blankOption)).toContain('Question 1 needs four answers.');
  });
});
