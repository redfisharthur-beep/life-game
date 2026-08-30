import assert from 'node:assert/strict';
import { GameRoom } from '../src/game-room-auto-action.js';

const GAMES_PER_PLAYER_COUNT = 2500;
const PLAYER_COUNTS = [3, 4, 5, 6];
const MAX_STEPS = 2500;
const PROFESSIONS = ['doctor','engineer','sales','office','athlete','rich','civilServant','artist'];
const ACTIONS = ['salary','buyStock','buyLand','fate','sabotage','help','sellStock','sellLand','dream'];
const STRATEGIES = ['balanced','wealth','dreamer','stock','land','social'];

class MemoryStorage {
  constructor(){ this.map = new Map(); this.alarm = null; }
  async get(k){ return this.map.get(k); }
  async put(k,v){ this.map.set(k,v); }
  async setAlarm(v){ this.alarm = Number(v); }
  async getAlarm(){ return this.alarm; }
  async deleteAlarm(){ this.alarm = null; }
}
function makeState(){ const storage = new MemoryStorage(); return {storage,getWebSockets(){return [];}}; }
function makeEnv(){ return {MATCHMAKER:{idFromName(){return 'global';},get(){return {async fetch(){return new Response('{}');}};}}}; }
function shuffle(a){ const b=[...a]; for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];} return b; }
function pickWeighted(available, weights){
  const candidates = available.map(a => [a, Math.max(0.01, Number(weights[a] ?? 1))]);
  const total = candidates.reduce((s,x)=>s+x[1],0); let r=Math.random()*total;
  for(const [a,w] of candidates){ r-=w; if(r<=0) return a; }
  return candidates.at(-1)[0];
}
const STRATEGY_WEIGHTS = {
  balanced: Object.fromEntries(ACTIONS.map(a=>[a,1])),
  wealth: {salary:2.0,buyStock:1.7,buyLand:1.7,fate:0.8,sabotage:0.7,help:0.6,sellStock:1.0,sellLand:1.0,dream:0.55},
  dreamer: {salary:1.4,buyStock:1.0,buyLand:1.0,fate:1.15,sabotage:0.45,help:1.0,sellStock:1.4,sellLand:1.4,dream:3.0},
  stock: {salary:1.1,buyStock:3.0,buyLand:0.5,fate:1.0,sabotage:0.65,help:0.6,sellStock:1.8,sellLand:0.45,dream:0.8},
  land: {salary:1.1,buyStock:0.5,buyLand:3.0,fate:1.0,sabotage:0.65,help:0.6,sellStock:0.45,sellLand:1.8,dream:0.8},
  social: {salary:0.9,buyStock:0.7,buyLand:0.7,fate:1.25,sabotage:2.2,help:2.2,sellStock:0.7,sellLand:0.7,dream:1.15},
};

async function settle(engine,room,pid,action){
  if(action==='salary') return engine.settleSalary(room,pid,false);
  if(['buyStock','buyLand','sellStock','sellLand'].includes(action)) return engine.settleMarketAction(room,pid,action);
  if(action==='fate') return engine.settleFate(room,pid);
  if(action==='sabotage') return engine.settleSabotage(room,pid);
  if(action==='help') return engine.settleHelp(room,pid);
  if(action==='dream') return engine.settleDream(room,pid);
  return false;
}
function blankProf(){ return {games:0,wins:0,top2:0,happiness:0,assets:0,rankSum:0,actions:Object.fromEntries(ACTIONS.map(a=>[a,0]))}; }
function blankStrategy(){ return {games:0,wins:0,top2:0,happiness:0,assets:0,rankSum:0}; }
const professionStats = Object.fromEntries(PROFESSIONS.map(p=>[p,blankProf()]));
const strategyStats = Object.fromEntries(STRATEGIES.map(s=>[s,blankStrategy()]));
const byCount = Object.fromEntries(PLAYER_COUNTS.map(n=>[n,{games:0,early:0,round30:0,major:0,eraWave:0,actions:Object.fromEntries(ACTIONS.map(a=>[a,0]))}]));
const strategyProfession = {};
let totalSteps=0;

