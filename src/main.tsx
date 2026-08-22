import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from './supabase';
import { buildHouse, call, capture, dealGame, drop, emptyState, teamIdFor } from './game';
import { playBot } from './bot';
import type { BotLevel, Card, FloorItem, GameState, Player } from './game';
import './styles.css';

const id = () => crypto.randomUUID();
const roomFromUrl = () => new URLSearchParams(location.search).get('room')?.toUpperCase() || '';
const cardLabel = (card: Card) => `${card.rank}${card.suit}`;
const itemLabel = (item: FloorItem) => 'kind' in item ? `House ${item.value}: ${item.cards.map(cardLabel).join(' ')}` : cardLabel(item);
const botLevels: BotLevel[] = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];
const requestMessage = (error: unknown) => {
  if (error instanceof TypeError && /fetch|network/i.test(error.message)) {
    return 'Cannot reach Supabase. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local, then restart the app.';
  }
  return error instanceof Error ? error.message : 'The request could not be completed.';
};
const databaseMessage = (message: string) => /invalid api key/i.test(message)
  ? 'Supabase rejected the saved key. Copy the current publishable key from your Supabase project into .env.local, then refresh this page.'
  : message;

function App() {
  const [pid] = useState(() => sessionStorage.getItem('baazi-pid') || id());
  const [name, setName] = useState('');
  const [code, setCode] = useState(roomFromUrl());
  const [state, setState] = useState<GameState | null>(null);
  const [message, setMessage] = useState('');
  const [cut, setCut] = useState(26);
  const [botCount, setBotCount] = useState(0);
  const [botLevel, setBotLevel] = useState<BotLevel>('Intermediate');
  const [callValue, setCallValue] = useState(9);
  const [cardId, setCardId] = useState('');
  const [floorIds, setFloorIds] = useState<string[]>([]);
  useEffect(() => sessionStorage.setItem('baazi-pid', pid), [pid]);

  async function save(next: GameState) {
    const { error } = await supabase.from('baazi_rooms').update({ state: next }).eq('code', code);
    if (error) setMessage(error.message); else setState(next);
  }

  async function create() {
    try {
      let c = Math.random().toString(36).slice(2, 8).toUpperCase();
      let st: GameState = { ...emptyState(pid), players: [{ id: pid, name: name.trim() || 'Host' }] };
      let { error } = await supabase.from('baazi_rooms').insert({ code: c, state: st });
      if (error) return setMessage(databaseMessage(error.message));
      setCode(c);
      setState(st);
      history.replaceState({}, '', `?room=${c}`);
      setMessage('Share the link with your family.');
    } catch (error) {
      setMessage(requestMessage(error));
    }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(location.href);
      setMessage('Invite link copied.');
    } catch {
      setMessage('Copy the address from your browser and send it to your family.');
    }
  }

  async function join() {
    try {
      if (!code) return setMessage('Enter a room code.');
      const { data, error } = await supabase.from('baazi_rooms').select('*').eq('code', code).single();
      if (error) return setMessage(databaseMessage(error.message));
      if (!data) return setMessage('Table not found.');
      let next = data.state as GameState;
      if (!next.players.some(player => player.id === pid)) {
        if (next.phase !== 'waiting') return setMessage('This hand has already started.');
        if (next.players.length >= 4) return setMessage('Table full.');
        next = { ...next, players: [...next.players, { id: pid, name: name.trim() || `Player ${next.players.length + 1}` }] };
        const update = await supabase.from('baazi_rooms').update({ state: next }).eq('code', code);
        if (update.error) return setMessage(databaseMessage(update.error.message));
      }
      setState(next); history.replaceState({}, '', `?room=${code}`);
    } catch (error) {
      setMessage(requestMessage(error));
    }
  }

  useEffect(() => {
    if (!code) return;
    const channel = supabase.channel(`room-${code}`).on('postgres_changes', { event: '*', schema: 'public', table: 'baazi_rooms', filter: `code=eq.${code}` }, event => {
      if (event.new) setState((event.new as { state: GameState }).state);
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [code]);

  useEffect(() => {
    if (!state || !state.turnPlayerId || state.phase !== 'playing' && state.phase !== 'calling') return;
    const player = state.players.find(item => item.id === state.turnPlayerId);
    if (!player?.bot) return;
    const timer = window.setTimeout(() => { try { save(playBot(state, player.id)); } catch { setMessage('Bot could not make a valid move.'); } }, 650);
    return () => window.clearTimeout(timer);
  }, [state?.moveNumber, state?.phase, state?.turnPlayerId]);

  const me = state?.players.find(player => player.id === pid);
  const hand = state?.hands[pid] || [];
  const isTurn = state?.phase === 'playing' && state.turnPlayerId === pid;
  const selectedCard = hand.find(card => card.id === cardId);
  const doMove = (fn: (current: GameState) => GameState) => { if (!state) return; try { save(fn(state)); setCardId(''); setFloorIds([]); } catch (error) { setMessage(error instanceof Error ? error.message : 'Invalid move.'); } };
  const addBots = () => {
    if (!state || state.hostPlayerId !== pid || state.phase !== 'waiting') return;
    const humans = state.players.filter(player => !player.bot);
    const available = Math.max(0, 4 - humans.length);
    const bots: Player[] = Array.from({ length: Math.min(botCount, available) }, (_, index) => ({ id: `bot-${index + 1}`, name: `Bot ${index + 1} (${botLevel})`, bot: true, botLevel }));
    doMove(current => ({ ...current, players: [...humans, ...bots] }));
  };
  const toggleFloor = (item: FloorItem) => setFloorIds(ids => ids.includes(item.id) ? ids.filter(id => id !== item.id) : [...ids, item.id]);

  return <main><header><b>BAAZI</b><small>Play cards. Keep it simple.</small></header>
    {!state ? <section className="welcome"><p className="eyebrow">A private table for family</p><h1>Start a game in seconds.</h1><p>Make a table, send one link, and everyone plays in their browser. No accounts.</p><input aria-label="Your name" placeholder="Your name" value={name} onChange={event => setName(event.target.value)} /><button className="primary" onClick={create}>Create a family table</button><div className="join"><span>Already have an invite?</span><input aria-label="Room code" placeholder="Six-letter room code" value={code} onChange={event => setCode(event.target.value.toUpperCase())} /><button onClick={join}>Join table</button></div>{message && <p className="notice">{message}</p>}</section> : <>
      <section className="table"><div className="table-top"><div><span className="eyebrow">PRIVATE TABLE · {code}</span><h2>{state.phase === 'waiting' ? 'Waiting for players' : 'Game in progress'}</h2></div><button onClick={copyInvite}>Copy invite link</button></div><div className="players">{state.players.map(player => <span key={player.id}>{player.name}{player.bot ? ' · bot' : ''}{state.turnPlayerId === player.id ? ' · turn' : ''}</span>)}</div><p className="scoreline">{Object.entries(state.scores).map(([team, score]) => `${team === (me ? teamIdFor(state.players, me.id) : '') ? 'Your team' : team}: ${score}`).join(' · ')}</p><h3>FLOOR {state.floorRevealed ? '' : '· hidden until the call'}</h3><div className="cards">{state.floorRevealed && state.floor.map(item => <button key={item.id} className={floorIds.includes(item.id) ? 'selected' : ''} disabled={!isTurn} onClick={() => toggleFloor(item)}>{itemLabel(item)}</button>)}</div><h3>{me?.name} · {hand.length} cards{state.hiddenHands[pid]?.length ? ` · ${state.hiddenHands[pid].length} hidden` : ''}{state.reserveHands[pid]?.length ? ` · ${state.reserveHands[pid].length} next round` : ''}</h3><div className="cards">{hand.map(card => <button key={card.id} className={cardId === card.id ? 'selected' : ''} disabled={!isTurn} onClick={() => setCardId(card.id)}>{cardLabel(card)}</button>)}</div></section>
      <section className="controls"><p>{message || state.message || 'Connected to your private table.'}</p>
        {state.phase === 'waiting' && state.hostPlayerId === pid && <><p>{state.players.length === 1 ? 'Share the invite link, or add bots to begin.' : `${state.players.length} players ready.`}</p><label>Bots: {botCount}</label><input type="range" min="0" max="3" value={botCount} onChange={event => setBotCount(+event.target.value)} /><select value={botLevel} onChange={event => setBotLevel(event.target.value as BotLevel)}>{botLevels.map(level => <option key={level}>{level}</option>)}</select><button onClick={addBots}>Add bots</button><label>Cut position: {cut}</label><input type="range" min="1" max="51" value={cut} onChange={event => setCut(+event.target.value)} /><button className="primary" disabled={state.players.length < 2} onClick={() => doMove(current => dealGame(current, cut))}>Start game</button></>}
        {state.phase === 'calling' && state.callerPlayerId === pid && <><label>Blind call: {callValue}</label><input type="range" min="9" max="13" value={callValue} onChange={event => setCallValue(+event.target.value)} /><button onClick={() => doMove(current => call(current, pid, callValue))}>Call {callValue}</button></>}
        {isTurn && <><p>Select one hand card and floor cards, then choose a move.</p><button disabled={!selectedCard} onClick={() => doMove(current => drop(current, pid, cardId))}>Drop</button><button disabled={!selectedCard || !floorIds.length} onClick={() => doMove(current => buildHouse(current, pid, cardId, floorIds))}>Build house</button><button disabled={!selectedCard || !floorIds.length} onClick={() => doMove(current => capture(current, pid, cardId, floorIds))}>Capture</button></>}
        {state.phase === 'handComplete' && state.hostPlayerId === pid && <button onClick={() => doMove(current => dealGame(current, cut))}>Deal next hand</button>}
        {state.phase === 'gameOver' && <p>Baazi complete.</p>}
      </section></>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
