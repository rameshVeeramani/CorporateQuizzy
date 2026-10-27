export function rankPlayers(players = []) {
  return [...players].sort((a, b) => Number(b.score || 0) - Number(a.score || 0)
    || Number(b.lastEarned || 0) - Number(a.lastEarned || 0)
    || Number(a.joinedAt || 0) - Number(b.joinedAt || 0));
}

export function scoreAnswer({ correct, answer, scoring, answeredAt, deadline, seconds }) {
  if (Number(answer) !== Number(correct)) return 0;
  if (scoring === 'plain') return 1000;
  const duration = Math.max(1, Number(seconds) || 1);
  const secondsRemaining = Math.max(0, (Number(deadline) - Number(answeredAt)) / 1000);
  return 500 + Math.round(500 * secondsRemaining / duration);
}

export function validateQuiz(quiz) {
  if (!quiz || typeof quiz !== 'object') return ['Quiz is required.'];
  const errors = [];
  const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
  if (!String(quiz.title || '').trim()) errors.push('Give your quiz a title first.');
  if (!Array.isArray(quiz.questions) || questions.length < 1) errors.push('Add at least one question.');
  if (questions.length > 30) errors.push('A quiz can have up to 30 questions.');
  for (const [index, question] of questions.entries()) {
    if (!String(question?.text || '').trim()) errors.push(`Question ${index + 1} needs a prompt.`);
    if (!Array.isArray(question?.options) || question.options.length !== 4 || question.options.some((answer) => !String(answer || '').trim())) errors.push(`Question ${index + 1} needs four answers.`);
    if (!Number.isInteger(Number(question?.correct)) || Number(question.correct) < 0 || Number(question.correct) > 3) errors.push(`Question ${index + 1} needs one correct answer.`);
    if (!Number.isFinite(Number(question?.seconds)) || Number(question.seconds) < 5 || Number(question.seconds) > 120) errors.push(`Question ${index + 1} needs a timer from 5 to 120 seconds.`);
  }
  if (!['plain', 'speed'].includes(quiz.scoring)) errors.push('Choose a supported scoring mode.');
  return errors;
}
