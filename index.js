// ============================================================
// index.js — Snake Game Logic
// ============================================================


// ===== GRAB HTML ELEMENTS =====
// We select all the elements we need from the HTML file
const gameBoard   = document.getElementById('gameBoard');
const ctx         = gameBoard.getContext('2d'); // 2D drawing context for canvas
const scoreText   = document.getElementById('scoreText');
const bestText    = document.getElementById('bestText');
const speedText   = document.getElementById('speedText');
const startBtn    = document.getElementById('startBtn');
const pauseBtn    = document.getElementById('pauseBtn');
const muteBtn     = document.getElementById('muteBtn');
const speedSelect = document.getElementById('speedSelect');
const overlay     = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlaySub  = document.getElementById('overlaySub');


// ===== GAME SETTINGS =====
// All the fixed values in one place so they're easy to change later

const UNIT_SIZE   = 20;                        // Size of each grid cell in pixels
const COLS        = gameBoard.width  / UNIT_SIZE; // Number of columns (400 / 20 = 20)
const ROWS        = gameBoard.height / UNIT_SIZE; // Number of rows    (400 / 20 = 20)

// Colors used when drawing on the canvas
const COLOR_BG          = '#0f172a'; // Dark board background
const COLOR_GRID        = 'rgba(255,255,255,0.03)'; // Faint grid lines
const COLOR_SNAKE_HEAD  = '#38bdf8'; // Bright blue for the head
const COLOR_SNAKE_BODY  = '#0ea5e9'; // Slightly darker blue for body
const COLOR_SNAKE_BORDER = '#0369a1'; // Border around each snake segment
const COLOR_FOOD        = '#f87171'; // Red food
const COLOR_FOOD_BORDER = '#dc2626'; // Darker red border on food


// ===== GAME STATE VARIABLES =====
// These change as the game runs

let snake;       // Array of {x, y} objects — snake[0] is the head
let dir;         // Current direction the snake is moving {x, y}
let nextDir;     // Buffered next direction (so quick inputs don't get lost)
let food;        // Position of the food {x, y}
let score;       // Player's current score
let running;     // true = game is active, false = stopped
let paused;      // true = game is paused
let loopId;      // Holds the setTimeout ID so we can cancel it

// Load best score from localStorage (persists between page refreshes)
// If nothing is saved yet, default to 0
let bestScore = parseInt(localStorage.getItem('snakeBestScore')) || 0;
bestText.textContent = bestScore;

// Sound mute toggle
let muted = false;


// ===== WEB AUDIO SETUP =====
// We use the Web Audio API to generate sound effects without any audio files
// This is supported in all modern browsers
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// Some browsers block audio until the user interacts with the page.
// This function wakes up the audio context when needed.
function resumeAudio() {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

// ===== PLAY A TONE =====
// A helper function to play a simple beep sound
// type     = wave shape: 'sine', 'square', 'sawtooth', 'triangle'
// freq     = pitch in Hz (higher number = higher pitch)
// duration = how long the sound lasts in seconds
// vol      = volume (0.0 to 1.0)
function playTone(type, freq, duration, vol) {
  if (muted) return; // Do nothing if muted

  try {
    // Create an oscillator (the sound generator)
    var osc = audioCtx.createOscillator();

    // Create a gain node (controls the volume)
    var gain = audioCtx.createGain();

    // Connect: oscillator → gain → speakers
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    // Set the wave type and frequency (pitch)
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

    // Set starting volume
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);

    // Fade the volume out smoothly so it doesn't click at the end
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

    // Start and stop the oscillator
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + duration);

  } catch (e) {
    // Silently fail if audio doesn't work (e.g. old browser)
    console.log('Audio error:', e);
  }
}

// ===== SOUND EFFECTS =====
// Each function plays a specific sound for a game event

