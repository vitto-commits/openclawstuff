'use client';

import { useEffect, useRef, useCallback } from 'react';

// Supabase config
const SB_URL = 'https://jyujiaawtjmlxamemwgd.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5dWppYWF3dGptbHhhbWVtd2dkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk2NzgwNSwiZXhwIjoyMDg4NTQzODA1fQ.7BAVAOffyHzRNmvv4nOwto5dabY1ZmMlWOGrD2BPecA';

interface AgentDef {
  id: string; name: string; emoji: string; role: string; device: string;
  model: string; status: string; skills: string[]; last_active: string;
  color: string; hair: string; outfit: string; accent: string;
  gridX: number; gridY: number;
  px: number; py: number; animTick: number;
  walking: boolean; walkTarget: {x:number,y:number}|null; walkPause: number;
  chatBubble: string; chatTimer: number; nextWalk: number;
}

const COLORS: Record<string,{color:string,hair:string,outfit:string,accent:string}> = {
  otto:   {color:'#6aabf7',hair:'#b8d8f8',outfit:'#1e4080',accent:'#7eb8f7'},
  varis:  {color:'#b878f0',hair:'#d8b8f8',outfit:'#5a1a90',accent:'#c084f8'},
  kira:   {color:'#f0c030',hair:'#f8e880',outfit:'#806010',accent:'#ffe050'},
  luna:   {color:'#9ab8d0',hair:'#c8dae8',outfit:'#405868',accent:'#b0d0e8'},
  shadow: {color:'#606870',hair:'#383838',outfit:'#181818',accent:'#505860'},
  qck:    {color:'#f09838',hair:'#f8c888',outfit:'#804810',accent:'#f8b060'},
  yuki:   {color:'#f06088',hair:'#f8a0b8',outfit:'#901838',accent:'#f880a0'},
  titan:  {color:'#50c060',hair:'#90e0a0',outfit:'#186028',accent:'#68d878'},
  dahlia: {color:'#e888b0',hair:'#f8b8d0',outfit:'#883860',accent:'#f098c0'},
};

const T = 32, COLS = 14, ROWS = 15;
const W = COLS * T, H = ROWS * T;

// Desk positions (column indices in tiles)
const DC = [2, 6, 10];
const DR = [3, 7, 11];

// Points of interest
const POIS = [
  {x:12*T,y:4*T},{x:12*T,y:6*T},{x:1*T+16,y:2*T+16},
  {x:1*T+16,y:7*T},{x:4*T,y:13*T+8},{x:W-2*T,y:7*T}
];

const EMOJIS = ['☕','👍','🔧','📊','💡','🤔','⚡','🎯','🚀','✨'];

