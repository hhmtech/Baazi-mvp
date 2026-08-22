export type Suit = '♠' | '♥' | '♦' | '♣';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
export type Card = { id: string; suit: Suit; rank: Rank };
export type BotLevel = 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
export type Player = { id: string; name: string; bot?: boolean; botLevel?: BotLevel };
export type House = { kind: 'house'; id: string; value: number; cementingCard: Card; cards: Card[] };
export type FloorItem = Card | House;
export type TeamPiles = Record<string, Card[]>;
export type GamePhase = 'waiting' | 'calling' | 'playing' | 'handComplete' | 'gameOver';

export type GameState = {
  phase: GamePhase;
  players: Player[];
  hands: Record<string, Card[]>;
  hiddenHands: Record<string, Card[]>;
  reserveHands: Record<string, Card[]>;
  dealRound: number;
  floor: FloorItem[];
  floorRevealed: boolean;
  captured: TeamPiles;
  sweepPoints: Record<string, number>;
  scores: Record<string, number>;
  roundScores: Record<string, number>;
  hostPlayerId: string;
  dealerPlayerId: string | null;
  turnPlayerId: string | null;
  callerPlayerId: string | null;
  calledValue: number | null;
  lastPointCaptureTeam: string | null;
  moveNumber: number;
  winnerTeam: string | null;
  message?: string;
};

const suits: Suit[] = ['♠', '♥', '♦', '♣'];
const ranks: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const house = (item: FloorItem): item is House => 'kind' in item && item.kind === 'house';

export const rankValue = (rank: Rank): number => {
  if (rank === 'A') return 1;
  if (rank === 'J') return 11;
  if (rank === 'Q') return 12;
  if (rank === 'K') return 13;
  return Number(rank);
};

export const cardPoints = (card: Card): number => {
  if (card.suit === '♠') return rankValue(card.rank);
  if (card.rank === 'A' && (card.suit === '♥' || card.suit === '♦' || card.suit === '♣')) return 1;
  return card.rank === '10' && card.suit === '♦' ? 6 : 0;
};

export function deck(): Card[] {
  return suits.flatMap(suit => ranks.map(rank => ({ id: `${rank}${suit}`, suit, rank })));
}

