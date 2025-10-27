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
  const speedRange = document.getElementById('speedRange');
  const speedValue = document.getElementById('speedValue');

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

  // Paddle specs (realistic ping pong paddle with circular head and handle)
  const RIGHT_PADDLE_RADIUS = 40; // Radius of circular paddle head
  const LEFT_PADDLE_RADIUS = RIGHT_PADDLE_RADIUS * 1.5; // Player paddle is bigger
  const PADDLE_HANDLE_LENGTH = 35;
  const PADDLE_HANDLE_WIDTH = 8;
  const PADDLE_MARGIN = 60; // Distance from edge to paddle head center
  const PADDLE_SPEED = 5.5; // speed for keyboard movement

  // Ball specs
  const BALL_RADIUS = 8;
  const BALL_SPEED_START = 4.2;
  const BALL_SPEED_INC = 0.25;
  const MAX_BALL_SPEED = 12;
  // UI-controlled speed multiplier (1.0 is normal)
  let speedFactor = 1.0;

  // Game state (x, y now represent center of circular paddle head)
  let leftPaddle = { x: PADDLE_MARGIN, y: H / 2, vy: 0, radius: LEFT_PADDLE_RADIUS };
  let rightPaddle = { x: W - PADDLE_MARGIN, y: H / 2, vy: 0, radius: RIGHT_PADDLE_RADIUS };
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
    // Compute a start speed scaled by the UI multiplier and clamped to MAX_BALL_SPEED * factor
    const base = BALL_SPEED_START + Math.min(hitCount * BALL_SPEED_INC, MAX_BALL_SPEED);
    const maxScaled = MAX_BALL_SPEED * speedFactor;
    const speed = Math.min(base * speedFactor, maxScaled);
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

    // Mouse controls: move left paddle head center to mouse Y within canvas coords
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const y = e.clientY - rect.top;
      mouseActive = true;
      // Clamp paddle head center so it stays within canvas bounds
      leftPaddle.y = Math.max(LEFT_PADDLE_RADIUS, Math.min(y, H - LEFT_PADDLE_RADIUS));
    });  // If mouse leaves, don't keep it active for keyboard fallback
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

  // Speed control: update multiplier and scale current ball velocity immediately
  if (speedRange && speedValue) {
    // initialize display
    speedValue.textContent = parseFloat(speedRange.value).toFixed(2) + 'x';
    speedRange.addEventListener('input', (e) => {
      const newFactor = parseFloat(e.target.value);
      const oldFactor = speedFactor;
      if (newFactor <= 0 || oldFactor <= 0) {
        speedFactor = newFactor || 1.0;
        speedValue.textContent = speedFactor.toFixed(2) + 'x';
        return;
      }
      // scale existing ball velocity so change is immediate
      const ratio = newFactor / oldFactor;
      ball.vx *= ratio;
      ball.vy *= ratio;
      speedFactor = newFactor;
      speedValue.textContent = speedFactor.toFixed(2) + 'x';
    });
  }

  // Helper: circle-to-circle collision (ball with circular paddle head)
  function ballHitsPaddle(ball, paddle) {
    const dx = ball.x - paddle.x;
    const dy = ball.y - paddle.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance <= (ball.radius + paddle.radius);
  }

  // Computer AI: simple predictive follow with limited speed and a small chance of error
  function aiUpdate() {
    // Desired center to track: lead slightly toward predicted ball position
    const leadFactor = 0.10 + Math.min(hitCount * 0.007, 0.18);
    // Predict simple vertical target (now tracking paddle head center)
    let targetY = ball.y + ball.vy * 8 * leadFactor;
    // Add small randomness for human-like mistakes (scales with hitCount)
    const error = (Math.random() - 0.5) * 18 * (1 - Math.min(hitCount / 20, 0.6));
    targetY += error;
    // Move right paddle toward target with capped speed
    const dy = targetY - rightPaddle.y;
    const maxMove = 4.0 + Math.min(hitCount * 0.08, 5);
    if (Math.abs(dy) > 0.5) {
      rightPaddle.y += Math.sign(dy) * Math.min(Math.abs(dy), maxMove);
    }
    // Clamp paddle head center within bounds
    rightPaddle.y = Math.max(RIGHT_PADDLE_RADIUS, Math.min(H - RIGHT_PADDLE_RADIUS, rightPaddle.y));
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
        leftPaddle.y = Math.max(LEFT_PADDLE_RADIUS, Math.min(H - LEFT_PADDLE_RADIUS, leftPaddle.y));
      }    // AI update
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
      // Calculate collision normal (from paddle center to ball center)
      const dx = ball.x - leftPaddle.x;
      const dy = ball.y - leftPaddle.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const nx = dx / dist;
      const ny = dy / dist;

      // Place ball outside paddle to avoid sticking
      ball.x = leftPaddle.x + nx * (leftPaddle.radius + ball.radius + 0.5);
      ball.y = leftPaddle.y + ny * (leftPaddle.radius + ball.radius + 0.5);

      // Reflect velocity off the collision normal
      const dotProduct = ball.vx * nx + ball.vy * ny;
      ball.vx = ball.vx - 2 * dotProduct * nx;
      ball.vy = ball.vy - 2 * dotProduct * ny;

      // Add spin based on impact position (vertical offset from center)
      ball.vy += ny * 2;

      // Increase speed slightly
      const currentSpeed = Math.hypot(ball.vx, ball.vy);
      const maxScaled = MAX_BALL_SPEED * speedFactor;
      const newSpeed = Math.min(currentSpeed + BALL_SPEED_INC, maxScaled);
      const speedRatio = newSpeed / currentSpeed;
      ball.vx *= speedRatio;
      ball.vy *= speedRatio;

      hitCount++;
      beep(1600, 0.04, 'sine', 0.04);
    }

    // Right paddle
    if (ball.vx > 0 && ballHitsPaddle(ball, rightPaddle)) {
      // Calculate collision normal (from paddle center to ball center)
      const dx = ball.x - rightPaddle.x;
      const dy = ball.y - rightPaddle.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const nx = dx / dist;
      const ny = dy / dist;

      // Place ball outside paddle to avoid sticking
      ball.x = rightPaddle.x + nx * (rightPaddle.radius + ball.radius + 0.5);
      ball.y = rightPaddle.y + ny * (rightPaddle.radius + ball.radius + 0.5);

      // Reflect velocity off the collision normal
      const dotProduct = ball.vx * nx + ball.vy * ny;
      ball.vx = ball.vx - 2 * dotProduct * nx;
      ball.vy = ball.vy - 2 * dotProduct * ny;

      // Add spin based on impact position (vertical offset from center)
      ball.vy += ny * 2;

      // Increase speed slightly
      const currentSpeed = Math.hypot(ball.vx, ball.vy);
      const maxScaled = MAX_BALL_SPEED * speedFactor;
      const newSpeed = Math.min(currentSpeed + BALL_SPEED_INC, maxScaled);
      const speedRatio = newSpeed / currentSpeed;
      ball.vx *= speedRatio;
      ball.vy *= speedRatio;

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

  // Draw a realistic ping pong paddle with circular head and handle
  function drawPaddle(paddle, isLeft, color) {
    ctx.save();

    // Handle extends from paddle head toward center of screen
    const handleDir = isLeft ? 1 : -1;
    const handleEndX = paddle.x + handleDir * PADDLE_HANDLE_LENGTH;

    // Draw handle
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = PADDLE_HANDLE_WIDTH;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(paddle.x, paddle.y);
    ctx.lineTo(handleEndX, paddle.y);
    ctx.stroke();

    // Draw circular paddle head
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(paddle.x, paddle.y, paddle.radius, 0, Math.PI * 2);
    ctx.fill();

    // Add a darker rubber surface on the paddle face
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.arc(paddle.x, paddle.y, paddle.radius - 3, 0, Math.PI * 2);
    ctx.fill();

    // Add edge highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(paddle.x, paddle.y, paddle.radius - 1, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
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
    drawPaddle(leftPaddle, true, 'rgba(22,163,74,0.9)');
    drawPaddle(rightPaddle, false, 'rgba(220,38,38,0.9)');

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
          leftPaddle.y = Math.max(LEFT_PADDLE_RADIUS, leftPaddle.y);
        }
        if (keyState.ArrowDown) {
          leftPaddle.y += PADDLE_SPEED;
          leftPaddle.y = Math.min(H - LEFT_PADDLE_RADIUS, leftPaddle.y);
        }
      }
      draw();
    }
  }, 30);

  // Expose initial help text
  statusEl.textContent = 'Click or press Space to start. Use mouse or Up/Down arrows to move.';

})();