export default function PixelOffice() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const agentsRef = useRef<AgentDef[]>([]);
  const tickRef = useRef(0);
  const animRef = useRef<number>(0);

  const initAgents = useCallback(() => {
    const order = ['otto','varis','kira','luna','shadow','qck','yuki','titan','dahlia'];
    return order.map((id, i) => {
      const c = COLORS[id] || COLORS.otto;
      const gx = i % 3, gy = Math.floor(i / 3);
      return {
        id, name: id.charAt(0).toUpperCase()+id.slice(1), emoji: '',
        role: '', device: '', model: '', status: 'idle', skills: [], last_active: '',
        ...c, gridX: gx, gridY: gy,
        px: DC[gx]*T+T, py: DR[gy]*T+T, animTick: Math.floor(Math.random()*100),
        walking: false, walkTarget: null, walkPause: 0,
        chatBubble: '', chatTimer: 0, nextWalk: 300+Math.floor(Math.random()*400),
      } as AgentDef;
    });
  }, []);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch(`${SB_URL}/rest/v1/agent_status?select=*`, {
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
      });
      const data = await res.json();
      if (!Array.isArray(data)) return;
      const agents = agentsRef.current;
      for (const d of data) {
        const a = agents.find(x => x.id === d.id);
        if (a) {
          a.name = d.name || a.name; a.emoji = d.emoji || ''; a.role = d.role || '';
          a.device = d.device || ''; a.model = d.model || ''; a.status = d.status || 'offline';
          a.skills = d.skills || []; a.last_active = d.last_active || '';
        }
      }
    } catch (e) { console.warn('Fetch failed:', e); }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = W; canvas.height = H;
    agentsRef.current = initAgents();
    fetchAgents();
    const interval = setInterval(fetchAgents, 30000);

    function drawFloor() {
      for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++) {
        const c = (x+y)%2===0 ? '#3a2818' : '#342414';
        ctx!.fillStyle = (x===0||x===COLS-1||y===0||y===ROWS-1)?'#1a1210':c;
        ctx!.fillRect(x*T,y*T,T,T);
      }
      // Corridor highlights
      for (let y=0;y<ROWS;y++) { ctx!.fillStyle='#40301880'; ctx!.fillRect(5*T,y*T,T,T); ctx!.fillRect(9*T,y*T,T,T); }
    }

    function drawWalls() {
      ctx!.fillStyle='#1a0e08'; ctx!.fillRect(0,0,W,T);
      ctx!.fillStyle='#241810'; ctx!.fillRect(0,0,T,H); ctx!.fillRect(W-T,0,T,H);
      // Windows
      for (const wy of [3,5,7,9,11]) {
        ctx!.fillStyle='#182840'; ctx!.fillRect(2,wy*T+4,T-4,T-8);
        ctx!.fillStyle='#284060'; ctx!.fillRect(4,wy*T+6,T-8,T-12);
        ctx!.fillStyle='#1a324880'; ctx!.fillRect(W-T+2,wy*T+4,T-4,T-8);
        ctx!.fillStyle='#28406080'; ctx!.fillRect(W-T+4,wy*T+6,T-8,T-12);
      }
      // Sign
      const tick = tickRef.current;
      ctx!.fillStyle='#0a0608'; ctx!.fillRect(3*T,2,8*T,T-4);
      const glow = 0.6+0.4*Math.sin(tick*0.02);
      ctx!.fillStyle=`rgba(240,200,112,${glow})`; ctx!.font='bold 18px monospace'; ctx!.textAlign='center';
      ctx!.fillText('🛡️ RAAGAS HQ', W/2, T-8);
      // Door
      ctx!.fillStyle='#2a1a10'; ctx!.fillRect(6*T+4,(ROWS-1)*T,2*T-8,T);
      ctx!.fillStyle='#4a3020'; ctx!.fillRect(6*T+8,(ROWS-1)*T+4,2*T-16,T-4);
      ctx!.fillStyle='#f0c870'; ctx!.fillRect(7*T+8,(ROWS-1)*T+T/2-2,4,4);
    }

    function drawDesk(x:number,y:number,a:AgentDef,tick:number) {
      const active = a.status==='active';
      // Desk surface
      ctx!.fillStyle='#5a4430'; ctx!.fillRect(x,y+8,T*1.6,T*0.8);
      ctx!.fillStyle='#6a5440'; ctx!.fillRect(x+2,y+10,T*1.6-4,T*0.8-4);
      // Monitor
      const mg = active ? `rgba(100,180,255,${0.5+0.3*Math.sin(tick*0.08)})` : '#1a1a1a';
      ctx!.fillStyle='#222'; ctx!.fillRect(x+T*0.5,y,T*0.6,T*0.5);
      ctx!.fillStyle=mg; ctx!.fillRect(x+T*0.5+2,y+2,T*0.6-4,T*0.5-6);
      // Chair
      if (a.status!=='offline'&&!a.walking) {
        ctx!.fillStyle='#2a2a2a'; ctx!.fillRect(x+T*0.5,y+T+4,T*0.5,T*0.4);
      }
    }

    function drawCharacter(x:number,y:number,a:AgentDef,tick:number) {
      if (a.status==='offline') return;
      const bob = a.walking ? Math.sin(tick*0.3)*2 : (a.status==='active' ? Math.sin(tick*0.1)*1.5 : Math.sin(tick*0.04)*0.8);
      const cy = y + bob;
      // Body
      ctx!.fillStyle=a.outfit; ctx!.fillRect(x-5,cy-2,10,10);
      // Head
      ctx!.fillStyle=a.hair; ctx!.beginPath(); ctx!.arc(x,cy-6,6,0,Math.PI*2); ctx!.fill();
      // Face
      ctx!.fillStyle='#f0d0b0'; ctx!.beginPath(); ctx!.arc(x,cy-5,4,0,Math.PI*2); ctx!.fill();
      // Eyes
      ctx!.fillStyle='#222'; ctx!.fillRect(x-2,cy-6,1.5,1.5); ctx!.fillRect(x+1,cy-6,1.5,1.5);
      // Legs
      if (a.walking) {
        const legOff = Math.sin(tick*0.3)*3;
        ctx!.fillStyle=a.outfit; ctx!.fillRect(x-3,cy+8,3,4+legOff); ctx!.fillRect(x+1,cy+8,3,4-legOff);
      } else {
        ctx!.fillStyle=a.outfit; ctx!.fillRect(x-3,cy+8,3,4); ctx!.fillRect(x+1,cy+8,3,4);
      }
      // Arms typing
      if (!a.walking && a.status==='active') {
        const armOff = Math.sin(tick*0.2)*2;
        ctx!.fillStyle=a.outfit; ctx!.fillRect(x-8,cy+armOff,3,6); ctx!.fillRect(x+5,cy-armOff,3,6);
      }
    }

    function drawLabel(x:number,y:number,a:AgentDef) {
      if (a.status==='offline') { 
        ctx!.globalAlpha=0.3; ctx!.fillStyle='#888'; ctx!.font='8px monospace'; ctx!.textAlign='center';
        ctx!.fillText(a.name, DC[a.gridX]*T+T, DR[a.gridY]*T-4); ctx!.globalAlpha=1; return;
      }
      ctx!.font='bold 8px monospace'; ctx!.textAlign='center'; ctx!.fillStyle=a.accent;
      ctx!.fillText(`${a.emoji} ${a.name}`, x, y-16);
      // Status dot
      const sc = a.status==='active'?'#40ff80':a.status==='idle'?'#ffd040':'#606878';
      ctx!.fillStyle=sc; ctx!.beginPath(); ctx!.arc(x+ctx!.measureText(a.name).width/2+10,y-19,3,0,Math.PI*2); ctx!.fill();
    }

    function drawChatBubble(x:number,y:number,emoji:string,timer:number) {
      const alpha = Math.min(1, timer/20);
      ctx!.globalAlpha=alpha;
      ctx!.fillStyle='#fff'; ctx!.beginPath();
      const bx=x+10, by=y-30;
      ctx!.roundRect(bx-10,by-10,20,16,4); ctx!.fill();
      ctx!.fillStyle='#000'; ctx!.font='10px sans-serif'; ctx!.textAlign='center';
      ctx!.fillText(emoji, bx, by+2);
      ctx!.globalAlpha=1;
    }

    function drawFurniture(tick:number) {
      // Water cooler
      ctx!.fillStyle='#4488aa'; ctx!.fillRect(12*T,4*T,12,20);
      ctx!.fillStyle='#88ccee'; ctx!.fillRect(12*T+2,4*T+2,8,10);
      // Coffee machine
      ctx!.fillStyle='#443322'; ctx!.fillRect(12*T,6*T,14,14);
      ctx!.fillStyle='#ff6633'; ctx!.fillRect(12*T+4,6*T+4,3,3);
      // Whiteboard
      ctx!.fillStyle='#ddd'; ctx!.fillRect(T+4,2*T,T*2,T*1.2);
      ctx!.fillStyle='#f8f8f8'; ctx!.fillRect(T+6,2*T+2,T*2-4,T*1.2-4);
      ctx!.strokeStyle='#aaa'; ctx!.lineWidth=0.5;
      ctx!.strokeRect(T+6,2*T+2,T*2-4,T*1.2-4);
      // Scribbles
      ctx!.strokeStyle='#3388dd'; ctx!.lineWidth=1;
      ctx!.beginPath(); ctx!.moveTo(T+12,2*T+10); ctx!.lineTo(T+40,2*T+14); ctx!.stroke();
      ctx!.strokeStyle='#dd4444';
      ctx!.beginPath(); ctx!.moveTo(T+12,2*T+22); ctx!.lineTo(T+50,2*T+18); ctx!.stroke();
      // Server rack
      ctx!.fillStyle='#1a1a2a'; ctx!.fillRect(W-2*T,7*T,T*0.8,T*1.5);
      for (let i=0;i<5;i++) {
        const on = Math.sin(tick*0.1+i*2)>0;
        ctx!.fillStyle=on?'#40ff80':'#1a3a1a'; ctx!.fillRect(W-2*T+4,7*T+4+i*8,3,3);
        ctx!.fillStyle=on?'#ff4040':'#3a1a1a'; ctx!.fillRect(W-2*T+10,7*T+4+i*8,3,3);
      }
      // Plants
      const plants = [[T+12,5*T],[T+12,10*T],[W-T-12,5*T],[W-T-12,10*T]];
      for (const [px,py] of plants) {
        ctx!.fillStyle='#5a3a20'; ctx!.fillRect(px-4,py+4,8,8);
        ctx!.fillStyle='#2a8a2a'; ctx!.beginPath(); ctx!.arc(px,py,8,0,Math.PI*2); ctx!.fill();
        ctx!.fillStyle='#3aaa3a'; ctx!.beginPath(); ctx!.arc(px-2,py-2,4,0,Math.PI*2); ctx!.fill();
      }
      // Couch
      ctx!.fillStyle='#4a2a3a'; ctx!.fillRect(3*T,13*T+4,T*2.5,T*0.6);
      ctx!.fillStyle='#6a3a4a'; ctx!.fillRect(3*T+2,13*T+6,T*2.5-4,T*0.6-4);
    }

    function updateAgent(a:AgentDef) {
      if (a.status==='offline') return;
      a.animTick++;
      if (a.chatTimer>0) a.chatTimer--;

      if (a.walking && a.walkTarget) {
        const dx=a.walkTarget.x-a.px, dy=a.walkTarget.y-a.py;
        const dist=Math.sqrt(dx*dx+dy*dy);
        if (dist<2) {
          if (a.walkPause>0) { a.walkPause--; return; }
          // Check if back at desk
          const homeX=DC[a.gridX]*T+T, homeY=DR[a.gridY]*T+T;
          if (Math.abs(a.px-homeX)<4 && Math.abs(a.py-homeY)<4) {
            a.walking=false; a.walkTarget=null;
            a.nextWalk=300+Math.floor(Math.random()*600);
          } else {
            a.walkTarget={x:homeX,y:homeY}; a.walkPause=0;
          }
        } else {
          a.px+=dx/dist*1.2; a.py+=dy/dist*1.2;
        }
        // Chat bubble when near another agent
        const agents = agentsRef.current;
        for (const o of agents) {
          if (o.id===a.id||o.status==='offline') continue;
          if (Math.abs(a.px-o.px)<20&&Math.abs(a.py-o.py)<20&&a.chatTimer<=0&&Math.random()<0.02) {
            a.chatBubble=EMOJIS[Math.floor(Math.random()*EMOJIS.length)];
            a.chatTimer=60;
          }
        }
      } else if (a.status==='active') {
        a.nextWalk--;
        if (a.nextWalk<=0) {
          const poi=POIS[Math.floor(Math.random()*POIS.length)];
          a.walking=true; a.walkTarget={x:poi.x,y:poi.y}; a.walkPause=90;
        }
      }
    }

    function render() {
      const tick = tickRef.current;
      ctx!.clearRect(0,0,W,H);
      drawFloor();
      drawWalls();
      drawFurniture(tick);

      const agents = agentsRef.current;
      agents.forEach(a => updateAgent(a));

      // Draw desks
      agents.forEach(a => drawDesk(DC[a.gridX]*T, DR[a.gridY]*T, a, tick));

      // Draw agents sorted by Y
      const sorted = [...agents].sort((a,b)=>a.py-b.py);
      sorted.forEach(a => {
        drawCharacter(a.px, a.py, a, a.animTick);
        drawLabel(a.px, a.py, a);
        if (a.chatBubble && a.chatTimer>0) drawChatBubble(a.px, a.py, a.chatBubble, a.chatTimer);
      });

      tickRef.current++;
      animRef.current = requestAnimationFrame(render);
    }

    render();
    return () => { cancelAnimationFrame(animRef.current); clearInterval(interval); };
  }, [initAgents, fetchAgents]);

  return (
    <div className="w-full flex flex-col items-center gap-4">
      <div className="border border-gray-200 rounded-xl overflow-hidden shadow-lg bg-[#0a0a0e]" style={{maxWidth:'580px',width:'100%'}}>
        <canvas
          ref={canvasRef}
          style={{width:'100%',height:'auto',imageRendering:'pixelated',display:'block'}}
        />
      </div>
      <p className="text-xs text-gray-400">Live from Supabase · Auto-refreshes every 30s</p>
    </div>
  );
}
