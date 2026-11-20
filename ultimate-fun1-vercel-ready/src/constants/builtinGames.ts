import type { ChallengeDifficulty, GameItem, MediaType } from '../types';

export const BUILTIN_GAMES: GameItem[] = [
  {
    id: 'builtin_snake',
    icon: '🐍',
    name: 'Snake',
    desc: 'Classic snake — eat the apples, avoid the walls!',
    isBuiltin: true,
    code: `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a1628;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#f0f4ff}
h1{font-size:22px;margin-bottom:8px;color:#00b4d8}
#sc{font-size:16px;margin-bottom:10px;color:#ffd60a}
canvas{border:3px solid #00b4d8;border-radius:6px;background:#0d1f3c}
#msg{margin-top:10px;font-size:14px;color:#f72585;min-height:20px}
button{margin-top:10px;padding:8px 24px;background:#00b4d8;border:none;border-radius:20px;color:#0a1628;font-weight:800;font-size:14px;cursor:pointer}
</style></head><body>
<h1>Snake</h1><div id="sc">Score: 0</div>
<canvas id="c" width="400" height="400"></canvas>
<div id="msg">Press Space or Start to play</div>
<button onclick="startGame()">Start</button>
<script>
var CV=document.getElementById("c"),ctx=CV.getContext("2d"),SZ=20,COLS=20,ROWS=20;
var snake,dir,food,score,loop,running=false;
function startGame(){
  snake=[{x:10,y:10}];dir={x:1,y:0};score=0;running=true;
  document.getElementById("msg").textContent="Arrow keys or WASD";
  document.getElementById("sc").textContent="Score: 0";
  placeFood();clearInterval(loop);loop=setInterval(tick,130);
}
function placeFood(){
  do{food={x:Math.floor(Math.random()*COLS),y:Math.floor(Math.random()*ROWS)}}
  while(snake.some(function(s){return s.x===food.x&&s.y===food.y}));
}
function tick(){
  var head={x:snake[0].x+dir.x,y:snake[0].y+dir.y};
  if(head.x<0||head.x>=COLS||head.y<0||head.y>=ROWS||snake.some(function(s){return s.x===head.x&&s.y===head.y})){
    clearInterval(loop);running=false;
    document.getElementById("msg").textContent="Game Over! Score: "+score;return;
  }
  snake.unshift(head);
  if(head.x===food.x&&head.y===food.y){score++;document.getElementById("sc").textContent="Score: "+score;placeFood();}
  else snake.pop();
  draw();
}
function draw(){
  ctx.fillStyle="#0d1f3c";ctx.fillRect(0,0,400,400);
  ctx.fillStyle="#ff4444";ctx.beginPath();ctx.arc(food.x*SZ+SZ/2,food.y*SZ+SZ/2,SZ/2-2,0,Math.PI*2);ctx.fill();
  for(var i=0;i<snake.length;i++){
    ctx.fillStyle=i===0?"#00b4d8":"#0077a8";
    ctx.fillRect(snake[i].x*SZ+1,snake[i].y*SZ+1,SZ-2,SZ-2);
  }
}
document.addEventListener("keydown",function(e){
  if(!running){if(e.key===" ")startGame();return;}
  if((e.key==="ArrowUp"||e.key==="w")&&dir.y===0)dir={x:0,y:-1};
  else if((e.key==="ArrowDown"||e.key==="s")&&dir.y===0)dir={x:0,y:1};
  else if((e.key==="ArrowLeft"||e.key==="a")&&dir.x===0)dir={x:-1,y:0};
  else if((e.key==="ArrowRight"||e.key==="d")&&dir.x===0)dir={x:1,y:0};
});
draw();
</script></body></html>`,
  },
  {
    id: 'builtin_ttt',
    icon: '⭕',
    name: 'Tic-Tac-Toe',
    desc: 'Classic X vs O — 2 players on the same screen!',
    isBuiltin: true,
    code: `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a1628;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;color:#f0f4ff;padding:20px}
h1{font-size:24px;margin-bottom:6px;color:#00b4d8}
#status{font-size:16px;margin-bottom:16px;color:#ffd60a;min-height:24px;text-align:center}
.board{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:270px}
.cell{width:82px;height:82px;background:#1a3a6b;border:2px solid #00b4d8;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:36px;cursor:pointer;transition:.15s}
.cell:hover{background:#1e4a8a}.cell.x{color:#f72585}.cell.o{color:#00b4d8}
.cell.win{background:rgba(0,180,216,.25);border-color:#ffd60a}
button{margin-top:18px;padding:8px 28px;background:#00b4d8;border:none;border-radius:20px;color:#0a1628;font-weight:800;font-size:14px;cursor:pointer}
</style></head><body>
<h1>Tic-Tac-Toe</h1>
<div id="status">Player X's turn</div>
<div class="board" id="board"></div>
<button onclick="reset()">Restart</button>
<script>
var board=Array(9).fill(""),turn="X",over=false;
var wins=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
function render(){
  var b=document.getElementById("board");
  b.innerHTML=board.map(function(v,i){
    return '<div class="cell'+(v?' '+v.toLowerCase():'')+'" onclick="move('+i+')">'+v+"</div>";
  }).join("");
}
function move(i){
  if(board[i]||over)return;
  board[i]=turn;
  var w=wins.find(function(a){return board[a[0]]&&board[a[0]]===board[a[1]]&&board[a[0]]===board[a[2]];});
  render();
  if(w){over=true;w.forEach(function(i){document.querySelectorAll(".cell")[i].classList.add("win");});
    document.getElementById("status").textContent="Player "+turn+" wins!";return;}
  if(board.every(Boolean)){document.getElementById("status").textContent="Draw!";over=true;return;}
  turn=turn==="X"?"O":"X";
  document.getElementById("status").textContent="Player "+turn+"'s turn";
}
function reset(){board=Array(9).fill("");turn="X";over=false;document.getElementById("status").textContent="Player X's turn";render();}
render();
</script></body></html>`,
  },
  {
    id: 'builtin_memory',
    icon: '🃏',
    name: 'Memory Match',
    desc: 'Flip cards and find all matching pairs!',
    isBuiltin: true,
    code: `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a1628;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;color:#f0f4ff;padding:16px}
h1{font-size:22px;margin-bottom:6px;color:#00b4d8}
#info{font-size:14px;color:#ffd60a;margin-bottom:12px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;max-width:340px}
.card{width:72px;height:72px;cursor:pointer;perspective:600px}
.inner{width:100%;height:100%;position:relative;transform-style:preserve-3d;transition:.4s}
.card.flipped .inner,.card.matched .inner{transform:rotateY(180deg)}
.front,.back{position:absolute;width:100%;height:100%;backface-visibility:hidden;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:30px;border:2px solid}
.back{background:#1a3a6b;border-color:#00b4d8;color:#00b4d8;font-size:18px}
.front{background:#0d2448;border-color:#7c3aed;transform:rotateY(180deg)}
.card.matched .front{border-color:#06d6a0;background:rgba(6,214,160,.12)}
button{margin-top:14px;padding:8px 24px;background:#7c3aed;border:none;border-radius:20px;color:#fff;font-weight:800;font-size:13px;cursor:pointer}
</style></head><body>
<h1>Memory Match</h1><div id="info">Moves: 0 | Pairs: 0/8</div>
<div class="grid" id="grid"></div>
<button onclick="init()">New Game</button>
<script>
var EMOJIS=["🐍","⭐","🔥","🎮","💎","🎯","🚀","🌈"];
var cards=[],flipped=[],moves=0,pairs=0,lock=false;
function init(){
  var deck=EMOJIS.concat(EMOJIS).sort(function(){return Math.random()-.5;});
  cards=deck.map(function(e,i){return{id:i,emoji:e,flippedState:false,matched:false};});
  flipped=[];moves=0;pairs=0;lock=false;render();upd();
}
function render(){
  document.getElementById("grid").innerHTML=cards.map(function(c){
    return '<div class="card'+(c.flippedState?" flipped":"")+(c.matched?" matched":"")+'" onclick="flip('+c.id+')"><div class="inner"><div class="back">?</div><div class="front">'+c.emoji+"</div></div></div>";
  }).join("");
}
function upd(){document.getElementById("info").textContent="Moves: "+moves+" | Pairs: "+pairs+"/8"+(pairs===8?" You Win!":"");}
function flip(id){
  if(lock||cards[id].matched||cards[id].flippedState)return;
  cards[id].flippedState=true;flipped.push(id);render();
  if(flipped.length<2)return;
  moves++;
  if(cards[flipped[0]].emoji===cards[flipped[1]].emoji){
    cards[flipped[0]].matched=cards[flipped[1]].matched=true;pairs++;flipped=[];render();upd();
  } else {
    lock=true;setTimeout(function(){
      cards[flipped[0]].flippedState=cards[flipped[1]].flippedState=false;
      flipped=[];lock=false;render();upd();
    },900);
  }
}
init();
</script></body></html>`,
  },
  {
    id: 'builtin_pong',
    icon: '🏓',
    name: 'Pong',
    desc: '2-player Pong — P1: W/S | P2: ↑/↓',
    isBuiltin: true,
    code: `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a1628;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#f0f4ff}
h1{font-size:22px;margin-bottom:8px;color:#00b4d8}
canvas{border:3px solid #00b4d8;border-radius:6px;background:#0d1f3c}
#msg{margin-top:8px;font-size:13px;color:rgba(240,244,255,.5)}
button{margin-top:10px;padding:8px 24px;background:#00b4d8;border:none;border-radius:20px;color:#0a1628;font-weight:800;font-size:14px;cursor:pointer}
</style></head><body>
<h1>Pong</h1>
<canvas id="cv" width="480" height="320"></canvas>
<div id="msg">P1: W/S  |  P2: Up/Down</div>
<button onclick="startGame()">Start</button>
<script>
var CV=document.getElementById("cv"),ctx=CV.getContext("2d"),W=480,H=320,PW=10,PH=60,BALL=8,SPD=3.5;
var p1,p2,ball,score,animId,running=false,keys={};
function startGame(){
  p1={x:10,y:H/2-PH/2};p2={x:W-PW-10,y:H/2-PH/2};
  ball={x:W/2,y:H/2,vx:(Math.random()>.5?1:-1)*SPD,vy:(Math.random()>.5?1:-1)*SPD};
  score={p1:0,p2:0};running=true;cancelAnimationFrame(animId);gameLoop();
}
function gameLoop(){if(!running)return;update();draw();animId=requestAnimationFrame(gameLoop);}
function update(){
  if(keys["w"]&&p1.y>0)p1.y-=5;if(keys["s"]&&p1.y<H-PH)p1.y+=5;
  if(keys["ArrowUp"]&&p2.y>0)p2.y-=5;if(keys["ArrowDown"]&&p2.y<H-PH)p2.y+=5;
  ball.x+=ball.vx;ball.y+=ball.vy;
  if(ball.y<=BALL||ball.y>=H-BALL)ball.vy*=-1;
  if(ball.x<=p1.x+PW&&ball.y>=p1.y&&ball.y<=p1.y+PH){ball.vx=Math.abs(ball.vx)*1.05;}
  if(ball.x>=p2.x-BALL&&ball.y>=p2.y&&ball.y<=p2.y+PH){ball.vx=-Math.abs(ball.vx)*1.05;}
  if(ball.x<0){score.p2++;resetBall();}if(ball.x>W){score.p1++;resetBall();}
  ball.vx=Math.min(Math.max(ball.vx,-12),12);
}
function resetBall(){ball={x:W/2,y:H/2,vx:(Math.random()>.5?1:-1)*SPD,vy:(Math.random()>.5?1:-1)*SPD};}
function draw(){
  ctx.fillStyle="#0d1f3c";ctx.fillRect(0,0,W,H);
  ctx.setLineDash([8,8]);ctx.strokeStyle="rgba(0,180,216,.3)";ctx.beginPath();ctx.moveTo(W/2,0);ctx.lineTo(W/2,H);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle="#f0f4ff";ctx.font="bold 28px sans-serif";ctx.textAlign="center";
  ctx.fillText(score.p1,W/4,36);ctx.fillText(score.p2,3*W/4,36);
  ctx.fillStyle="#00b4d8";ctx.fillRect(p1.x,p1.y,PW,PH);ctx.fillRect(p2.x,p2.y,PW,PH);
  ctx.fillStyle="#ffd60a";ctx.beginPath();ctx.arc(ball.x,ball.y,BALL,0,Math.PI*2);ctx.fill();
}
document.addEventListener("keydown",function(e){keys[e.key]=true;if(["ArrowUp","ArrowDown"," "].includes(e.key))e.preventDefault();});
document.addEventListener("keyup",function(e){keys[e.key]=false;});
draw();
</script></body></html>`,
  },
  {
    id: 'builtin_flappy',
    icon: '🐦',
    name: 'Flappy Bird',
    desc: 'Tap or Space to flap — avoid the pipes!',
    isBuiltin: true,
    code: `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a1628;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#f0f4ff}
h1{font-size:22px;margin-bottom:8px;color:#f72585}
canvas{border:3px solid #f72585;border-radius:6px;cursor:pointer}
#msg{margin-top:8px;font-size:13px;color:rgba(240,244,255,.5)}
</style></head><body>
<h1>Flappy Bird</h1>
<canvas id="cv" width="380" height="480" onclick="flap()"></canvas>
<div id="msg">Click or Space to flap</div>
<script>
var CV=document.getElementById("cv"),ctx=CV.getContext("2d"),W=380,H=480;
var PIPE_W=52,GAP=130,GRAV=0.38,FLAP_V=-6.5,PSPD=2.5;
var bird,pipes,score,frameN,animId,gameState="idle";
function init(){
  bird={x:80,y:H/2,vy:0,r:16};pipes=[];score=0;frameN=0;
  pipes.push(makePipe());
}
function makePipe(){var top=80+Math.random()*(H-GAP-160);return{x:W+10,top:top,bot:top+GAP,scored:false};}
function flap(){
  if(gameState==="idle"||gameState==="dead"){gameState="play";init();}
  bird.vy=FLAP_V;
}
function loop(){
  animId=requestAnimationFrame(loop);
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle="#0a1628";ctx.fillRect(0,0,W,H);
  if(gameState==="idle"){
    ctx.fillStyle="#f0f4ff";ctx.font="bold 18px sans-serif";ctx.textAlign="center";
    ctx.fillText("Tap or Space to Start!",W/2,H/2);
    drawBird();return;
  }
  bird.vy+=GRAV;bird.y+=bird.vy;frameN++;
  if(frameN%80===0)pipes.push(makePipe());
  for(var i=0;i<pipes.length;i++)pipes[i].x-=PSPD;
  pipes=pipes.filter(function(p){return p.x>-PIPE_W;});
  for(var i=0;i<pipes.length;i++){if(!pipes[i].scored&&pipes[i].x+PIPE_W<bird.x){pipes[i].scored=true;score++;}}
  if(bird.y-bird.r<0||bird.y+bird.r>H){gameState="dead";}
  for(var i=0;i<pipes.length;i++){
    if(bird.x+bird.r>pipes[i].x&&bird.x-bird.r<pipes[i].x+PIPE_W){
      if(bird.y-bird.r<pipes[i].top||bird.y+bird.r>pipes[i].bot)gameState="dead";
    }
  }
  for(var i=0;i<pipes.length;i++){
    ctx.fillStyle="#06d6a0";ctx.fillRect(pipes[i].x,0,PIPE_W,pipes[i].top);ctx.fillRect(pipes[i].x,pipes[i].bot,PIPE_W,H-pipes[i].bot);
    ctx.fillStyle="#04b389";ctx.fillRect(pipes[i].x-4,pipes[i].top-18,PIPE_W+8,18);ctx.fillRect(pipes[i].x-4,pipes[i].bot,PIPE_W+8,18);
  }
  drawBird();
  ctx.fillStyle="#ffd60a";ctx.font="bold 22px sans-serif";ctx.textAlign="center";ctx.fillText(score,W/2,38);
  if(gameState==="dead"){
    ctx.fillStyle="rgba(0,0,0,.55)";ctx.fillRect(0,0,W,H);
    ctx.fillStyle="#f72585";ctx.font="bold 28px sans-serif";ctx.textAlign="center";ctx.fillText("Game Over!",W/2,H/2-20);
    ctx.fillStyle="#ffd60a";ctx.font="bold 20px sans-serif";ctx.fillText("Score: "+score,W/2,H/2+14);
    ctx.fillStyle="rgba(240,244,255,.6)";ctx.font="14px sans-serif";ctx.fillText("Tap to retry",W/2,H/2+46);
  }
}
function drawBird(){
  ctx.save();ctx.translate(bird.x,bird.y);
  ctx.rotate(Math.min(Math.max(bird.vy*0.06,-0.4),0.6));
  ctx.font="32px serif";ctx.textAlign="center";ctx.textBaseline="middle";
  ctx.fillText("🐦",0,0);ctx.restore();
}
document.addEventListener("keydown",function(e){if(e.key===" "){e.preventDefault();flap();}});
init();loop();
</script></body></html>`,
  },
  {
    id: 'builtin_wordle',
    icon: '🟩',
    name: 'Word Guess',
    desc: 'Guess the 5-letter word in 6 tries — Wordle style!',
    isBuiltin: true,
    code: `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a1628;display:flex;flex-direction:column;align-items:center;padding:20px;min-height:100vh;font-family:sans-serif;color:#f0f4ff}
h1{font-size:22px;margin-bottom:4px;color:#06d6a0}
#msg{height:22px;font-size:14px;color:#ffd60a;margin-bottom:8px;text-align:center}
#grid{display:grid;grid-template-rows:repeat(6,1fr);gap:6px;margin-bottom:12px}
.row{display:flex;gap:6px}
.tile{width:52px;height:52px;border:2px solid #1a3a6b;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:900;text-transform:uppercase;color:#f0f4ff}
.tile.filled{border-color:#3a5a8b;background:#1a3a6b}
.tile.correct{background:#06d6a0;border-color:#06d6a0;color:#0a1628}
.tile.present{background:#ffd60a;border-color:#ffd60a;color:#0a1628}
.tile.absent{background:#2a3a4b;border-color:#2a3a4b;color:rgba(240,244,255,.5)}
#keyboard{display:flex;flex-direction:column;gap:6px;align-items:center}
.kb-row{display:flex;gap:5px}
.key{min-width:32px;height:40px;padding:0 6px;background:#1a3a6b;border:none;border-radius:6px;color:#f0f4ff;font-weight:800;font-size:13px;cursor:pointer}
.key.correct{background:#06d6a0;color:#0a1628}
.key.present{background:#ffd60a;color:#0a1628}
.key.absent{background:#2a3a4b;color:rgba(240,244,255,.4)}
#new-btn{margin-top:10px;padding:7px 22px;background:#06d6a0;border:none;border-radius:20px;color:#0a1628;font-weight:800;font-size:13px;cursor:pointer}
</style></head><body>
<h1>Word Guess</h1>
<div id="msg">Guess the 5-letter word!</div>
<div id="grid"></div>
<div id="keyboard"></div>
<button id="new-btn" onclick="newGame()">New Word</button>
<script>
var WORDS=["CRANE","FLARE","BRAVE","PIANO","SHINE","BLAZE","FROST","QUEEN","PLUMB","SWIFT","TIGER","CRISP","BLEND","CHAMP","FLOOD","STOMP","TRUCE","VIVID","BOXER","EMBER","FINCH","GNOME","HAZEL","JOKER","KARMA","LINER","MIXED","NOBLE","SPADE","GRIND","ATLAS"];
var target,board,cur,over,keyState;
function newGame(){
  target=WORDS[Math.floor(Math.random()*WORDS.length)];
  board=[];for(var i=0;i<6;i++){var r=[];for(var j=0;j<5;j++)r.push("");board.push(r);}
  cur={row:0,col:0};over=false;keyState={};
  document.getElementById("msg").textContent="Guess the 5-letter word!";
  renderGrid();renderKeyboard();
}
function renderGrid(){
  var html="";
  for(var ri=0;ri<board.length;ri++){
    html+="<div class='row'>";
    for(var ci=0;ci<board[ri].length;ci++){
      var l=board[ri][ci],cls="tile";
      if(ri<cur.row||over){
        if(l===target[ci])cls+=" correct";
        else if(target.indexOf(l)>=0)cls+=" present";
        else if(l)cls+=" absent";
      } else if(ri===cur.row&&l)cls+=" filled";
      html+="<div class='"+cls+"'>"+l+"</div>";
    }
    html+="</div>";
  }
  document.getElementById("grid").innerHTML=html;
}
function renderKeyboard(){
  var rows=["QWERTYUIOP","ASDFGHJKL","ZXCVBNM"];
  var html="";
  for(var i=0;i<rows.length;i++){
    html+="<div class='kb-row'>";
    if(i===2)html+="<button class='key' data-key='DEL'>Del</button>";
    var rowkeys=rows[i].split("");
    for(var j=0;j<rowkeys.length;j++){
      var k=rowkeys[j],st=keyState[k]||"";
      html+="<button class='key "+st+"' data-key='"+k+"'>"+k+"</button>";
    }
    if(i===2)html+="<button class='key' data-key='ENTER'>Enter</button>";
    html+="</div>";
  }
  document.getElementById("keyboard").innerHTML=html;
}
function handleKey(k){
  if(over)return;
  if(k==="DEL"){if(cur.col>0){cur.col--;board[cur.row][cur.col]="";renderGrid();}}
  else if(k==="ENTER"){
    if(cur.col<5){document.getElementById("msg").textContent="Not enough letters!";return;}
    var word=board[cur.row].join("");
    for(var i=0;i<board[cur.row].length;i++){
      var lt=board[cur.row][i];
      if(lt===target[i])keyState[lt]="correct";
      else if(target.indexOf(lt)>=0&&keyState[lt]!=="correct")keyState[lt]="present";
      else if(!keyState[lt])keyState[lt]="absent";
    }
    cur.row++;cur.col=0;
    if(word===target){over=true;document.getElementById("msg").textContent="You got it!";}
    else if(cur.row===6){over=true;document.getElementById("msg").textContent="Word was: "+target;}
    else document.getElementById("msg").textContent="";
    renderGrid();renderKeyboard();
  } else if(/^[A-Z]$/.test(k)&&cur.col<5){board[cur.row][cur.col]=k;cur.col++;renderGrid();}
}
document.getElementById("keyboard").addEventListener("click",function(e){
  var btn=e.target.closest("[data-key]");
  if(btn)handleKey(btn.dataset.key);
});
document.addEventListener("keydown",function(e){
  if(e.key==="Backspace")handleKey("DEL");
  else if(e.key==="Enter")handleKey("ENTER");
  else if(/^[a-zA-Z]$/.test(e.key))handleKey(e.key.toUpperCase());
});
newGame();
</script></body></html>`,
  },
];

