export type Card = { id: string; suit: string; rank: string };
export type Player = { id: string; name: string };
export type GameState = {
  phase: 'waiting' | 'dealing';
  players: Player[];
  hands: Record<string, Card[]>;
  floor: Card[];
  secondHalf: Card[];
  deck: Card[];
  hostPlayerId: string;
  turnPlayerId: string | null;
  calledValue: number | null;
};

const suits = ['♠', '♥', '♦', '♣'];
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function deck(): Card[] {
  return suits.flatMap(s => ranks.map(r => ({ id: r + s, suit: s, rank: r })));
}

export function shuffle(d: Card[]): Card[] {
  let a = [...d];
  for (let i = a.length - 1; i > 0; i--) {
    let j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function deal(players: Player[], cut: number) {
  let d = shuffle(deck());
  let c = Math.max(1, Math.min(51, cut));
  d = [...d.slice(c), ...d.slice(0, c)];

  let numPlayers = players.length;
  let cardsPerPlayer = numPlayers === 2 ? 4 : 3; // 2 players = 4 cards each, 3-4 players = 3 cards each
  let totalDealt = numPlayers * cardsPerPlayer + 4; // hands + floor

  let hands: Record<string, Card[]> = {};
  let idx = 0;
  for (let p of players) {
    hands[p.id] = d.slice(idx, idx + cardsPerPlayer);
    idx += cardsPerPlayer;
  }

  let floor = d.slice(idx, idx + 4);
  idx += 4;

  let deckRemaining = d.slice(idx);

  return {
    hands,
    floor,
    deck: deckRemaining,
    secondHalf: d.slice(26)
  };
}