for(const count of PLAYER_COUNTS){
  for(let g=0; g<GAMES_PER_PLAYER_COUNT; g++){
    const engine = new GameRoom(makeState(),makeEnv());
    engine.broadcast=()=>{}; engine.broadcastRoom=async room=>{await engine.saveRoom(room);}; engine.scheduleAt=async()=>{}; engine.reschedule=async()=>{};
    const profs=shuffle(PROFESSIONS).slice(0,count); const strategies=shuffle([...STRATEGIES,...STRATEGIES]).slice(0,count);
    const room={code:`BAL${count}-${g}`,hostId:'p1',players:profs.map((profession,i)=>({id:`p${i+1}`,reconnectToken:`t${i+1}`,connected:true,name:`P${i+1}`,profession,strategy:strategies[i],cash:0,stocks:0,land:0,happiness:0,helpCount:0,sabotageCount:0})),started:true,phase:'profession',professionDeadline:null,game:null};
    await engine.saveRoom(room); await engine.initializeGame(room);
    let steps=0,lastMajor='';
    while(room.phase==='game' && !room.game.finished){
      steps++; totalSteps++; assert.ok(steps<=MAX_STEPS,`stalled ${room.code}`);
      const mk=room.game.majorEvent?`${room.game.majorEvent.id}:${room.game.majorEvent.round}`:'';
      if(mk&&mk!==lastMajor){byCount[count].major++; if(room.game.majorEvent.id==='eraWave')byCount[count].eraWave++; lastMajor=mk;}
      if(Number(room.game.majorEventUntil||0)>0){room.game.majorEventUntil=Date.now()-1;await engine.recoverExpiredGameState(room);continue;}
      if(Number(room.game.transitionUntil||0)>0){room.game.transitionUntil=Date.now()-1;await engine.recoverExpiredGameState(room);continue;}
      if(Number(room.game.showcaseUntil||0)>0){room.game.showcaseUntil=Date.now()-1;await engine.recoverExpiredGameState(room);continue;}
      if(Number(room.game.deadline||0)>0){
        const pid=room.game.currentPlayerId, turnId=room.game.turnId; const p=room.players.find(x=>x.id===pid); assert.ok(p);
        const available=engine.getAvailableAutoActions(room,pid); assert.ok(available.length>0);
        const action=pickWeighted(available,STRATEGY_WEIGHTS[p.strategy]);
        assert.ok(engine.claimTurn(room,pid,turnId)); const ok=await settle(engine,room,pid,action); assert.equal(ok,true,`${room.code} ${action}`);
        byCount[count].actions[action]++; professionStats[p.profession].actions[action]++;
        continue;
      }
      const recovered=await engine.recoverExpiredGameState(room); assert.equal(recovered,true,`idle ${room.code}`);
    }
    assert.equal(room.phase,'finished'); const ranks=room.game.results.rankings; assert.equal(ranks.length,count);
    byCount[count].games++;
    if(String(room.game.lastEvent?.text||'').includes('50歲'))byCount[count].round30++; else byCount[count].early++;
    for(const r of ranks){
      const p=room.players.find(x=>x.id===r.playerId); const ps=professionStats[p.profession], ss=strategyStats[p.strategy];
      ps.games++; ps.wins += r.rank===1; ps.top2 += r.rank<=2; ps.happiness += Number(r.happiness||0); ps.assets += Number(r.totalAssets||0); ps.rankSum += r.rank;
      ss.games++; ss.wins += r.rank===1; ss.top2 += r.rank<=2; ss.happiness += Number(r.happiness||0); ss.assets += Number(r.totalAssets||0); ss.rankSum += r.rank;
      const key=`${p.profession}|${p.strategy}`; strategyProfession[key]??={games:0,wins:0,rankSum:0}; strategyProfession[key].games++; strategyProfession[key].wins+=r.rank===1; strategyProfession[key].rankSum+=r.rank;
    }
  }
}
function summarize(obj){return Object.fromEntries(Object.entries(obj).map(([k,v])=>[k,{games:v.games,winRate:+(100*v.wins/v.games).toFixed(2),top2Rate:+(100*v.top2/v.games).toFixed(2),avgRank:+(v.rankSum/v.games).toFixed(3),avgHappiness:+(v.happiness/v.games).toFixed(2),avgAssets:+(v.assets/v.games).toFixed(1),...(v.actions?{actionShare:Object.fromEntries(ACTIONS.map(a=>[a,+((100*v.actions[a]/Math.max(1,Object.values(v.actions).reduce((s,n)=>s+n,0))).toFixed(2))]))}:{})}]))}
const combo=Object.fromEntries(Object.entries(strategyProfession).filter(([,v])=>v.games>=100).map(([k,v])=>[k,{games:v.games,winRate:+(100*v.wins/v.games).toFixed(2),avgRank:+(v.rankSum/v.games).toFixed(3)}]));
const output={ok:true,totalGames:GAMES_PER_PLAYER_COUNT*PLAYER_COUNTS.length,totalSteps,byPlayerCount:byCount,profession:summarize(professionStats),strategy:summarize(strategyStats),professionStrategy:combo};
console.log(JSON.stringify(output,null,2));