// Sound when the snake eats food — two quick rising notes
function soundEat() {
  playTone('square', 520, 0.07, 0.15);
  setTimeout(function() {
    playTone('square', 780, 0.07, 0.14);
  }, 60);
}

// Sound for each step the snake takes — subtle tick
function soundMove() {
  playTone('sine', 160, 0.04, 0.06);
}

// Sound when the game is over — three falling notes
function soundDie() {
  playTone('sawtooth', 220, 0.12, 0.22);
  setTimeout(function() { playTone('sawtooth', 150, 0.18, 0.25); }, 100);
  setTimeout(function() { playTone('sawtooth', 100, 0.22, 0.35); }, 230);
}

// Short beep when pausing or resuming
function soundPause() {
  playTone('sine', 440, 0.1, 0.12);
}


// ===== INITIALIZE (RESET) THE GAME =====
// This runs every time a new game starts
function initGame() {

  // Place the snake in the middle-left of the board, moving right
  // Each object is one segment: {x: column, y: row}
  snake = [
    { x: 6, y: Math.floor(ROWS / 2) },
    { x: 5, y: Math.floor(ROWS / 2) },
    { x: 4, y: Math.floor(ROWS / 2) },
    { x: 3, y: Math.floor(ROWS / 2) },
    { x: 2, y: Math.floor(ROWS / 2) }
  ];

  // Start moving to the right
  dir     = { x: 1, y: 0 };
  nextDir = { x: 1, y: 0 };

  // Reset score display
  score = 0;
  scoreText.textContent = 0;

  // Show the current speed label
  speedText.textContent = getSpeedLabel();

  // Place the first food on the board
  placeFood();
}


// ===== GET SPEED LABEL =====
// Returns "1x", "2x" etc. based on the dropdown value
function getSpeedLabel() {
  var ms = parseInt(speedSelect.value);
  if (ms >= 200) return '1x';
  if (ms >= 130) return '2x';
  if (ms >= 80)  return '3x';
  return '5x';
}


// ===== PLACE FOOD =====
// Picks a random empty cell for the food to appear
function placeFood() {

  // Build a set of all cells currently occupied by the snake
  var occupied = new Set();
  for (var i = 0; i < snake.length; i++) {
    occupied.add(snake[i].x + ',' + snake[i].y);
  }

  // Keep trying random positions until we find an empty one
  var fx, fy;
  do {
    fx = Math.floor(Math.random() * COLS);
    fy = Math.floor(Math.random() * ROWS);
  } while (occupied.has(fx + ',' + fy));

  food = { x: fx, y: fy };
}


// ===== DRAW EVERYTHING ON THE CANVAS =====
// This function redraws the board, snake, and food every tick
function draw() {

  // --- Draw the background ---
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, gameBoard.width, gameBoard.height);

  // --- Draw faint grid lines ---
  ctx.strokeStyle = COLOR_GRID;
  ctx.lineWidth = 0.5;

  // Vertical lines
  for (var col = 0; col <= COLS; col++) {
    ctx.beginPath();
    ctx.moveTo(col * UNIT_SIZE, 0);
    ctx.lineTo(col * UNIT_SIZE, gameBoard.height);
    ctx.stroke();
  }

  // Horizontal lines
  for (var row = 0; row <= ROWS; row++) {
    ctx.beginPath();
    ctx.moveTo(0, row * UNIT_SIZE);
    ctx.lineTo(gameBoard.width, row * UNIT_SIZE);
    ctx.stroke();
  }

  // --- Draw the snake ---
  for (var i = 0; i < snake.length; i++) {
    var segment = snake[i];

    // The head is brighter than the body
    if (i === 0) {
      ctx.fillStyle = COLOR_SNAKE_HEAD;
    } else {
      ctx.fillStyle = COLOR_SNAKE_BODY;
    }

    ctx.strokeStyle = COLOR_SNAKE_BORDER;
    ctx.lineWidth = 1;

    // Head is slightly larger (less padding) than body segments
    var pad = (i === 0) ? 1 : 2;
    var x = segment.x * UNIT_SIZE + pad;
    var y = segment.y * UNIT_SIZE + pad;
    var size = UNIT_SIZE - pad * 2;

    // Draw a rounded rectangle for each segment
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, (i === 0) ? 4 : 3);
    ctx.fill();
    ctx.stroke();
  }

  // --- Draw the food ---
  ctx.fillStyle = COLOR_FOOD;
  ctx.strokeStyle = COLOR_FOOD_BORDER;
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  ctx.roundRect(
    food.x * UNIT_SIZE + 3,
    food.y * UNIT_SIZE + 3,
    UNIT_SIZE - 6,
    UNIT_SIZE - 6,
    4
  );
  ctx.fill();
  ctx.stroke();
}


