import './style.css';
import { gameBackend } from './backend.js';
import { rankPlayers, validateQuiz } from './gameLogic.js';

const STORAGE_KEY = 'quizzy-saved-quizzes-v1';
const PALETTE = ['#e94f37', '#16a581', '#5264d8', '#efa900'];
const ANSWER_LABELS = ['A', 'B', 'C', 'D'];
const SAMPLE = {
  id: 'sample-space', title: 'A little space quiz', description: 'For curious minds and enthusiastic guessers', category: 'Science',
  scoring: 'speed', questions: [
    { text: 'Which planet has the most moons?', options: ['Earth', 'Saturn', 'Mars', 'Venus'], correct: 1, seconds: 20 },
    { text: 'What is the closest star to Earth?', options: ['Sirius', 'The Sun', 'Proxima Centauri', 'Vega'], correct: 1, seconds: 20 },
    { text: 'How long does sunlight take to reach Earth?', options: ['8 seconds', '8 minutes', '80 minutes', '8 hours'], correct: 1, seconds: 25 },
  ], updatedAt: Date.now(),
};

const freshQuestion = () => ({ text: '', options: ['', '', '', ''], correct: 0, seconds: 20 });
const starterQuizzes = [
  SAMPLE,
  { id: 'sample-food', title: 'The great food debate', description: 'A few tasty questions to warm up the room', category: 'Food & drink', scoring: 'speed', questions: [
    { text: 'Which nut is used to make marzipan?', options: ['Cashew', 'Almond', 'Hazelnut', 'Pistachio'], correct: 1, seconds: 20 },
    { text: 'Where did pizza as we know it originate?', options: ['Naples', 'Paris', 'Athens', 'London'], correct: 0, seconds: 20 },
    { text: 'What gives a bell pepper its spiciness?', options: ['Capsaicin', 'Caffeine', 'Pectin', 'Tannin'], correct: 0, seconds: 15 },
  ], updatedAt: Date.now() - 200000 },
];

function readQuizzes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (Array.isArray(parsed)) return parsed;
  } catch { /* use examples when browser storage is unavailable */ }
  return starterQuizzes;
}

const state = {
  page: 'home', quizzes: readQuizzes(), selectedQuiz: null, session: null, unsubscribe: null,
  answers: new Map(), tab: 'all', modal: false, editingQuiz: null,
  joinPin: '', playerName: '', participant: false,
};

