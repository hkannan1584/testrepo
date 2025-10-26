// Simple Pong game
// Controls: Move mouse over canvas to control left paddle. Up/Down arrow keys also move left paddle.
// Click or press Space to start/pause. Reset button resets scores.

(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const statusEl = document.getElementById('status');
  const resetBtn = document.getElementById('resetBtn');
  const soundToggle = document.getElementById('soundToggle');

  // Canvas scaling for crisp rendering on high-dpi screens
  function fitCanvas() {
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(cssWidth * ratio);
    canvas.height = Math.floor(cssHeight * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  // initial fit and on resize
  fitCanvas();
  window.addEventListener('resize', fitCanvas);

  // Game dimensions (in CSS pixels)
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;

  // Paddle specs
  const PADDLE_WIDTH = 12;
  const PADDLE_HEIGHT = 100;
  const PADDLE_MARGIN = 16;
  const PADDLE_SPEED = 5.5; // speed for keyboard movement

  // Ball specs
  const BALL_RADIUS = 8;
  const BALL_SPEED_START = 4.2;
  const BALL_SPEED_INC = 0.25;
  const MAX_BALL_SPEED = 12;

  // Game state
  let leftPaddle = { x: PADDLE_MARGIN, y: (H - PADDLE_HEIGHT) / 2, vy: 0 };
  let rightPaddle = { x: W - PADDLE_MARGIN - PADDLE_WIDTH, y: (H - PADDLE_HEIGHT) / 2, vy: 0 };
  let ball = { x: W / 2, y: H / 2, vx: 0, vy: 0, radius: BALL_RADIUS };
  let scores = { left: 0, right: 0 };
  let running = false;
  let lastTime = 0;
  let hitCount = 0;
  let keyState = { ArrowUp: false, ArrowDown: false };
  let mouseActive = false;
  let serveTimeout = null;
  let audioEnabled = true;

  // Sounds (tiny beeps generated via WebAudio)
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  function beep(freq, duration = 0.06, type = 'sine', gain = 0.03) {
    if (!audioEnabled) return;
    try {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = gain;
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
      o.stop(audioCtx.currentTime + duration + 0.02);
    } catch (e) { /* ignore */ }
  }

  // Update scoreboard text
  function updateScoreboard() {
    scoreEl.textContent = `Player ${scores.left} : ${scores.right} Computer`;
  }
  updateScoreboard();

  // Reset ball to center and pause slightly before serving toward side (-1 left, +1 right)
  function resetBall(serveTo = (Math.random() < 0.5 ? 1 : -1)) {
    ball.x = W / 2;
    ball.y = H / 2;
    const angle = (Math.random() * 0.6 - 0.3); // slight random vertical component
    const speed = BALL_SPEED_START + Math.min(hitCount * BALL_SPEED_INC, MAX_BALL_SPEED);
    ball.vx = serveTo * speed * Math.cos(angle);
    ball.vy = speed * Math.sin(angle);
  }

  // Start or pause the game
  function toggleRunning() {
    running = !running;
    statusEl.textContent = running ? 'Playing — use mouse or Up/Down to move' : 'Paused — click or press Space to start';
    if (running) {
      lastTime = performance.now();
      requestAnimationFrame(loop);
      // resume audio context on user gesture if suspended
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }
  }

  // Keyboard controls
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      toggleRunning();
      return;
    }
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      keyState[e.code] = true;
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      keyState[e.code] = false;
    }
  });

  // Mouse controls: move left paddle center to mouse Y within canvas coords
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    mouseActive = true;
    leftPaddle.y = Math.max(Math.min(y - PADDLE_HEIGHT / 2, H - PADDLE_HEIGHT), 0);
  });

  // If mouse leaves, don't keep it active for keyboard fallback
  canvas.addEventListener('mouseleave', () => mouseActive = false);

  // Click on canvas toggles start/pause and resumes audio context
  canvas.addEventListener('click', () => {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    toggleRunning();
  });

  // Reset button
  resetBtn.addEventListener('click', () => {
    scores.left = 0;
    scores.right = 0;
    updateScoreboard();
    statusEl.textContent = 'Scores reset. Click or press Space to start';
    running = false;
  });

  // Sound toggle
  soundToggle.addEventListener('change', () => {
    audioEnabled = soundToggle.checked;
  });

  // Helper: rectangle-circle collision (ball with paddle)
  function ballHitsPaddle(ball, paddle) {
    const nearestX = Math.max(paddle.x, Math.min(ball.x, paddle.x + PADDLE_WIDTH));
    const nearestY = Math.max(paddle.y, Math.min(ball.y, paddle.y + PADDLE_HEIGHT));
    const dx = ball.x - nearestX;
    const dy = ball.y - nearestY;
    return (dx * dx + dy * dy) <= (ball.radius * ball.radius);
  }

  // Computer AI: simple predictive follow with limited speed and a small chance of error
  function aiUpdate() {
    // Desired center to track: lead slightly toward predicted ball position
    const leadFactor = 0.10 + Math.min(hitCount * 0.007, 0.18);
    // Predict simple vertical target
    let targetY = ball.y - PADDLE_HEIGHT / 2 + ball.vy * 8 * leadFactor;
    // Add small randomness for human-like mistakes (scales with hitCount)
    const error = (Math.random() - 0.5) * 18 * (1 - Math.min(hitCount / 20, 0.6));
    targetY += error;
    // Move right paddle toward target with capped speed
    const dy = targetY - rightPaddle.y;
    const maxMove = 4.0 + Math.min(hitCount * 0.08, 5);
    if (Math.abs(dy) > 0.5) {
      rightPaddle.y += Math.sign(dy) * Math.min(Math.abs(dy), maxMove);
    }
    // Clamp
    rightPaddle.y = Math.max(0, Math.min(H - PADDLE_HEIGHT, rightPaddle.y));
  }

  // Main game loop
  function loop(now) {
    if (!running) return;
    const dt = Math.min((now - lastTime) / 16.6667, 4); // frame-normalized (approx 60fps baseline)
    lastTime = now;

    // Keyboard paddle movement only when mouse has not been recently used
    if (!mouseActive) {
      if (keyState.ArrowUp) leftPaddle.y -= PADDLE_SPEED * dt * 1.6;
      if (keyState.ArrowDown) leftPaddle.y += PADDLE_SPEED * dt * 1.6;
      leftPaddle.y = Math.max(0, Math.min(H - PADDLE_HEIGHT, leftPaddle.y));
    }

    // AI update
    aiUpdate();

    // Move ball
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    // Wall collisions (top/bottom)
    if (ball.y - ball.radius <= 0) {
      ball.y = ball.radius;
      ball.vy = -ball.vy;
      beep(900, 0.03, 'triangle', 0.02);
    } else if (ball.y + ball.radius >= H) {
      ball.y = H - ball.radius;
      ball.vy = -ball.vy;
      beep(900, 0.03, 'triangle', 0.02);
    }

    // Paddle collisions
    // Left paddle
    if (ball.vx < 0 && ballHitsPaddle(ball, leftPaddle)) {
      // place ball outside to avoid sticking
      ball.x = leftPaddle.x + PADDLE_WIDTH + ball.radius + 0.5;
      // reflect
      ball.vx = -ball.vx;
      // change vertical speed based on hit position
      const rel = (ball.y - (leftPaddle.y + PADDLE_HEIGHT / 2)) / (PADDLE_HEIGHT / 2);
      ball.vy += rel * 3;
      // increase speed slightly
      const sign = Math.sign(ball.vx);
      const speed = Math.min(Math.hypot(ball.vx, ball.vy) + BALL_SPEED_INC, MAX_BALL_SPEED);
      const ang = Math.atan2(ball.vy, ball.vx);
      ball.vx = Math.cos(ang) * speed;
      ball.vy = Math.sin(ang) * speed;
      hitCount++;
      beep(1600, 0.04, 'sine', 0.04);
    }

    // Right paddle
    if (ball.vx > 0 && ballHitsPaddle(ball, rightPaddle)) {
      ball.x = rightPaddle.x - ball.radius - 0.5;
      ball.vx = -ball.vx;
      const rel = (ball.y - (rightPaddle.y + PADDLE_HEIGHT / 2)) / (PADDLE_HEIGHT / 2);
      ball.vy += rel * 3;
      const speed = Math.min(Math.hypot(ball.vx, ball.vy) + BALL_SPEED_INC, MAX_BALL_SPEED);
      const ang = Math.atan2(ball.vy, ball.vx);
      ball.vx = Math.cos(ang) * speed;
      ball.vy = Math.sin(ang) * speed;
      hitCount++;
      beep(1200, 0.04, 'sine', 0.04);
    }

    // Score: left misses (ball beyond left) -> point to computer
    if (ball.x + ball.radius < 0) {
      scores.right++;
      updateScoreboard();
      beep(220, 0.12, 'sawtooth', 0.06);
      running = false;
      statusEl.textContent = 'Point for Computer. Click or press Space to serve.';
      hitCount = 0;
      resetBall(-1); // serve to left next
      return;
    }

    // Score: right misses -> point to player
    if (ball.x - ball.radius > W) {
      scores.left++;
      updateScoreboard();
      beep(440, 0.12, 'sawtooth', 0.06);
      running = false;
      statusEl.textContent = 'Point for Player. Click or press Space to serve.';
      hitCount = 0;
      resetBall(1);
      return;
    }

    // Draw everything
    draw();

    requestAnimationFrame(loop);
  }

  // Drawing routine
  function draw() {
    // Clear background
    ctx.clearRect(0, 0, W, H);

    // center dashed line
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(W / 2, 12);
    ctx.lineTo(W / 2, H - 12);
    ctx.stroke();
    ctx.restore();

    // paddles
    ctx.fillStyle = 'rgba(22,163,74,0.9)';
    roundRect(ctx, leftPaddle.x, leftPaddle.y, PADDLE_WIDTH, PADDLE_HEIGHT, 4, true, false);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(ctx, rightPaddle.x, rightPaddle.y, PADDLE_WIDTH, PADDLE_HEIGHT, 4, true, false);

    // ball
    ctx.beginPath();
    ctx.fillStyle = 'white';
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 8;
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // simple scoreboard inside canvas
    ctx.font = '14px Inter, Arial';
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillText('Player', 18, 22);
    ctx.fillText('Computer', W - 96, 22);
  }

  // Rounded rectangle helper
  function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    if (r === undefined) r = 5;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  // Initialize ball (not moving until first serve)
  resetBall(Math.random() < 0.5 ? 1 : -1);
  running = false;

  // Focus canvas to receive keyboard input on click
  canvas.addEventListener('focus', () => {});
  canvas.focus();

  // Make sure the initial canvas scale is accurate when loaded
  window.addEventListener('load', fitCanvas);

  // Also allow arrow keys to affect paddle position through animation frames even when not active with mouse
  // Expose a simple game tick to keep arrow-driven movement working while paused (not moving ball)
  setInterval(() => {
    if (!running) {
      // update left paddle with keys if not using mouse
      if (!mouseActive) {
        if (keyState.ArrowUp) {
          leftPaddle.y -= PADDLE_SPEED;
          leftPaddle.y = Math.max(0, leftPaddle.y);
        }
        if (keyState.ArrowDown) {
          leftPaddle.y += PADDLE_SPEED;
          leftPaddle.y = Math.min(H - PADDLE_HEIGHT, leftPaddle.y);
        }
      }
      draw();
    }
  }, 30);

  // Expose initial help text
  statusEl.textContent = 'Click or press Space to start. Use mouse or Up/Down arrows to move.';

})();