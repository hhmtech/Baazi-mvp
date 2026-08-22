import { buildHouse, call, capture, drop, floorItemValue, rankValue } from './game';
import type { BotLevel, Card, FloorItem, GameState } from './game';

export type BotAction =
  | { kind: 'call'; value: number }
  | { kind: 'drop'; cardId: string }
  | { kind: 'build'; cardId: string; floorIds: string[] }
  | { kind: 'capture'; cardId: string; floorIds: string[] };

const combinations = <T>(items: T[]): T[][] => items.reduce<T[][]>((all, item) => [...all, ...all.map(set => [...set, item])], [[]]).filter(set => set.length > 0);
const cardScore = (card: Card) => card.suit === '♠' ? rankValue(card.rank) : card.rank === '10' && card.suit === '♦' ? 6 : card.rank === 'A' ? 1 : 0;
const targetsFor = (floor: FloorItem[], value: number) => combinations(floor.filter(item => !('kind' in item))).filter(set => set.reduce((total, item) => total + floorItemValue(item), 0) === value);

export function chooseBotAction(state: GameState, playerId: string): BotAction {
  const player = state.players.find(item => item.id === playerId);
  const level: BotLevel = player?.botLevel || 'Beginner';
  const hand = state.hands[playerId] || [];
  if (state.phase === 'calling') {
    const options = hand.filter(card => rankValue(card.rank) >= 9).map(card => rankValue(card.rank));
    return { kind: 'call', value: options.length ? Math.max(...options.filter(value => value <= 13)) : 9 };
  }
  const captures = hand.flatMap(card => targetsFor(state.floor, rankValue(card.rank)).map(targets => ({ card, targets })));
  if (captures.length) {
    const sorted = [...captures].sort((a, b) => b.targets.flatMap(item => 'kind' in item ? item.cards : [item]).reduce((n, card) => n + cardScore(card), 0) - a.targets.flatMap(item => 'kind' in item ? item.cards : [item]).reduce((n, card) => n + cardScore(card), 0));
    const choice = level === 'Beginner' ? captures[0] : sorted[0];
    return { kind: 'capture', cardId: choice.card.id, floorIds: choice.targets.map(item => item.id) };
  }
  if (level !== 'Beginner') {
    const build = hand.filter(card => rankValue(card.rank) >= 9).flatMap(card => targetsFor(state.floor, rankValue(card.rank)).map(targets => ({ card, targets })))[0];
    if (build) return { kind: 'build', cardId: build.card.id, floorIds: build.targets.map(item => item.id) };
  }
  const ordered = [...hand].sort((a, b) => level === 'Expert' ? cardScore(a) - cardScore(b) : rankValue(a.rank) - rankValue(b.rank));
  return { kind: 'drop', cardId: ordered[0]?.id || '' };
}

export function playBot(state: GameState, playerId: string): GameState {
  const action = chooseBotAction(state, playerId);
  if (action.kind === 'call') return call(state, playerId, action.value);
  if (action.kind === 'capture') return capture(state, playerId, action.cardId, action.floorIds);
  if (action.kind === 'build') return buildHouse(state, playerId, action.cardId, action.floorIds);
  return drop(state, playerId, action.cardId);
}