// ===== ONE GAME TICK =====
// Moves the snake one step and checks what happened
function tick() {

  // Apply the buffered direction
  dir = nextDir;

  // Calculate where the head moves to next
  var newHead = {
    x: snake[0].x + dir.x,
    y: snake[0].y + dir.y
  };

  // Check if the snake hit a wall
  if (newHead.x < 0 || newHead.x >= COLS || newHead.y < 0 || newHead.y >= ROWS) {
    endGame();
    return;
  }

  // Check if the snake hit itself
  for (var i = 0; i < snake.length; i++) {
    if (snake[i].x === newHead.x && snake[i].y === newHead.y) {
      endGame();
      return;
    }
  }

  // Move: add the new head to the front of the array
  snake.unshift(newHead);

  // Check if the snake ate the food
  if (newHead.x === food.x && newHead.y === food.y) {
    // Increase score
    score++;
    scoreText.textContent = score;

    // Update best score if we beat it
    if (score > bestScore) {
      bestScore = score;
      bestText.textContent = bestScore;
      localStorage.setItem('snakeBestScore', bestScore);
    }

    // Place new food somewhere
    placeFood();

    // Play eating sound
    soundEat();

    // Don't remove the tail — snake grows by 1

  } else {
    // Remove the tail so the snake stays the same length
    snake.pop();

    // Play movement sound
    soundMove();
  }

  // Redraw everything
  draw();
}


// ===== GAME LOOP =====
// Calls tick() repeatedly based on the selected speed
function loop() {
  if (!running || paused) return; // Stop if game ended or paused

  tick();

  // Schedule the next tick after the chosen delay (milliseconds)
  loopId = setTimeout(loop, parseInt(speedSelect.value));
}


// ===== START / RESTART GAME =====
function startGame() {
  resumeAudio(); // Wake up audio on first user interaction

  // Cancel any existing loop that might still be running
  clearTimeout(loopId);

  // Set up the snake, food, score etc.
  initGame();

  running = true;
  paused  = false;

  // Hide the overlay (the start/game-over screen)
  overlay.classList.add('hidden');

  // Update button labels
  startBtn.textContent = 'Restart';
  pauseBtn.disabled    = false;
  pauseBtn.textContent = 'Pause';

  // Draw the initial frame
  draw();

  // Start the game loop
  loopId = setTimeout(loop, parseInt(speedSelect.value));
}


// ===== PAUSE / RESUME =====
function togglePause() {
  if (!running) return; // Can't pause if game isn't running

  resumeAudio();
  soundPause();

  paused = !paused; // Flip the paused state

  if (paused) {
    pauseBtn.textContent = 'Resume';
  } else {
    pauseBtn.textContent = 'Pause';
    // Restart the loop since we stopped it when paused
    loopId = setTimeout(loop, parseInt(speedSelect.value));
  }
}