function saveQuizzes() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.quizzes)); }
  catch { toast('Could not save. Check this browser’s storage settings.'); }
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function icon(name, size = 18) {
  const paths = {
    spark: '<path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z"/><path d="m19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
    folder: '<path d="M3 7.5a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-11Z"/>',
    chart: '<path d="M4 19V5M4 19h17"/><path d="m7 15 4-4 3 2 6-7"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.7 3-1.8-.7a1.8 1.8 0 0 0-1.6.1l-.3.2-.3 2h-3.4l-.3-2-.3-.2a1.8 1.8 0 0 0-1.6-.1l-1.8.7-1.7-3 .1-.1A1.7 1.7 0 0 0 5.4 15l-.2-.4-1.9-.6v-3.4l1.9-.6.2-.4a1.7 1.7 0 0 0-.3-1.9L5 7.6l1.7-3 1.8.7a1.8 1.8 0 0 0 1.6-.1l.3-.2.3-2h3.4l.3 2 .3.2a1.8 1.8 0 0 0 1.6.1l1.8-.7 1.7 3-.1.1a1.7 1.7 0 0 0-.3 1.9l.2.4 1.9.6v3.4l-1.9.6-.2.4Z" transform="translate(-1 -1) scale(.94)"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    people: '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    trophy: '<path d="M8 21h8m-4-4v4m-5-18h10v5a5 5 0 0 1-10 0V3Zm10 2h4v2a4 4 0 0 1-4 4M7 5H3v2a4 4 0 0 0 4 4"/>',
    arrow: '<path d="M5 12h14m-7-7 7 7-7 7"/>',
    close: '<path d="m18 6-12 12M6 6l12 12"/>',
    trash: '<path d="M3 6h18m-2 0-.8 14H5.8L5 6m4 0V4h6v2m-5 4v6m4-6v6"/>',
    pin: '<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.spark}</svg>`;
}

function shell(content) {
  const active = state.page;
  return `<div class="app-shell" data-theme="dark">
    <aside class="sidebar" id="sidebar">
      <a class="brand" href="#" data-action="home"><span class="brand-mark">${icon('spark', 21)}</span><span>quizzy<span class="brand-period">.</span></span></a>
      <div class="workspace-label">WORKSPACE</div>
      <nav class="side-nav" aria-label="Main navigation">
        <button class="nav-item ${active === 'home' ? 'active' : ''}" data-action="home">${icon('grid', 19)}<span>Overview</span></button>
        <button class="nav-item ${active === 'library' ? 'active' : ''}" data-action="library">${icon('folder', 19)}<span>My quizzes</span><span class="nav-count">${state.quizzes.length}</span></button>
        <button class="nav-item ${active === 'results' ? 'active' : ''}" data-action="results">${icon('chart', 19)}<span>Reports</span></button>
      </nav>
      <div class="side-bottom"></div>
    </aside>
    <main class="main-column"><header class="topbar"><button class="mobile-menu icon-btn" data-action="menu" aria-label="Open navigation">${icon('menu')}</button><div class="breadcrumb"><span>Quizzy</span><span class="crumb-sep">/</span><b>${active === 'home' ? 'Quizzes' : active === 'library' ? 'All quizzes' : active === 'results' ? 'Reports' : 'Live quiz'}</b></div><div class="top-actions"><span class="live-indicator ${gameBackend.isConfigured ? '' : 'setup-needed'}" title="${gameBackend.isConfigured ? 'Live rooms are connected.' : 'Set up Supabase to host live rooms.'}"><i></i> ${gameBackend.isConfigured ? 'Live rooms ready' : 'Live games need setup'}</span></div></header>${content}</main>
    ${state.modal ? quizModal() : ''}<div id="toast-root" class="toast-root" aria-live="polite"></div>
  </div>`;
}

function participantShell(content) {
  return `<div class="participant-app" data-theme="dark"><main class="participant-main">${content}</main><div id="toast-root" class="toast-root" aria-live="polite"></div></div>`;
}

function homePage() {
  const quizzes = state.quizzes.slice(0, 6);
  return shell(`<div class="page-content host-home"><header class="host-home-heading"><div><h1>Your quizzes</h1><p>Create a quiz or host one you’ve already saved.</p></div><button class="btn btn-primary" data-action="new-quiz">${icon('plus', 17)} Create quiz</button></header><section class="host-quiz-list" aria-label="Your quizzes">${quizzes.length ? quizzes.map(quizCard).join('') : '<div class="host-empty"><h2>No quizzes yet</h2><p>Create your first quiz to get started.</p><button class="btn btn-primary" data-action="new-quiz">Create quiz</button></div>'}</section>${state.quizzes.length > 6 ? '<button class="text-btn host-view-all" data-action="library">View all quizzes</button>' : ''}</div>`);
}

function quizCard(quiz) {
  const questionCount = quiz.questions?.length || 0;
  return `<article class="host-quiz-card" data-quiz-card="${escapeHtml(quiz.id)}"><div class="host-quiz-copy"><span>${escapeHtml(quiz.category || 'General')} · ${questionCount} ${questionCount === 1 ? 'question' : 'questions'}</span><h2>${escapeHtml(quiz.title)}</h2>${quiz.description ? `<p>${escapeHtml(quiz.description)}</p>` : ''}</div><div class="host-quiz-actions"><button class="btn btn-secondary" data-action="quiz-menu" data-id="${escapeHtml(quiz.id)}">Edit</button><button class="btn btn-primary" data-action="host-quiz" data-id="${escapeHtml(quiz.id)}">Host quiz ${icon('arrow', 16)}</button></div></article>`;
}

function libraryPage() {
  const search = state.search || '';
  const filtered = state.quizzes.filter((quiz) => quiz.title.toLowerCase().includes(search.toLowerCase()) || (quiz.category || '').toLowerCase().includes(search.toLowerCase()));
  return shell(`<div class="page-content inner-page host-library"><div class="inner-heading"><div><h1>All quizzes</h1><p>Choose a quiz to edit or host.</p></div><button class="btn btn-primary" data-action="new-quiz">${icon('plus', 17)} Create quiz</button></div><label class="search-box">${icon('search', 18)}<input id="quiz-search" type="search" placeholder="Search quizzes" value="${escapeHtml(search)}"></label><div class="host-quiz-list">${filtered.length ? filtered.map(quizCard).join('') : '<div class="host-empty"><h2>No quizzes found</h2><p>Try a different search or create a quiz.</p><button class="btn btn-primary" data-action="new-quiz">Create quiz</button></div>'}</div><footer class="page-footer"><span>Quizzes are saved in this browser.</span></footer></div>`);
}

function resultsPage() {
  const reports = state.savedReports || [];
  const cards = reports.map((report) => {
    const top = (report.rankings || []).slice(0, 3);
    return `<section class="report-card"><div><span class="quiz-category">COMPLETED GAME</span><h2>${escapeHtml(report.quiz_title)}</h2><p>${report.player_count} players · ${new Date(report.completed_at).toLocaleDateString()}</p></div><div class="report-podium">${top.map((player, i) => `<div><span class="rank-badge rank-${i + 1}">${i + 1}</span><b>${escapeHtml(player.name)}</b><span>${player.score} pts</span></div>`).join('') || '<span>No players joined.</span>'}</div></section>`;
  }).join('');
  return shell(`<div class="page-content inner-page"><div class="inner-heading"><div><div class="section-kicker">THE HIGHLIGHTS</div><h1>Reports</h1><p>Your completed quizzes and their podium finishers.</p></div></div>${reports.length ? `<div class="reports-list">${cards}</div>` : `<div class="empty-state report-empty"><span>✳</span><h3>Your next favorite memory goes here.</h3><p>Finish hosting a quiz and you’ll find the highlights right here.</p><button class="btn btn-primary" data-action="home">Let’s make one ${icon('arrow', 15)}</button></div>`}</div>`);
}

function quizModal() {
  const quiz = state.editingQuiz || { id: null, title: '', description: '', category: 'General', scoring: 'speed', questions: [freshQuestion()] };
  const q = quiz.questions?.length ? quiz.questions : [freshQuestion()];
  return `<div class="modal-backdrop" data-action="close-modal"><section class="quiz-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header class="modal-header"><div><span class="section-kicker">${quiz.id ? 'MAKE IT EVEN BETTER' : 'THE FUN STARTS HERE'}</span><h2 id="modal-title">${quiz.id ? 'Edit your quiz' : 'Create a quiz'}</h2></div><button class="icon-btn" data-action="close-modal" aria-label="Close">${icon('close')}</button></header><div class="modal-body"><label class="field-label">QUIZ TITLE<input class="text-input" id="quiz-title" maxlength="60" placeholder="e.g. The great space quiz" value="${escapeHtml(quiz.title)}"></label><label class="field-label">A LITTLE DESCRIPTION <span class="optional">OPTIONAL</span><input class="text-input" id="quiz-description" maxlength="120" placeholder="What’s this quiz all about?" value="${escapeHtml(quiz.description)}"></label><label class="field-label">CATEGORY<select class="text-input" id="quiz-category">${['General', 'Science', 'History', 'Food & drink', 'Pop culture', 'Geography', 'Other'].map((category) => `<option ${quiz.category === category ? 'selected' : ''}>${category}</option>`).join('')}</select></label><div class="scoring-field"><div><span class="field-label">HOW SHOULD POINTS WORK?</span><span class="field-hint">Choose how your players earn points.</span></div><div class="scoring-toggle"><button data-action="set-scoring" data-scoring="speed" class="${quiz.scoring !== 'plain' ? 'selected' : ''}">Speed bonus</button><button data-action="set-scoring" data-scoring="plain" class="${quiz.scoring === 'plain' ? 'selected' : ''}">Correct only</button></div></div><div class="questions-heading"><div><span class="field-label">YOUR QUESTIONS</span><span class="field-hint">Every question has four possible answers.</span></div><span class="question-count">${q.length} / 30</span></div><div class="question-editor-list">${q.map(questionEditor).join('')}</div><button class="add-question-btn" data-action="add-question">${icon('plus', 16)} Add another question</button></div><footer class="modal-footer"><button class="text-btn" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="save-quiz">${icon('check', 16)} Save quiz</button></footer></section></div>`;
}

function questionEditor(question, index) {
  const options = Array.from({ length: 4 }, (_, optionIndex) => question.options?.[optionIndex] || '');
  return `<article class="question-editor" data-question-index="${index}"><div class="question-editor-top"><span class="question-index">QUESTION ${String(index + 1).padStart(2, '0')}</span><div class="question-timer-field">${icon('clock', 14)}<input type="number" min="5" max="120" value="${Number(question.seconds) || 20}" data-field="seconds" data-question="${index}" aria-label="Timer in seconds"><span>sec</span></div>${index > 0 ? `<button class="remove-question" data-action="remove-question" data-index="${index}" aria-label="Remove question">${icon('trash', 15)}</button>` : ''}</div><input class="question-text-input" data-field="text" data-question="${index}" maxlength="160" placeholder="Type your question here..." value="${escapeHtml(question.text)}"><div class="answer-editor-grid">${options.map((option, optionIndex) => `<label class="answer-edit answer-edit-${optionIndex} ${Number(question.correct) === optionIndex ? 'correct-answer' : ''}"><button type="button" data-action="mark-correct" data-question="${index}" data-option="${optionIndex}" aria-label="Mark ${ANSWER_LABELS[optionIndex]} correct">${Number(question.correct) === optionIndex ? icon('check', 14) : ANSWER_LABELS[optionIndex]}</button><input data-field="option" data-question="${index}" data-option="${optionIndex}" maxlength="100" placeholder="Answer ${ANSWER_LABELS[optionIndex]}" value="${escapeHtml(option)}"></label>`).join('')}</div><span class="correct-hint">${icon('check', 12)} Choose the circle beside the right answer</span></article>`;
}

function livePage() {
  const session = state.session;
  const isHost = !state.participant;
  if (!session) return state.participant || state.joinPin ? participantShell(joinScreen()) : shell(`<div class="page-content inner-page"><div class="empty-state report-empty"><span>✳</span><h3>No game is running yet</h3><p>Pick one of your quizzes to get a room started.</p><button class="btn btn-primary" data-action="library">Choose a quiz ${icon('arrow', 15)}</button></div></div>`);
  const player = isHost ? null : (session.players.find((p) => p.id === state.participantId) || session.own_player);
  if (!isHost && !player) return participantShell(joinScreen());
  const qIndex = session.current;
  const question = session.quiz.questions[qIndex];
  const phase = session.status;
  const total = session.quiz.questions.length;
  const ranks = ranking(session);
  const remaining = phase === 'question' ? Math.max(0, Math.ceil((session.deadline - Date.now()) / 1000)) : 0;
  const joinedNames = session.players.slice(-8).map((p) => `<span class="player-chip"><i style="background:${PALETTE[(p.color || 0) % 4]}">${escapeHtml(p.name.slice(0, 1).toUpperCase())}</i>${escapeHtml(p.name)}</span>`).join('');
  let centerContent = '';
  if (phase === 'lobby') {
    if (!isHost) return participantShell(joinScreen());
    centerContent = `<div class="live-lobby"><h1>Room ready</h1><p>Share the PIN or scan the QR code to join.</p><div class="join-display"><div><small>JOIN WITH PIN</small><b>${session.pin}</b><button class="copy-pin" data-action="copy-pin">${icon('copy', 14)} Copy PIN</button></div><img class="join-qr" alt="QR code to join this quiz" src="${qrUrl(session.joinUrl)}"></div><div class="lobby-players"><div class="lobby-player-header"><span>${icon('people', 15)} IN THE ROOM</span><b>${session.players.length} <small>/ 500</small></b></div>${session.players.length ? `<div class="player-chips">${joinedNames}${session.players.length > 8 ? `<span class="player-chip more-players">+ ${session.players.length - 8} more</span>` : ''}</div>` : '<div class="waiting-empty"><span class="waiting-pulse"></span> Waiting for the first player to join...</div>'}</div><button class="btn btn-primary start-game-btn" data-action="start-game" ${session.players.length ? '' : 'disabled'}>Start the quiz ${icon('arrow', 16)}</button><span class="field-hint lobby-join-hint">Players can join from their own device with the PIN or QR code.</span></div>`;
  } else if (phase === 'finished') {
    centerContent = `<div class="live-finished"><div class="finish-sparkle">✳</div><span class="section-kicker">THAT’S A WRAP</span><h1>Look at you<br><em>go.</em></h1><p>${escapeHtml(session.quiz.title)} is all done. Here are the brains of the bunch.</p><div class="podium">${ranks.slice(0, 3).map((p, i) => `<div class="podium-person place-${i + 1}"><span class="podium-medal">${i === 0 ? '✦' : i + 1}</span><b>${escapeHtml(p.name)}</b><span>${p.score} points</span><div class="podium-block">${i + 1}</div></div>`).join('') || '<p>No players joined this round.</p>'}</div><button class="btn btn-primary" data-action="home">Back to your studio ${icon('arrow', 16)}</button></div>`;
  } else if (phase === 'question' && player) {
    const prevAnswer = session.own_answer ?? state.answers.get(`${session.id}:${qIndex}:${player.id}`);
    centerContent = `<div class="participant-question"><div class="participant-status"><span>QUESTION ${qIndex + 1} OF ${total}</span><span class="live-clock ${remaining <= 5 ? 'urgent' : ''}">${icon('clock', 15)} <b data-countdown="${remaining}" data-deadline="${session.deadline}">${remaining}s</b></span></div><h1>${escapeHtml(question.text)}</h1>${prevAnswer !== undefined && prevAnswer !== null ? `<div class="answer-confirmed">${icon('check', 19)} Answer locked in. Nice one!</div>` : `<div class="participant-options">${question.options.map((option, i) => `<button class="participant-option" style="--option-color:${PALETTE[i]}" data-action="submit-answer" data-option="${i}" ${remaining === 0 ? 'disabled' : ''}><span>${ANSWER_LABELS[i]}</span>${escapeHtml(option)}</button>`).join('')}</div>`}</div>`;
  } else if (phase === 'reveal' && player) {
    const correct = session.quiz.questions[qIndex].correct;
    centerContent = `<div class="participant-reveal"><span class="correct-ribbon">${icon('check', 17)} HERE’S THE RIGHT ANSWER</span><h1>${escapeHtml(question.options[correct])}</h1><p>You’ve got <b>${player.score}</b> points so far.</p><div class="live-rank-list"><span class="field-label">CUMULATIVE RANKING</span>${ranks.map((p, i) => `<div class="rank-row ${p.id === player.id ? 'your-rank' : ''}"><span class="rank-number">${p.rank || i + 1}</span><span class="rank-avatar" style="background:${PALETTE[(p.color || 0) % 4]}">${escapeHtml(p.name.slice(0, 1).toUpperCase())}</span><b>${escapeHtml(p.name)}</b><span class="rank-points">${p.score} pts</span></div>`).join('') || '<p>Scores will show here.</p>'}${session.player_count > 10 ? `<span class="ranking-more">Showing the top ten and your place · ${session.player_count} players</span>` : ''}</div><div class="participant-waiting">${icon('clock', 15)} Waiting for the host to continue...</div></div>`;
  } else if (phase === 'reveal') {
    const correct = session.quiz.questions[qIndex].correct;
    centerContent = `<div class="host-reveal"><span class="section-kicker">QUESTION ${qIndex + 1} ANSWER</span><h1>${escapeHtml(question.options[correct])}</h1><div class="host-ranking"><h2>Current rankings</h2>${ranks.slice(0, 10).map((p, i) => `<div class="host-rank-row"><b>${p.rank || i + 1}</b><span>${escapeHtml(p.name)}</span><strong>${p.score} pts</strong></div>`).join('') || '<p>No players joined this round.</p>'}${session.player_count > 10 ? `<span class="ranking-more">Top 10 of ${session.player_count} players</span>` : ''}</div></div>`;
  } else {
    const tallies = [0, 1, 2, 3].map((i) => session.answer_counts?.find((item) => Number(item.option) === i)?.count || 0);
    const answerCount = tallies.reduce((sum, count) => sum + Number(count), 0);
    centerContent = `<div class="host-question"><div class="host-q-top"><span class="live-tag"><i></i> LIVE NOW</span><span class="question-progress">QUESTION ${qIndex + 1} <i>/</i> ${total}</span></div><h1>${escapeHtml(question.text)}</h1><div class="host-options-grid">${question.options.map((option, i) => `<div class="host-option" style="--option-color:${PALETTE[i]}"><span>${ANSWER_LABELS[i]}</span><b>${escapeHtml(option)}</b><small>${tallies[i]} answers</small></div>`).join('')}</div><div class="question-live-footer"><span>${icon('people', 16)} <b>${answerCount}</b> of ${session.player_count ?? session.players.length} answered</span><span class="live-clock ${remaining <= 5 ? 'urgent' : ''}">${icon('clock', 15)} <b data-countdown="${remaining}" data-deadline="${session.deadline}">${remaining}s</b></span></div>${phase === 'question' && remaining === 0 ? `<button class="btn btn-primary advance-btn" data-action="show-results">Reveal answer and rankings ${icon('arrow', 16)}</button>` : ''}</div>`;
  }
  if (!isHost) return participantShell(`<header class="participant-header"><span>${escapeHtml(session.quiz.title)}</span><b>${escapeHtml(player.name)}</b></header><section class="participant-panel">${centerContent}</section>`);
  return shell(`<div class="live-layout ${phase === 'lobby' ? 'host-lobby-layout' : ''}"><div class="live-topline"><div><span class="live-tag"><i></i> ${phase === 'finished' ? 'GAME COMPLETE' : 'LIVE QUIZ'}</span><span class="live-quiz-name">${escapeHtml(session.quiz.title)}</span></div><div class="live-top-actions">${isHost && phase === 'question' ? `<button class="btn btn-primary btn-small" data-action="show-results">Reveal answers</button>` : ''}</div></div><div class="live-main-panel">${centerContent}</div>${phase !== 'finished' && phase !== 'lobby' ? `<aside class="live-side-panel"><div class="room-pin-panel"><div class="live-panel-label">ROOM PIN</div><div class="room-pin-number">${session.pin}</div><div class="room-pin-bottom"><span>${icon('people', 14)} ${session.player_count ?? session.players.length} joined</span><button data-action="copy-pin">${icon('copy', 13)} Copy</button></div></div>${isHost && phase === 'reveal' ? `<button class="btn btn-primary next-question-btn" data-action="next-step">${qIndex + 1 >= total ? 'Show the podium' : 'Next question'} ${icon('arrow', 15)}</button>` : ''}</aside>` : ''}</div>`);
}

function joinScreen() {
  if (state.session?.status === 'lobby') {
    return `<div class="participant-waiting-screen"><h1>Waiting for the host</h1><p>You’re in, ${escapeHtml(state.playerName)}.</p><button class="text-btn" data-action="leave-room">Leave room</button></div>`;
  }
  return `<form class="participant-join-form" data-form="join"><h1>Join quiz</h1><label class="field-label">ROOM PIN<input class="text-input join-pin-input" name="pin" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="6-digit PIN" required value="${escapeHtml(state.joinPin)}"></label><label class="field-label">YOUR NAME<input class="text-input" name="name" maxlength="24" placeholder="Your name" required value="${escapeHtml(state.playerName)}"></label><button class="btn btn-primary join-submit" type="submit">Join quiz</button></form>`;
}

function ranking(session) { return rankPlayers(session.players); }

function qrUrl(value) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=${encodeURIComponent(value)}`;
}

function navigate(page) { state.page = page; render(); }
function toast(message) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  root.innerHTML = `<div class="toast-message">${icon('check', 17)} ${escapeHtml(message)}</div>`;
  setTimeout(() => { if (root.isConnected) root.innerHTML = ''; }, 2800);
}

function readEditor() {
  const title = document.getElementById('quiz-title')?.value.trim() || '';
  const description = document.getElementById('quiz-description')?.value.trim() || '';
  const category = document.getElementById('quiz-category')?.value || 'General';
  const questions = [...document.querySelectorAll('.question-editor')].map((card) => {
    const index = Number(card.dataset.questionIndex);
    const selected = card.querySelector('.correct-answer button');
    const answerInputs = [...card.querySelectorAll('[data-field="option"]')];
    return {
      text: card.querySelector('[data-field="text"]').value.trim(),
      options: Array.from({ length: 4 }, (_, optionIndex) => answerInputs[optionIndex]?.value.trim() || ''),
      correct: selected ? Number(selected.dataset.option) : Number(state.editingQuiz?.questions?.[index]?.correct ?? 0),
      seconds: Math.min(120, Math.max(5, Number(card.querySelector('[data-field="seconds"]').value) || 20)),
    };
  });
  return { title, description, category, scoring: state.editingQuiz?.scoring || 'speed', questions };
}

function render() {
  const app = document.getElementById('app');
  if (state.page === 'live' && state.session && ['question', 'reveal', 'finished'].includes(state.session.status) && !state.participant) {
    app.innerHTML = livePage();
  } else if (state.page === 'live' && state.participant && state.session && ['question', 'reveal', 'finished'].includes(state.session.status)) {
    app.innerHTML = livePage();
  } else {
    app.innerHTML = state.page === 'library' ? libraryPage() : state.page === 'results' ? resultsPage() : state.page === 'live' ? livePage() : homePage();
  }
  if (state.modal && !document.querySelector('.quiz-modal')) app.insertAdjacentHTML('beforeend', quizModal());
  if (state.modal) {
    const modal = document.querySelector('.quiz-modal');
    if (modal) modal.scrollTop = state.modalScroll || 0;
  }
}

function openEditor(quiz = null) {
  state.editingQuiz = quiz ? structuredClone(quiz) : null;
  state.modal = true;
  state.modalScroll = 0;
  render();
  setTimeout(() => document.getElementById('quiz-title')?.focus(), 0);
}

async function startHosting(id) {
  const quiz = state.quizzes.find((item) => item.id === id);
  if (!quiz) return;
  try {
    if (state.unsubscribe) state.unsubscribe();
    const created = await gameBackend.create(quiz);
    state.session = { ...created, quiz: structuredClone(quiz), current: 0, status: 'lobby', players: [], answer_counts: [], joinUrl: `${location.origin}${location.pathname}?join=${created.pin}` };
    state.participant = false;
    state.page = 'live';
    state.sessionStorageKey = `quizzy-session-${created.pin}`;
    state.sessionMeta = { id: created.id, pin: created.pin, credential: created.credential, hostId: created.hostId, host: true };
    try { localStorage.setItem(`quizzy-host-room-${created.pin}`, JSON.stringify(state.sessionMeta)); } catch { /* credentials remain in memory */ }
    await loadSavedReports();
    state.unsubscribe = gameBackend.subscribe(created.id, (event) => onRoomEvent(event));
    history.replaceState({}, '', `${location.pathname}?host=${created.pin}`);
    await refreshRemote();
  } catch (error) {
    if (!state.lastRefreshErrorAt || Date.now() - state.lastRefreshErrorAt > 5000) { toast(error.message); state.lastRefreshErrorAt = Date.now(); }
  }
}

async function refreshRemote() {
  if (!state.sessionMeta) return;
  if (state.refreshing) { state.refreshQueued = true; return; }
  state.refreshing = true;
  try {
    const snapshot = await gameBackend.snapshot(state.sessionMeta.id, state.sessionMeta.credential, state.sessionMeta.host);
    const signature = JSON.stringify([snapshot.status, snapshot.current, snapshot.deadline, snapshot.player_count, snapshot.answer_counts, snapshot.own_answer, snapshot.players?.map((p) => [p.id, p.name, p.score, p.lastEarned, p.rank])]);
    const changed = signature !== state.snapshotSignature;
    state.snapshotSignature = signature;
    state.session = { ...state.session, ...snapshot, credential: state.sessionMeta.credential };
    if (snapshot.status === 'finished' && state.sessionMeta.host) state.savedResults = snapshot.results || await gameBackend.results(state.sessionMeta.id, state.sessionMeta.credential);
    if (changed) render();
  } catch (error) {
    if (!state.lastRefreshErrorAt || Date.now() - state.lastRefreshErrorAt > 5000) { toast(error.message); state.lastRefreshErrorAt = Date.now(); }
  }
  finally {
    state.refreshing = false;
    if (state.refreshQueued) { state.refreshQueued = false; refreshRemote(); }
  }
}

async function loadSavedReports() {
  try {
    const identity = gameBackend.getHostIdentity();
    state.savedReports = await gameBackend.listResults(identity.id, identity.credential);
  } catch (error) { toast(error.message); }
}

async function startGame() {
  if (!state.session || !state.session.players.length) return;
  try { await gameBackend.start(state.session.id, state.sessionMeta.credential); await refreshRemote(); }
  catch (error) { toast(error.message); }
}

async function showResults() {
  if (!state.session) return;
  try { await gameBackend.reveal(state.session.id, state.sessionMeta.credential); await refreshRemote(); }
  catch (error) { toast(error.message); }
}

async function nextStep() {
  if (!state.session) return;
  try { await gameBackend.advance(state.session.id, state.sessionMeta.credential); await refreshRemote(); }
  catch (error) { toast(error.message); }
}

async function addParticipant(pin, name) {
  try {
    if (state.unsubscribe) state.unsubscribe();
    const joined = await gameBackend.join(pin, name);
    state.sessionMeta = { id: joined.id, pin: joined.pin, playerId: joined.playerId, credential: joined.credential, name: joined.name, host: false };
    state.participant = true; state.participantId = joined.playerId; state.playerName = joined.name; state.joinPin = pin; state.page = 'live';
    sessionStorage.setItem(`quizzy-player-room-${pin}`, JSON.stringify(state.sessionMeta));
    state.unsubscribe = gameBackend.subscribe(joined.id, (event) => onRoomEvent(event));
    await refreshRemote();
    history.replaceState({}, '', `${location.pathname}?join=${pin}`);
    return true;
  } catch (error) { toast(error.message); return false; }
}

function leaveRoom() {
  if (state.unsubscribe) state.unsubscribe();
  state.participant = false; state.participantId = null; state.session = null; state.joinPin = ''; state.playerName = '';
  state.sessionMeta = null; state.unsubscribe = null;
  history.replaceState({}, '', location.pathname);
  navigate('home');
}

async function restoreRoomFromUrl() {
  const params = new URLSearchParams(location.search);
  const joinPin = params.get('join');
  const hostPin = params.get('host');
  const pin = joinPin || hostPin;
  if (!pin) return false;
  try {
    const raw = (hostPin ? localStorage : sessionStorage).getItem(`${hostPin ? 'quizzy-host-room' : 'quizzy-player-room'}-${pin}`);
    if (!raw) return false;
    state.sessionMeta = JSON.parse(raw);
    state.participant = !hostPin;
    state.participantId = state.sessionMeta.playerId || null;
    state.playerName = state.sessionMeta.name || '';
    state.joinPin = pin;
    state.page = 'live';
    state.unsubscribe = gameBackend.subscribe(state.sessionMeta.id, (event) => onRoomEvent(event));
    await refreshRemote();
    return true;
  } catch (error) { toast(error.message); return false; }
}

function onRoomEvent() { refreshRemote(); }

function copyPin() {
  const pin = state.session?.pin;
  if (!pin) return;
  navigator.clipboard?.writeText(pin).then(() => toast('Room PIN copied!')).catch(() => toast(`Room PIN: ${pin}`));
}

function setScoring(mode) {
  const quiz = document.querySelector('.quiz-modal') ? readEditor() : (state.editingQuiz || { id: null, title: '', description: '', category: 'General', questions: [freshQuestion()] });
  state.editingQuiz = { ...quiz, id: state.editingQuiz?.id || null, scoring: mode };
  state.modalScroll = document.querySelector('.quiz-modal')?.scrollTop || 0;
  render();
}

function updateCountdowns() {
  if (!state.session || state.page !== 'live' || state.session.status !== 'question') return;
  const seconds = Math.max(0, Math.ceil((state.session.deadline - Date.now()) / 1000));
  document.querySelectorAll('[data-countdown]').forEach((node) => {
    node.textContent = `${seconds}s`;
    node.parentElement?.classList.toggle('urgent', seconds <= 5);
  });
  if (!state.participant && seconds === 0) {
    const footer = document.querySelector('.question-live-footer');
    if (footer && !document.querySelector('.advance-btn')) {
      footer.insertAdjacentHTML('afterend', `<button class="btn btn-primary advance-btn" data-action="show-results">Reveal answer and rankings ${icon('arrow', 16)}</button>`);
    }
  }
}

async function handleClick(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (action === 'home') { if (state.unsubscribe) state.unsubscribe(); state.unsubscribe = null; state.sessionMeta = null; state.participant = false; state.session = null; state.sessionStorageKey = null; history.replaceState({}, '', location.pathname); navigate('home'); }
  if (action === 'library') navigate('library');
  if (action === 'results') { await loadSavedReports(); navigate('results'); }
  if (action === 'new-quiz') openEditor();
  if (action === 'close-modal') {
    if (target.classList.contains('modal-backdrop') && event.target !== target) return;
    state.modal = false; state.editingQuiz = null; render();
  }
  if (action === 'save-quiz') {
    const quiz = readEditor();
    const validationErrors = validateQuiz(quiz);
    if (validationErrors.length) {
      if (validationErrors[0].includes('title')) document.getElementById('quiz-title')?.focus();
      else {
        const questionNumber = Number(validationErrors[0].match(/Question (\d+)/)?.[1]) - 1;
        if (Number.isInteger(questionNumber) && questionNumber >= 0) {
          const card = document.querySelector(`[data-question-index="${questionNumber}"]`);
          if (validationErrors[0].includes('needs four answers')) {
            const answers = [...(card?.querySelectorAll('[data-field="option"]') || [])];
            answers.forEach((input) => input.classList.toggle('invalid-field', !input.value.trim()));
            (answers.find((input) => !input.value.trim()) || answers[0])?.focus();
            toast(`Fill in all four answer choices for Question ${questionNumber + 1}.`);
            return;
          }
          card?.querySelector('.question-text-input')?.focus();
        }
      }
      toast(validationErrors[0]); return;
    }
    quiz.id = state.editingQuiz?.id || `quiz-${Date.now()}`;
    quiz.scoring = state.editingQuiz?.scoring || 'speed';
    quiz.updatedAt = Date.now();
    const existing = state.quizzes.findIndex((item) => item.id === quiz.id);
    if (existing >= 0) state.quizzes[existing] = quiz; else state.quizzes.unshift(quiz);
    saveQuizzes(); state.modal = false; state.editingQuiz = null; navigate('library'); toast('Your quiz is saved and ready to go!');
  }
  if (action === 'add-question') {
    const quiz = readEditor();
    if (quiz.questions.length >= 30) { toast('A quiz can have up to 30 questions.'); return; }
    state.modalScroll = document.querySelector('.quiz-modal')?.scrollTop || 0;
    state.editingQuiz = { ...quiz, id: state.editingQuiz?.id || null, scoring: state.editingQuiz?.scoring || 'speed', questions: [...quiz.questions, freshQuestion()] };
    render(); document.querySelectorAll('.question-editor')[quiz.questions.length]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  if (action === 'remove-question') {
    const quiz = readEditor(); const index = Number(target.dataset.index);
    quiz.questions.splice(index, 1);
    state.modalScroll = document.querySelector('.quiz-modal')?.scrollTop || 0;
    state.editingQuiz = { ...quiz, id: state.editingQuiz?.id || null, scoring: state.editingQuiz?.scoring || 'speed' };
    render();
  }
  if (action === 'mark-correct') {
    const quiz = readEditor(); const qi = Number(target.dataset.question), oi = Number(target.dataset.option);
    quiz.questions[qi].correct = oi;
    state.modalScroll = document.querySelector('.quiz-modal')?.scrollTop || 0;
    state.editingQuiz = { ...quiz, id: state.editingQuiz?.id || null, scoring: state.editingQuiz?.scoring || 'speed' };
    render();
  }
  if (action === 'set-scoring') setScoring(target.dataset.scoring);
  if (action === 'preview-quiz') {
    const quiz = state.quizzes.find((q) => q.id === target.dataset.id);
    if (quiz) { state.previewQuiz = quiz; openEditor(quiz); }
  }
  if (action === 'host-quiz') startHosting(target.dataset.id);
  if (action === 'quiz-menu') {
    const quiz = state.quizzes.find((q) => q.id === target.dataset.id);
    if (!quiz) return;
    state.editingQuiz = structuredClone(quiz); state.modal = true; render();
  }
  if (action === 'filter') { state.tab = target.dataset.tab; navigate('library'); }
  if (action === 'show-results') showResults();
  if (action === 'next-step') nextStep();
  if (action === 'start-game') startGame();
  if (action === 'end-game') toast('Complete the current question and use the final podium to finish this game.');
  if (action === 'copy-pin') copyPin();
  if (action === 'demo-join') toast('Open the join link on another device to try the participant view.');
  if (action === 'submit-answer') {
    const session = state.session; const player = session?.players.find((p) => p.id === state.participantId) || (session?.own_player?.id === state.participantId ? session.own_player : null);
    if (!session || !player || session.status !== 'question') return;
    const key = `${session.id}:${session.current}:${player.id}`;
    if (state.answers.has(key) || session.own_answer !== null && session.own_answer !== undefined) return;
    try { await gameBackend.answer(session.id, player.id, state.sessionMeta.credential, Number(target.dataset.option)); state.answers.set(key, Number(target.dataset.option)); await refreshRemote(); }
    catch (error) { toast(error.message); }
  }
  if (action === 'leave-room') leaveRoom();
  if (action === 'menu') document.getElementById('sidebar')?.classList.toggle('sidebar-open');
  if (action === 'capacity') toast('Invite up to 500 players with a PIN or QR code.');
  if (action === 'how-it-works') toast('Create a quiz, share your room PIN, and start when everyone’s ready.');
  if (action === 'tip-next') {
    const tip = document.querySelector('.tip-card h3');
    const tips = [['Keep it short.<br>Keep it <em>snappy.</em>', 'Quizzes with 5–10 questions keep the energy up and the good times rolling.'], ['Make it a little<br><em>surprising.</em>', 'Mix in an unexpected question to keep everyone guessing.'], ['Every answer is<br><em>a moment.</em>', 'A friendly timer makes even the easiest questions more exciting.']];
    state.tipIndex = ((state.tipIndex || 0) + 1) % tips.length;
    tip.innerHTML = tips[state.tipIndex][0]; document.querySelector('.tip-card > p').textContent = tips[state.tipIndex][1];
    document.querySelector('.tip-progress').innerHTML = tips.map((_, i) => `<i class="${i === state.tipIndex ? 'active' : ''}"></i>`).join('');
  }
}

document.addEventListener('click', handleClick);
document.addEventListener('input', (event) => {
  if (event.target.matches('.question-editor [data-field="option"]') && event.target.value.trim()) event.target.classList.remove('invalid-field');
  if (event.target.id === 'quiz-search') { state.search = event.target.value; const position = event.target.selectionStart; render(); const next = document.getElementById('quiz-search'); next?.focus(); next?.setSelectionRange(position, position); }
  if (event.target.matches('[name="pin"]')) state.joinPin = event.target.value;
  if (event.target.matches('[name="name"]')) state.playerName = event.target.value;
});
document.addEventListener('submit', async (event) => {
  if (event.target.matches('[data-form="join"]')) {
    event.preventDefault();
    const data = new FormData(event.target); const pin = String(data.get('pin') || '').replace(/\D/g, '').slice(0, 6); const name = String(data.get('name') || '').trim().slice(0, 24);
    if (pin.length !== 6) { toast('Room PINs have six numbers.'); return; }
    if (!name) { toast('Add a name so your host knows you made it.'); return; }
    await addParticipant(pin, name);
  }
});
window.addEventListener('popstate', () => {
  const params = new URLSearchParams(location.search); const pin = params.get('join');
  if (pin) { state.joinPin = pin; state.page = 'live'; state.participant = false; render(); }
  else navigate('home');
});
window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY && event.newValue) { try { state.quizzes = JSON.parse(event.newValue); render(); } catch { /* ignore malformed storage */ } }
});
setInterval(updateCountdowns, 250);
setInterval(() => {
  if (state.sessionMeta?.host && state.page === 'live' && ['lobby', 'question'].includes(state.session?.status)) refreshRemote();
}, 900);

const initialParams = new URLSearchParams(location.search);
if (initialParams.has('join') || initialParams.has('host')) {
  state.joinPin = initialParams.get('join') || '';
  state.page = initialParams.has('host') ? 'live' : 'live';
  restoreRoomFromUrl().then((restored) => { if (!restored) render(); });
} else render();
