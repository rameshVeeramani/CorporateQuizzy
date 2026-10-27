import { isBackendConfigured, supabase } from './supabaseClient.js';

function credential(cryptoApi) {
  const bytes = cryptoApi.getRandomValues(new Uint8Array(32));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hostUuid(cryptoApi) {
  if (typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function errorMessage(error) {
  const raw = error?.message || 'The quiz service could not complete that action.';
  const known = {
    PIN_COLLISION: 'That room PIN was just taken. Please start again.',
    ROOM_NOT_FOUND: 'We couldn’t find that room. Check the PIN and try again.',
    GAME_ALREADY_STARTED: 'That quiz has already started.',
    ROOM_FULL: 'This room has reached its 500-player limit.',
    NAME_TAKEN: 'That name is already in the room. Try adding an initial.',
    ANSWER_ALREADY_SUBMITTED: 'Your answer is already locked in.',
    QUESTION_CLOSED: 'Time is up for this question.',
    UNAUTHORIZED: 'This game link has expired. Rejoin the room.',
  };
  const code = Object.keys(known).find((item) => raw.includes(item));
  return code ? known[code] : raw.replace(/^.*(?:Error:|exception)\s*/i, '').slice(0, 180);
}

export function createGameBackend({ client, configured = Boolean(client), storage = globalThis.localStorage, session = globalThis.sessionStorage, cryptoApi = globalThis.crypto, random = Math.random }) {
  let volatileHostIdentity = null;
  async function rpc(name, args) {
    if (!configured || !client) throw new Error('Live quiz hosting is not configured. Add your Supabase URL and anon key to .env.local, run supabase/schema.sql in your Supabase project, then restart the app.');
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(errorMessage(error));
    return data;
  }

  function hostIdentity() {
    if (volatileHostIdentity) return volatileHostIdentity;
    let stored = null;
    try {
      stored = JSON.parse(storage.getItem('quizzy-host-identity') || 'null');
    } catch { /* keep the active game usable when storage is blocked or malformed */ }
    if (stored?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored.id) && stored?.credential) return stored;
    const created = { id: hostUuid(cryptoApi), credential: credential(cryptoApi) };
    volatileHostIdentity = created;
    try { storage.setItem('quizzy-host-identity', JSON.stringify(created)); } catch { /* this identity remains available for the current page session */ }
    return created;
  }

  return {
    isConfigured: Boolean(configured && client),
    getHostIdentity: hostIdentity,
    async create(quiz) {
      const owner = hostIdentity();
      let lastError;
      for (let attempt = 0; attempt < 4; attempt++) {
        const pin = String(100000 + Math.floor(random() * 900000));
        try {
          const data = await rpc('quizzy_create_game', { p_pin: pin, p_host_id: owner.id, p_credential: owner.credential, p_quiz: quiz });
          return { id: data.game_id, pin: data.pin, credential: owner.credential, hostId: owner.id };
        } catch (error) {
          lastError = error;
          if (!String(error.message).includes('taken') && !String(error.message).includes('PIN_COLLISION')) throw error;
        }
      }
      throw lastError;
    },
    async join(pin, name) {
      const playerCredential = credential(cryptoApi);
      const data = await rpc('quizzy_join_game', { p_pin: pin, p_name: name, p_credential: playerCredential });
      session.setItem(`quizzy-player-${data.game_id}`, JSON.stringify({ id: data.player_id, credential: playerCredential }));
      return { id: data.game_id, pin: data.pin, playerId: data.player_id, credential: playerCredential, name: data.name };
    },
    async snapshot(gameId, credentialValue, isHost) {
      const data = await rpc('quizzy_game_state', { p_game_id: gameId, p_credential: credentialValue, p_is_host: isHost });
      return { ...data, deadline: data.deadline ? Date.parse(data.deadline) : null, current: data.current ?? data.current_question };
    },
    start: (gameId, credentialValue) => rpc('quizzy_start_game', { p_game_id: gameId, p_credential: credentialValue }),
    answer: (gameId, playerId, credentialValue, option) => rpc('quizzy_submit_answer', { p_game_id: gameId, p_player_id: playerId, p_credential: credentialValue, p_option: option }),
    reveal: (gameId, credentialValue) => rpc('quizzy_reveal', { p_game_id: gameId, p_credential: credentialValue }),
    advance: (gameId, credentialValue) => rpc('quizzy_advance', { p_game_id: gameId, p_credential: credentialValue }),
    results: (gameId, credentialValue) => rpc('quizzy_host_results', { p_game_id: gameId, p_credential: credentialValue }),
    listResults: (hostId, credentialValue) => rpc('quizzy_list_results', { p_host_id: hostId, p_credential: credentialValue }),
    subscribe(gameId, callback) {
      if (!configured || !client) return () => {};
      const channel = client.channel(`quizzy:${gameId}`, { config: { broadcast: { self: false }, private: false } })
        .on('broadcast', { event: 'room_refresh' }, callback).subscribe();
      return () => client.removeChannel(channel);
    },
  };
}

export const gameBackend = createGameBackend({ client: supabase, configured: isBackendConfigured });