// ===== END GAME =====
function endGame() {
  running = false;
  clearTimeout(loopId);

  // Play game-over sound
  soundDie();

  // Draw the final frame first
  draw();

  // Then draw a dark overlay on top of the canvas
  ctx.fillStyle = 'rgba(0, 0, 0, 0.58)';
  ctx.fillRect(0, 0, gameBoard.width, gameBoard.height);

  // "GAME OVER" text
  ctx.fillStyle = 'white';
  ctx.font = 'bold 30px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('GAME OVER', gameBoard.width / 2, gameBoard.height / 2 - 14);

  // Score line
  ctx.font = '16px Arial';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.70)';

  var scoreMsg = 'Score: ' + score;
  if (score > 0 && score >= bestScore) {
    scoreMsg += '   🏆 New best!';
  }
  ctx.fillText(scoreMsg, gameBoard.width / 2, gameBoard.height / 2 + 18);

  // Prompt to restart
  ctx.fillText('Press Restart to play again', gameBoard.width / 2, gameBoard.height / 2 + 46);

  // Disable pause button — nothing to pause
  pauseBtn.disabled = true;
}


// ===== CHANGE DIRECTION =====
// Called by keyboard or d-pad buttons
// We only allow turning 90 degrees — can't reverse directly
function setDirection(dx, dy) {
  // Only allow the turn if it's perpendicular to current movement
  // e.g. if moving left/right (dir.x != 0), only allow up/down (dy != 0)
  var turningHorizontally = (dx !== 0 && dir.x === 0);
  var turningVertically   = (dy !== 0 && dir.y === 0);

  if (turningHorizontally || turningVertically) {
    nextDir = { x: dx, y: dy };
  }
}


// ===== KEYBOARD CONTROLS =====
// Listen for arrow keys and spacebar
window.addEventListener('keydown', function(e) {

  // Prevent the page from scrolling when arrow keys are pressed
  var blockedKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
  if (blockedKeys.includes(e.code)) {
    e.preventDefault();
  }

  resumeAudio(); // Wake up audio on any key press

  // Space bar: start game or toggle pause
  if (e.code === 'Space') {
    if (running) {
      togglePause();
    } else {
      startGame();
    }
    return;
  }

  // Arrow keys change direction
  if (e.code === 'ArrowUp')    setDirection(0, -1);
  if (e.code === 'ArrowDown')  setDirection(0,  1);
  if (e.code === 'ArrowLeft')  setDirection(-1, 0);
  if (e.code === 'ArrowRight') setDirection(1,  0);
});


// ===== BUTTON EVENT LISTENERS =====

startBtn.addEventListener('click', function() {
  resumeAudio();
  startGame();
});

pauseBtn.addEventListener('click', function() {
  togglePause();
});

// Toggle mute on/off when the mute button is clicked
muteBtn.addEventListener('click', function() {
  resumeAudio();
  muted = !muted;
  muteBtn.textContent = muted ? '🔇' : '🔊';
});


// ===== D-PAD BUTTON LISTENERS =====
// We attach both click (mouse) and touchstart (finger) events
// to each arrow button so they work on all devices

// Helper to attach both events at once
function addDpadListener(buttonId, dx, dy) {
  var btn = document.getElementById(buttonId);

  // Mouse click
  btn.addEventListener('click', function() {
    resumeAudio();
    setDirection(dx, dy);
  });

  // Touch (for mobile) — preventDefault stops the page scrolling
  btn.addEventListener('touchstart', function(e) {
    e.preventDefault(); // Stop the touch from also triggering a click or scroll
    resumeAudio();
    setDirection(dx, dy);
  }, { passive: false });
}

// Register all four d-pad buttons
addDpadListener('dUp',    0, -1); // Up
addDpadListener('dDown',  0,  1); // Down
addDpadListener('dLeft', -1,  0); // Left
addDpadListener('dRight', 1,  0); // Right


// ===== DRAW THE EMPTY BOARD ON PAGE LOAD =====
// So the player sees the dark board before clicking Start
(function drawInitialBoard() {
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, gameBoard.width, gameBoard.height);
})();