export function shuffle(cards: Card[]): Card[] {
  const shuffled = [...cards];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export const teamIdFor = (players: Player[], playerId: string) => {
  const index = players.findIndex(player => player.id === playerId);
  return players.length === 4 ? `team-${index % 2}` : `team-${index}`;
};

export const teamIds = (players: Player[]) => [...new Set(players.map(player => teamIdFor(players, player.id)))];
export const itemCards = (item: FloorItem): Card[] => house(item) ? item.cards : [item];
export const floorCards = (floor: FloorItem[]) => floor.flatMap(itemCards);
export const floorItemValue = (item: FloorItem) => house(item) ? item.value : rankValue(item.rank);

export function emptyState(hostPlayerId: string): GameState {
  return {
    phase: 'waiting', players: [], hands: {}, hiddenHands: {}, reserveHands: {}, dealRound: 0, floor: [], floorRevealed: false,
    captured: {}, sweepPoints: {}, scores: {}, roundScores: {}, hostPlayerId, dealerPlayerId: null,
    turnPlayerId: null, callerPlayerId: null, calledValue: null, lastPointCaptureTeam: null,
    moveNumber: 0, winnerTeam: null
  };
}

export function dealGame(previous: GameState, cut: number): GameState {
  const { players } = previous;
  if (players.length < 2 || players.length > 4) throw new Error('Baazi needs 2 to 4 players.');
  let cards = shuffle(deck());
  const at = Math.max(1, Math.min(51, Math.floor(cut)));
  cards = [...cards.slice(at), ...cards.slice(0, at)];
  const perPlayer = players.length === 2 ? 12 : (52 - 4) / players.length;
  const dealerPlayerId = previous.dealerPlayerId && players.some(p => p.id === previous.dealerPlayerId)
    ? previous.dealerPlayerId : players[0].id;
  const firstIndex = players.findIndex(player => player.id === dealerPlayerId);
  const order = players.map((_, index) => players[(firstIndex + index) % players.length]);
  const allHands: Record<string, Card[]> = {};
  let cursor = 0;
  order.forEach(player => { allHands[player.id] = cards.slice(cursor, cursor += perPlayer); });
  const floor = cards.slice(cursor, cursor + 4);
  cursor += 4;
  const reserveHands: Record<string, Card[]> = {};
  order.forEach(player => { reserveHands[player.id] = players.length === 2 ? cards.slice(cursor, cursor += 12) : []; });
  const first = order[0];
  const hands: Record<string, Card[]> = {};
  const hiddenHands: Record<string, Card[]> = {};
  players.forEach(player => {
    hands[player.id] = player.id === first.id ? allHands[player.id].slice(0, 4) : allHands[player.id];
    hiddenHands[player.id] = player.id === first.id ? allHands[player.id].slice(4) : [];
  });
  const ids = teamIds(players);
  return {
    ...previous, phase: 'calling', hands, hiddenHands, reserveHands, dealRound: 1, floor, floorRevealed: false,
    captured: Object.fromEntries(ids.map(id => [id, []])), sweepPoints: Object.fromEntries(ids.map(id => [id, 0])),
    roundScores: Object.fromEntries(ids.map(id => [id, 0])), dealerPlayerId: first.id, turnPlayerId: first.id,
    callerPlayerId: first.id, calledValue: null, lastPointCaptureTeam: null, moveNumber: 0, winnerTeam: null,
    message: `${first.name} must call 9–13 before the floor is revealed.`
  };
}

function fullHand(state: GameState, playerId: string) {
  return [...(state.hands[playerId] || []), ...(state.hiddenHands[playerId] || [])];
}

function nextPlayer(state: GameState, playerId: string) {
  const i = state.players.findIndex(player => player.id === playerId);
  return state.players[(i + 1) % state.players.length].id;
}

function nextPlayerWithCards(state: GameState, playerId: string) {
  let candidate = nextPlayer(state, playerId);
  for (let i = 0; i < state.players.length; i++) {
    if (fullHand(state, candidate).length) return candidate;
    candidate = nextPlayer(state, candidate);
  }
  return null;
}

function requireTurn(state: GameState, playerId: string) {
  if (state.phase !== 'playing' || state.turnPlayerId !== playerId) throw new Error('It is not your turn.');
}

function takeCard(state: GameState, playerId: string, cardId: string) {
  const hand = state.hands[playerId] || [];
  const card = hand.find(item => item.id === cardId);
  if (!card) throw new Error('You must have the exact card in your hand.');
  return { card, hands: { ...state.hands, [playerId]: hand.filter(item => item.id !== cardId) } };
}

function selected(state: GameState, ids: string[]) {
  const result = ids.map(id => state.floor.find(item => item.id === id));
  if (result.some(item => !item) || new Set(ids).size !== ids.length) throw new Error('Choose cards currently on the floor.');
  return result as FloorItem[];
}

function removeFloor(state: GameState, ids: string[]) {
  return state.floor.filter(item => !ids.includes(item.id));
}

function revealCaller(state: GameState, playerId: string, hands: Record<string, Card[]>) {
  const extra = state.hiddenHands[playerId] || [];
  return {
    hands: { ...hands, [playerId]: [...(hands[playerId] || []), ...extra] },
    hiddenHands: { ...state.hiddenHands, [playerId]: [] }
  };
}

function startSecondRound(state: GameState): GameState {
  const hands = Object.fromEntries(state.players.map(player => [player.id, state.reserveHands[player.id] || []]));
  const first = state.callerPlayerId || state.dealerPlayerId;
  return {
    ...state,
    hands,
    reserveHands: Object.fromEntries(state.players.map(player => [player.id, []])),
    dealRound: 2,
    turnPlayerId: first,
    message: 'Round two: each player receives their final 12 cards.'
  };
}

export function call(state: GameState, playerId: string, value: number): GameState {
  if (state.phase !== 'calling' || state.callerPlayerId !== playerId) throw new Error('Only the first player may call now.');
  if (!Number.isInteger(value) || value < 9 || value > 13) throw new Error('Call a number from 9 to 13.');
  const allCanCapture = state.players.every(player => fullHand(state, player.id).some(card => rankValue(card.rank) >= 9 && rankValue(card.rank) <= 13));
  if (!allCanCapture) return { ...dealGame(state, 26), message: 'No valid 9–13 card was dealt to every player. The hand was redealt.' };
  return {
    ...state,
    phase: 'playing',
    floorRevealed: true,
    calledValue: value,
    message: `${state.players.find(p => p.id === playerId)?.name} called ${value}.`
  };
}

function afterMove(state: GameState, playerId: string, isCapture: boolean, capturedCards: Card[] = [], sweep = 0): GameState {
  const team = teamIdFor(state.players, playerId);
  const captured = isCapture ? { ...state.captured, [team]: [...(state.captured[team] || []), ...capturedCards] } : state.captured;
  const lastPointCaptureTeam = isCapture && capturedCards.some(card => cardPoints(card) > 0) ? team : state.lastPointCaptureTeam;
  const sweepPoints = sweep ? { ...state.sweepPoints, [team]: (state.sweepPoints[team] || 0) + sweep } : state.sweepPoints;
  const advanced = { ...state, captured, lastPointCaptureTeam, sweepPoints, moveNumber: state.moveNumber + 1 };
  if (Object.values(advanced.hands).some(hand => hand.length > 0) || Object.values(advanced.hiddenHands).some(hand => hand.length > 0)) {
    return { ...advanced, turnPlayerId: nextPlayerWithCards(advanced, playerId) };
  }
  if (Object.values(advanced.reserveHands).some(hand => hand.length > 0)) return startSecondRound(advanced);
  return finishHand(advanced);
}

export function drop(state: GameState, playerId: string, cardId: string): GameState {
  requireTurn(state, playerId);
  const { card, hands } = takeCard(state, playerId, cardId);
  const revealed = playerId === state.callerPlayerId && state.moveNumber === 0
    ? revealCaller(state, playerId, hands)
    : { hands, hiddenHands: state.hiddenHands };
  return afterMove({ ...state, ...revealed, floor: [...state.floor, card] }, playerId, false);
}

export function buildHouse(state: GameState, playerId: string, cardId: string, floorIds: string[]): GameState {
  requireTurn(state, playerId);
  const { card, hands } = takeCard(state, playerId, cardId);
  const value = rankValue(card.rank);
  if (value < 9 || value > 13) throw new Error('Houses may only be built with a 9 through King.');
  const targets = selected(state, floorIds);
  if (!targets.length || targets.some(house) || targets.reduce((sum, item) => sum + floorItemValue(item), 0) !== value) {
    throw new Error('Choose floor cards that add exactly to the house value.');
  }
  const revealed = playerId === state.callerPlayerId && state.moveNumber === 0
    ? revealCaller(state, playerId, hands)
    : { hands, hiddenHands: state.hiddenHands };
  const built: House = {
    kind: 'house',
    id: `house-${crypto.randomUUID()}`,
    value,
    cementingCard: card,
    cards: [...targets.flatMap(itemCards), card]
  };
  return afterMove({ ...state, ...revealed, floor: [...removeFloor(state, floorIds), built] }, playerId, false);
}

export function capture(state: GameState, playerId: string, cardId: string, floorIds: string[]): GameState {
  requireTurn(state, playerId);
  const { card, hands } = takeCard(state, playerId, cardId);
  const targets = selected(state, floorIds);
  if (!targets.length) throw new Error('Choose something to capture.');
  const value = rankValue(card.rank);
  const loneTarget = state.floor.length === 1 && targets.length === 1;
  const sameRankLone = loneTarget && (house(targets[0]) ? targets[0].cementingCard.rank : targets[0].rank) === card.rank;
  const capturesHouse = targets.some(house);
  if (capturesHouse && !sameRankLone) throw new Error('A cemented house can only be captured alone with the same rank.');
  const normal = !capturesHouse && value >= 9 && value <= 13 && targets.reduce((sum, item) => sum + floorItemValue(item), 0) === value;
  if (!normal && !sameRankLone) throw new Error('Capture cards must exactly match a 9–13 floor total, or the last card/house by rank.');
  const remaining = removeFloor(state, floorIds);
  const isSweep = sameRankLone && remaining.length === 0;
  const revealed = playerId === state.callerPlayerId && state.moveNumber === 0
    ? revealCaller(state, playerId, hands)
    : { hands, hiddenHands: state.hiddenHands };
  const lastPlay =
    Object.values(revealed.hands).flat().length === 0 &&
    Object.values(revealed.hiddenHands).flat().length === 0 &&
    Object.values(state.reserveHands).flat().length === 0;
  const sweep = isSweep ? (state.moveNumber === 0 ? 25 : lastPlay ? 0 : 50) : 0;
  return afterMove({ ...state, ...revealed, floor: remaining }, playerId, true, [...targets.flatMap(itemCards), card], sweep);
}

export function finishHand(state: GameState): GameState {
  const leftovers = floorCards(state.floor);
  const fallbackTeam = state.lastPointCaptureTeam || teamIdFor(state.players, state.dealerPlayerId || state.players[0].id);
  const captured = leftovers.length
    ? { ...state.captured, [fallbackTeam]: [...(state.captured[fallbackTeam] || []), ...leftovers] }
    : state.captured;
  const ids = teamIds(state.players);
  const roundScores = Object.fromEntries(ids.map(team => [
    team,
    (captured[team] || []).reduce((sum, card) => sum + cardPoints(card), 0) + (state.sweepPoints[team] || 0)
  ]));
  const scores = Object.fromEntries(ids.map(team => [team, Math.max(0, (state.scores[team] || 0) + roundScores[team])]));
  const winnerTeam = ids.find(team => scores[team] - scores[ids.find(other => other !== team)!] >= 100) || null;
  const loser = ids.find(team => team !== winnerTeam) || ids.reduce((lowest, team) => scores[team] < scores[lowest] ? team : lowest, ids[0]);
  const nextDealer = state.players.find(player => teamIdFor(state.players, player.id) === loser)?.id || state.dealerPlayerId;
  return {
    ...state,
    phase: winnerTeam ? 'gameOver' : 'handComplete',
    floor: [],
    captured,
    roundScores,
    scores,
    winnerTeam,
    dealerPlayerId: nextDealer,
    turnPlayerId: null,
    message: winnerTeam ? 'Baazi! A team leads by 100.' : 'Hand complete. The losing team deals next.'
  };
}