export const STARTER_CHALLENGES: Array<{
  id: string;
  title: string;
  desc: string;
  difficulty: ChallengeDifficulty;
  icon: string;
}> = [
  { id: 'starter_ch_1', title: '100 Push-Up Challenge', desc: 'Drop and give me 100 push-ups. No breaks, no excuses!', difficulty: 'hard', icon: '💪' },
  { id: 'starter_ch_2', title: 'Eat Something Spicy', desc: 'Eat the spiciest thing you can find right now. Film the reaction!', difficulty: 'medium', icon: '🌶️' },
  { id: 'starter_ch_3', title: 'Talk in an Accent', desc: 'Speak in a funny accent for the next 10 minutes. No breaking character!', difficulty: 'easy', icon: '🎭' },
  { id: 'starter_ch_4', title: 'The Silent Challenge', desc: "Don't say a single word for 1 full hour. No cheating!", difficulty: 'medium', icon: '🤫' },
  { id: 'starter_ch_5', title: 'Ice Cold Shower', desc: 'Take a 3-minute ice cold shower. Legends only!', difficulty: 'epic', icon: '🥶' },
  { id: 'starter_ch_6', title: 'Text 5 Compliments', desc: 'Send a heartfelt compliment to 5 different people right now.', difficulty: 'easy', icon: '💌' },
];

