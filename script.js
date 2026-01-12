// Haunted Mansion — Ghost Scare
// Canvas platformer with simple physics and WebAudio ambient sounds.
// Controls: ArrowLeft/ArrowRight to move, ArrowUp to jump, Shift to sprint, Space to scare.

(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let W = canvas.width = window.innerWidth;
  let H = canvas.height = window.innerHeight;

  // UI
  const scoreEl = document.getElementById('score');
  const levelEl = document.getElementById('level');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlaySub = document.getElementById('overlay-sub');
  const restartBtn = document.getElementById('restart');
  const audioToggle = document.getElementById('audioEnabled');

  // Game constants
  const gravity = 0.9;
  const friction = 0.85;
  const baseSpeed = 3.2;
  const sprintMultiplier = 1.6;
  const jumpStrength = 15;
  const scareRadius = 80;
  const detectionRadius = 160;
  const requiredScoreToWin = 10;

  // Camera and level layout: levels are horizontal pages
  let currentLevelIndex = 0;
  const levelWidth = 1600; // world width per level
  const levels = createLevels();

  // Player (ghost)
  const player = {
    x: 120,
    y: 0,
    w: 40,
    h: 48,
    vx: 0, vy: 0,
    onGround: false,
    facing: 1,
    color: '#e8fbff',
    scareCooldown: 0,
  };

  let keys = {};
  let score = 0;
  let lastTime = 0;
  let cameraOffsetX = 0;

  // Audio (WebAudio)
  let audioCtx, rainNode, thunderTimer = null;
  let audioEnabled = audioToggle.checked;

  audioToggle.addEventListener('change', (e) => {
    audioEnabled = e.target.checked;
    if (audioEnabled) startAudio(); else stopAudio();
  });

  function startAudio(){
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // create gentle rain noise loop
    const bufferSize = audioCtx.sampleRate * 3;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i=0;i<bufferSize;i++){
      // noise shaped to lower volume with random bursts
      data[i] = (Math.random()*2-1) * (Math.random()>0.995 ? 0.6 : 0.12);
    }
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const lowpass = audioCtx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 4500;
    const gain = audioCtx.createGain();
    gain.gain.value = 0.08;
    src.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(audioCtx.destination);
    src.start();

    rainNode = {src, gain};

    // occasional thunder
    thunderTimer = setInterval(()=>{ if (Math.random()<0.28) playThunder(); }, 4500);
  }

  function stopAudio(){
    if (!audioCtx) return;
    try {
      rainNode.src.stop();
      rainNode.gain.disconnect();
    } catch(e){}
    audioCtx.close();
    audioCtx = null;
    rainNode = null;
    clearInterval(thunderTimer);
    thunderTimer = null;
  }

  function playThunder(){
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80 + Math.random()*40, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.35, t + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 2.4);
    const bq = audioCtx.createBiquadFilter();
    bq.type = 'lowpass';
    bq.frequency.value = 800;
    osc.connect(bq);
    bq.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(t + 2.3);
  }

  function playScream(){
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    // a short shrill descending oscillator + noise
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.exponentialRampToValueAtTime(700, t + 0.12);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.6, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(t + 1.0);

    // quick noise bite
    const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.18, audioCtx.sampleRate);
    const d = buffer.getChannelData(0);
    for (let i=0;i<d.length;i++) d[i] = (Math.random()*2-1) * (1 - i/d.length);
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    const filt = audioCtx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = 800;
    src.connect(filt);
    filt.connect(audioCtx.destination);
    src.start();
  }

  function playAlarm(){
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(900, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.00001, t + 0.35);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(t + 0.36);
  }

  // Create levels programmatically (platform rectangles and kids)
  function createLevels(){
    // Each level is width = levelWidth; Y origin top; ground at H - 120 (will be recomputed)
    const levels = [];

    // level 1 (entry hall)
    levels.push({
      name: "Foyer",
      bg: "#0b0f14",
      platforms: [
        {x:0,y:450,w:levelWidth,h:40}, // ground
        {x:200,y:360,w:160,h:18},
        {x:420,y:300,w:120,h:18},
        {x:620,y:340,w:140,h:18},
        {x:900,y:320,w:160,h:18},
        {x:1200,y:360,w:140,h:18}
      ],
      kids: [
        {x:260,y:330,facing:1,scared:false,seen:false,falling:false,vy:0},
        {x:950,y:290,facing:-1,scared:false,seen:false,falling:false,vy:0}
      ]
    });

    // level 2 (library)
    levels.push({
      name: "Library",
      bg: "#0b0f12",
      platforms: [
        {x:0,y:450,w:levelWidth,h:40},
        {x:100,y:360,w:180,h:18},
        {x:360,y:300,w:160,h:18},
        {x:560,y:240,w:120,h:18},
        {x:800,y:320,w:220,h:18},
        {x:1200,y:300,w:200,h:18}
      ],
      kids: [
        {x:140,y:330,facing:1,scared:false,seen:false,falling:false,vy:0},
        {x:570,y:210,facing:-1,scared:false,seen:false,falling:false,vy:0},
        {x:1230,y:270,facing:-1,scared:false,seen:false,falling:false,vy:0}
      ]
    });

    // level 3 (ballroom)
    levels.push({
      name: "Ballroom",
      bg: "#07121a",
      platforms: [
        {x:0,y:460,w:levelWidth,h:40},
        {x:180,y:380,w:160,h:18},
        {x:420,y:340,w:160,h:18},
        {x:680,y:300,w:160,h:18},
        {x:980,y:350,w:160,h:18},
        {x:1300,y:300,w:240,h:18}
      ],
      kids: [
        {x:360,y:310,facing:1,scared:false,seen:false,falling:false,vy:0},
        {x:720,y:270,facing:-1,scared:false,seen:false,falling:false,vy:0}
      ]
    });

    return levels;
  }

  // Input handlers
  window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    // prevent page scroll on space/arrow
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
    if (e.key === ' ' && overlay.classList.contains('hidden')) {
      attemptScare();
    }
  });
  window.addEventListener('keyup', (e) => keys[e.key] = false);

  // Resize
  window.addEventListener('resize', () => {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  });

  // Restart
  restartBtn.addEventListener('click', () => {
    overlay.classList.add('hidden');
    resetGame();
  });

  function resetGame(){
    score = 0;
    currentLevelIndex = 0;
    // reset kids
    levels.forEach(l => l.kids.forEach(k => {
      k.scared = false; k.seen = false; k.falling = false; k.vy = 0;
    }));
    player.x = 120; player.y = 200; player.vx = 0; player.vy = 0;
    updateUI();
    overlay.classList.add('hidden');
    if (audioEnabled && !audioCtx) startAudio();
  }

  // Game loop
  function gameLoop(t){
    const dt = Math.min(34, t - lastTime);
    lastTime = t;
    step(dt/16.66);
    render();
    requestAnimationFrame(gameLoop);
  }

  function step(dt){
    const level = levels[currentLevelIndex];

    // Input
    let speed = baseSpeed * (keys.Shift ? sprintMultiplier : 1);
    if (keys.ArrowLeft) {
      player.vx -= 0.6 * (speed/3.2);
      player.facing = -1;
    }
    if (keys.ArrowRight) {
      player.vx += 0.6 * (speed/3.2);
      player.facing = 1;
    }

    // Jump
    if (keys.ArrowUp && player.onGround) {
      player.vy = -jumpStrength;
      player.onGround = false;
    }

    // Apply physics
    player.vy += gravity * (dt/1);
    player.x += player.vx * (dt/1);
    player.y += player.vy * (dt/1);

    // friction
    if (player.onGround) player.vx *= 0.86;
    else player.vx *= 0.995;

    // Keep player within world horizontally for this level (allow transition at edges)
    // If player crosses right edge -> next level
    if (player.x > levelWidth - 40) {
      if (currentLevelIndex < levels.length - 1) {
        currentLevelIndex++;
        // move player to left edge of next level
        player.x = 40;
      } else {
        // clamp
        player.x = levelWidth - 40;
        player.vx = 0;
      }
    }
    if (player.x < 0) {
      if (currentLevelIndex > 0) {
        currentLevelIndex--;
        player.x = levelWidth - 48;
      } else {
        player.x = 0;
        player.vx = 0;
      }
    }

    // Platform collisions
    player.onGround = false;
    for (let plat of level.platforms) {
      // simple AABB collision (player from top)
      const px = player.x + player.w/2;
      if (px > plat.x && px < plat.x + plat.w) {
        // vertical check
        const playerBottom = player.y + player.h;
        if (playerBottom > plat.y && playerBottom - player.vy <= plat.y ) {
          // land
          player.y = plat.y - player.h;
          player.vy = 0;
          player.onGround = true;
        }
      }
    }

    // Limit falling
    if (player.y > H + 200) {
      // fell out -> bring to current level ground
      const ground = level.platforms[0];
      player.y = ground.y - player.h;
      player.vy = 0;
      player.vx = 0;
    }

    // Update camera offset (center on player but constrained)
    cameraOffsetX = player.x - W/2;
    cameraOffsetX = Math.max(0, Math.min(levelWidth - W, cameraOffsetX));

    // Kids behavior
    for (let kid of level.kids) {
      if (kid.scared) {
        // falling animation if falling flagged
        if (kid.falling) {
          kid.vy += gravity * (dt/1);
          kid.y += kid.vy * (dt/1);
        }
        continue;
      }

      // If player is in detection radius and approaching from front
      const dx = (player.x + player.w/2) - kid.x;
      const dy = (player.y + player.h/2) - (kid.y + 5);
      const dist = Math.hypot(dx, dy);

      const approachingFromFront = (kid.facing === 1 && dx > 0) || (kid.facing === -1 && dx < 0);

      if (!kid.seen && approachingFromFront && Math.abs(dy) < 60 && Math.abs(dx) < detectionRadius) {
        // kid sees you
        kid.seen = true;
        // penalty
        score = Math.max(0, score - 1);
        playAlarm();
        updateUI();
      }
    }

    // Scare cooldown
    if (player.scareCooldown > 0) player.scareCooldown -= dt;
    updateUI();

    // Win check
    if (score >= requiredScoreToWin) {
      showOverlay(true);
      stopAudio();
    }
  }

  // Attempt to scare nearby kids
  function attemptScare(){
    if (player.scareCooldown > 0) return;
    player.scareCooldown = 18; // ~18 frames cooldown
    const level = levels[currentLevelIndex];
    let didScare = false;
    for (let kid of level.kids) {
      if (kid.scared) continue;
      const kx = kid.x;
      const ky = kid.y;
      const dx = (player.x + player.w/2) - kx;
      const dy = (player.y + player.h/2) - (ky + 10);
      const dist = Math.hypot(dx, dy);
      if (dist < scareRadius) {
        if (kid.seen) {
          // too late — already seen — lose a point (if not already penalized earlier)
          // But we've already penalized on detection, so show a small negative feedback
          score = Math.max(0, score - 0); // no double penalty here
        } else {
          // successful scare
          kid.scared = true;
          kid.falling = true;
          kid.vy = -6;
          playScream();
          score += 1;
          didScare = true;
        }
      }
    }
    if (!didScare) {
      // small whoosh/noise feedback (optional)
      if (audioCtx) {
        const t = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.frequency.value = 1100;
        osc.type = 'triangle';
        g.gain.setValueAtTime(0.0001,t);
        g.gain.exponentialRampToValueAtTime(0.05,t+0.01);
        g.gain.exponentialRampToValueAtTime(0.00001,t+0.25);
        osc.connect(g); g.connect(audioCtx.destination);
        osc.start(); osc.stop(t+0.26);
      }
    }
    updateUI();
  }

  // Render
  function render(){
    const level = levels[currentLevelIndex];

    // background: simple moonlight + mansion silhouette
    ctx.clearRect(0,0,W,H);

    // gradient sky
    const grad = ctx.createLinearGradient(0,0,0,H);
    grad.addColorStop(0, '#0a0f18');
    grad.addColorStop(0.6, '#08101a');
    grad.addColorStop(1, '#041018');
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,W,H);

    // distant mansion silhouette using simple shapes
    ctx.save();
    ctx.translate(-cameraOffsetX * 0.2, H*0.08);
    ctx.fillStyle = '#07101a';
    ctx.globalAlpha = 0.95;
    drawMansionSilhouette(ctx, W + cameraOffsetX * 0.4, H);
    ctx.restore();
    ctx.globalAlpha = 1;

    // rain overlay
    drawRain(ctx);

    // platforms
    ctx.save();
    ctx.translate(-cameraOffsetX,0);
    for (let plat of level.platforms) {
      ctx.fillStyle = '#1b242e';
      roundedRect(ctx, plat.x, plat.y, plat.w, plat.h, 6);
      ctx.fill();

      // highlight top
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(plat.x+6, plat.y, Math.max(0, plat.w-12), 4);
    }

    // kids (NPCs)
    for (let kid of level.kids) {
      drawKid(ctx, kid);
    }

    // player (ghost)
    drawGhost(ctx, player);
    ctx.restore();

    // overlay HUD items drawn on top via HTML (score/level)
  }

  function updateUI(){
    scoreEl.textContent = `Score: ${score}`;
    levelEl.textContent = `Level: ${currentLevelIndex + 1} — ${levels[currentLevelIndex].name}`;
  }

  // Drawing helpers
  function drawGhost(ctx, p){
    const gx = p.x + p.w/2;
    const gy = p.y + p.h/2;
    ctx.save();
    ctx.translate(gx - cameraOffsetX, gy);
    // body
    ctx.shadowColor = 'rgba(200,250,255,0.6)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = `rgba(236,249,255,0.96)`;
    ctx.beginPath();
    ctx.ellipse(0, -8, 28, 32, 0, Math.PI*0, Math.PI*2);
    ctx.fill();
    // sheet bottom waves
    ctx.beginPath();
    for (let i=0;i<5;i++){
      const x = -28 + i*12;
      ctx.quadraticCurveTo(x+6, 14 + (i%2?4:0), x+12, 6);
    }
    ctx.lineTo(24, 18);
    ctx.lineTo(-28,18);
    ctx.fill();

    // eyes
    ctx.fillStyle = '#071428';
    ctx.beginPath(); ctx.ellipse(-8,-12,4,6,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(8,-12,4,6,0,0,Math.PI*2); ctx.fill();

    // subtle glow
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = 'cyan';
    ctx.beginPath(); ctx.ellipse(0,-6,60,44,0,0,Math.PI*2); ctx.fill();

    ctx.restore();
  }

  function drawKid(ctx, kid){
    const kx = kid.x;
    const ky = kid.y;
    ctx.save();
    ctx.translate(kx - cameraOffsetX, ky);
    // body
    if (kid.scared) {
      ctx.fillStyle = '#d4d4d4';
    } else {
      ctx.fillStyle = '#ffd9d0';
    }
    ctx.beginPath();
    ctx.ellipse(0, -8, 12, 18, 0, 0, Math.PI*2);
    ctx.fill();

    // head
    ctx.beginPath();
    ctx.fillStyle = '#ffe5d9';
    ctx.ellipse(0,-18,10,10,0,0,Math.PI*2);
    ctx.fill();

    // eyes/mouth tiny
    ctx.fillStyle = '#222';
    if (!kid.scared) {
      ctx.fillRect(-3, -20, 2, 2);
      ctx.fillRect(3, -20, 2, 2);
      ctx.fillRect(-1, -12, 2, 2);
    } else {
      // fallen/eyes closed
      ctx.fillRect(-2, -18, 10, 2);
    }

    // hat/hood for haunted child
    ctx.fillStyle = '#7f5a9b';
    ctx.fillRect(-8, -28, 16, 6);

    // small indicator if seen
    if (kid.seen && !kid.scared) {
      ctx.fillStyle = 'rgba(255,40,40,0.95)';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText('!', 12, -20);
    }

    ctx.restore();
  }

  function drawMansionSilhouette(ctx, w, h){
    ctx.beginPath();
    // simple castle-ish shape
    ctx.rect(0, h*0.38, w*0.12, h*0.62);
    ctx.rect(w*0.08, h*0.2, w*0.1, h*0.18);
    ctx.rect(w*0.18, h*0.3, w*0.12, h*0.48);
    ctx.rect(w*0.36, h*0.28, w*0.16, h*0.5);
    ctx.rect(w*0.62, h*0.25, w*0.14, h*0.53);
    ctx.rect(w*0.78, h*0.32, w*0.12, h*0.46);
    ctx.fill();
  }

  // rain effect (simple lines)
  function drawRain(ctx){
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = 'rgba(200,220,255,0.06)';
    ctx.lineWidth = 1;
    for (let i=0;i<120;i++){
      const x = (i * 73 + (lastTime*0.04)) % (W);
      const y = (i * 23) % H;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x+6, y+18);
      ctx.stroke();
    }
    ctx.restore();
  }

  // small util: rounded rect
  function roundedRect(ctx, x, y, w, h, r){
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y, x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x, y+h, r);
    ctx.arcTo(x, y+h, x, y, r);
    ctx.arcTo(x, y, x+w, y, r);
    ctx.closePath();
  }

  function showOverlay(victory=false){
    overlay.classList.remove('hidden');
    if (victory){
      overlayTitle.textContent = 'You Win!';
      overlaySub.textContent = `You scoured ${score} scares — the haunted mansion trembles.`;
    } else {
      overlayTitle.textContent = 'Game Over';
      overlaySub.textContent = '';
    }
  }

  // Start
  updateUI();
  // initial audio
  if (audioEnabled) startAudio();
  // place player on level 0 ground
  player.y = levels[0].platforms[0].y - player.h;
  requestAnimationFrame(gameLoop);

  // expose reset for debugging
  window.__resetGhostGame = resetGame;

})();
