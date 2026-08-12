import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from './supabase';
import { deal } from './game';
import './styles.css';

const id = () => crypto.randomUUID();
const room = () => new URLSearchParams(location.search).get('room')?.toUpperCase() || '';

function App() {
  const [pid] = useState(() => sessionStorage.getItem('baazi-pid') || id());
  const [name, setName] = useState('');
  const [code, setCode] = useState(room());
  const [s, setS] = useState<any | null>(null);
  const [cut, setCut] = useState(26);
  const [msg, setMsg] = useState('');

  useEffect(() => sessionStorage.setItem('baazi-pid', pid), [pid]);

  async function create() {
    let c = Math.random().toString(36).slice(2, 8).toUpperCase();
    let st: any = {
      phase: 'waiting',
      players: [],
      hands: {},
      floor: [],
      secondHalf: [],
      deck: [],
      hostPlayerId: pid,
      turnPlayerId: null,
      calledValue: null
    };
    let { error } = await supabase.from('baazi_rooms').insert({ code: c, state: st });
    if (error) return setMsg(error.message);
    setCode(c);
    history.replaceState({}, '', `?room=${c}`);
    setMsg('Share the link with your family.');
  }

  async function join() {
    let { data, error } = await supabase
      .from('baazi_rooms')
      .select('*')
      .eq('code', code.toUpperCase())
      .single();
    if (error || !data) return setMsg('Table not found.');
    let st = data.state as any;
    if (!st.players.some(p => p.id === pid)) {
      if (st.players.length >= 4) return setMsg('Table full.');
      st = {
        ...st,
        players: [...st.players, { id: pid, name: name.trim() || 'Player' }]
      };
      let u = await supabase
        .from('baazi_rooms')
        .update({ state: st })
        .eq('code', code.toUpperCase());
      if (u.error) return setMsg(u.error.message);
    }
    setS(st);
    history.replaceState({}, '', `?room=${code.toUpperCase()}`);
  }

  useEffect(() => {
    if (!code) return;
    join();
    let ch = supabase
      .channel('room-' + code)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'baazi_rooms',
          filter: `code=eq.${code}`
        },
        p => p.new && setS((p.new as any).state)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [code]);

  async function deal() {
    if (!s) return setMsg('No game state.');
    if (s.players.length < 2) return setMsg('Need at least 2 players.');
    let x = deal(s.players, cut);
    let n = {
      ...s,
      phase: 'dealing',
      ...x,
      turnPlayerId: s.players[0]?.id || null
    };
    await supabase.from('baazi_rooms').update({ state: n }).eq('code', code);
    setS(n);
  }

  let me = s?.hands[pid] || [];
  let show = (c: any) => c.rank + c.suit;

  return (
    <main>
      <header>
        <b>BAAZI</b>
        <small>Aajo baazi la layiye.</small>
      </header>
      {!s ? (
        <section>
          <h1>Family table.</h1>
          <input
            placeholder="Your name"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <div>
            <input
              placeholder="Room code"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
            />
            <button onClick={join}>Join</button>
          </div>
          <button onClick={create}>Create table</button>
          <p>{msg}</p>
        </section>
      ) : (
        <>
          <section className="table">
            <div className="players">
              {s.players.map(p => (
                <span key={p.id}>{p.name}</span>
              ))}
            </div>
            <h3>FLOOR</h3>
            <div className="cards">
              {s.floor.map(c => (
                <i key={c.id}>{show(c)}</i>
              ))}
            </div>
            <h3>
              {s.players.find(p => p.id === pid)?.name} · {me.length} cards
            </h3>
            <div className="cards">
              {me.map(c => (
                <i key={c.id}>{show(c)}</i>
              ))}
            </div>
          </section>
          <section>
            <p>Room: {code}</p>
            {s.phase === 'waiting' && s.hostPlayerId === pid && s.players.length >= 2 && (
              <>
                <label>Cut position: {cut}</label>
                <input
                  type="range"
                  min="1"
                  max="51"
                  value={cut}
                  onChange={e => setCut(+e.target.value)}
                />
                <button onClick={deal}>Deal cards</button>
              </>
            )}
            {s.phase === 'dealing' && (
              <p>Turn: {s.players.find((p: any) => p.id === s.turnPlayerId)?.name}</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);