export const STARTER_MEDIA: Array<{
  id: string;
  url: string;
  caption: string;
  type: MediaType;
}> = [
  { id: 'starter_m_1', url: 'https://media.giphy.com/media/LmNwrBhejkK9EFP504/giphy.gif', caption: 'When the code finally works 🎉', type: 'gif' },
  { id: 'starter_m_2', url: 'https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif', caption: 'Monday morning be like...', type: 'gif' },
  { id: 'starter_m_3', url: 'https://media.giphy.com/media/xT9IgzoKnwFNmISR8I/giphy.gif', caption: 'Me debugging at 2am 😅', type: 'gif' },
  { id: 'starter_m_4', url: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif', caption: 'Friday 5pm hits different 🎉', type: 'gif' },
  { id: 'starter_m_5', url: 'https://media.giphy.com/media/3o6ZsYm7CqR4T4Pz6o/giphy.gif', caption: 'Brain loading... please wait 🧠', type: 'meme' },
  { id: 'starter_m_6', url: 'https://media.giphy.com/media/ZqlvCTNHpqrio/giphy.gif', caption: 'When the plan actually works 😂', type: 'meme' },
];

export const ALL_TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Anchorage', 'America/Honolulu', 'America/Phoenix', 'America/Detroit',
  'America/Indiana/Indianapolis', 'America/Toronto', 'America/Vancouver', 'America/Montreal',
  'America/Mexico_City', 'America/Guatemala', 'America/Bogota', 'America/Lima',
  'America/Santiago', 'America/Buenos_Aires', 'America/Sao_Paulo',
  'Europe/London', 'Europe/Dublin', 'Europe/Lisbon', 'Europe/Paris', 'Europe/Berlin',
  'Europe/Madrid', 'Europe/Rome', 'Europe/Amsterdam', 'Europe/Brussels', 'Europe/Vienna',
  'Europe/Zurich', 'Europe/Stockholm', 'Europe/Oslo', 'Europe/Copenhagen', 'Europe/Helsinki',
  'Europe/Warsaw', 'Europe/Prague', 'Europe/Budapest', 'Europe/Athens', 'Europe/Istanbul',
  'Europe/Moscow', 'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos', 'Africa/Nairobi',
  'Asia/Dubai', 'Asia/Riyadh', 'Asia/Jerusalem', 'Asia/Kolkata', 'Asia/Bangkok',
  'Asia/Singapore', 'Asia/Hong_Kong', 'Asia/Shanghai', 'Asia/Seoul', 'Asia/Tokyo',
  'Australia/Perth', 'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland', 'Etc/UTC',
];

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
