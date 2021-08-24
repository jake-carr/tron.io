const socket = io();

const hostButton = document.getElementById('host');
const joinButton = document.getElementById('join');
const main = document.getElementById('main');

let usernameinput = window.prompt('Username ?');
if (!usernameinput) usernameinput = 'GUEST';

let USER = {
  username: usernameinput,
  socketID: '',
  room: {},
  hosting: false,
  score: 0,
};

function clear() {
  while (main.firstChild) {
    main.firstChild.remove();
  }
  return;
}

/* Home Page */

function hostLobby() {
  const roomName = prompt('Name of Lobby: ');

  function callback(room) {
    USER.room = room;
    USER.hosting = true;
    USER.socketID = room.host.socketId;
    renderLobby(room, USER, null);
    console.log(`Hosting lobby ${room.name} as ${USER.username}`);
  }

  socket.emit('createRoom', roomName, USER, callback);
}

function joinLobby() {
  function callback(rooms) {
    let roomList = document.getElementById('roomList');
    if (!roomList) {
      roomList = document.createElement('div');
      roomList.setAttribute('id', 'roomList');
    }

    while (roomList.firstChild) {
      roomList.firstChild.remove();
    }

    // Title the list if there are rooms
    if (rooms && rooms.length) {
      const title = document.createElement('h2');
      title.innerText = 'Lobbies:';
      roomList.appendChild(title);
    }

    // Make a button for each available room
    for (let room of rooms) {
      const option = document.createElement('button');
      option.innerText = room.name;

      // Function to join a lobby
      option.addEventListener('click', () => {
        function join(lobby) {
          // Lobbies only have 2 player capacity
          if (lobby == 'Error: Room Full') {
            alert('Sorry, that Lobby is full!');
            return;
          } else {
            USER.hosting = false;
            USER.room = lobby;
            console.log(
              `${USER.username} joined lobby: ${lobby.name}`,
            );
            socket.emit('guestJoinedOrLeft', lobby.id, USER);
            renderLobby(lobby, lobby.host.user, USER);
          }
        }
        socket.emit('joinRoom', room.id, join);
      });
      roomList.appendChild(option);
    }

    // If no rooms, display a message and show a Host button instead
    if (!roomList.children.length) {
      clear();

      const noRooms = document.createElement('p');
      noRooms.innerText = 'No lobbies found! :^(';

      const hostInstead = document.createElement('button');
      hostInstead.setAttribute('id', 'host');
      hostInstead.innerText = 'Host a lobby instead';
      hostInstead.addEventListener('click', () => hostLobby());

      roomList.appendChild(noRooms);
      roomList.appendChild(hostInstead);
    }

    // Append list to page and change button text to refresh
    joinButton.innerText = 'Refresh';
    main.appendChild(roomList);
  }

  socket.emit('getRoomNames', callback);
}

hostButton.addEventListener('click', () => hostLobby());
joinButton.addEventListener('click', () => joinLobby());

/* Lobby */
let savedRoomID;

function renderLobby(room, host, guest) {
  clear();

  // Create lobby elements
  const playerList = document.createElement('div');
  const start = document.createElement('button');
  const leave = document.createElement('button');

  start.innerText = 'Start game';
  start.addEventListener('click', () => {
    if (!USER.hosting) {
      alert('Only the host can start the game.');
    } else if (playerList.children.length == 2) {
      savedRoomID = room.id;
      socket.emit(
        'GAME_START_REQUEST',
        room.id,
        host,
        guest,
        initializeGame,
      );
    } else {
      alert('Need two players to start.');
    }
  });

  leave.innerText = 'Leave lobby';
  leave.addEventListener('click', () => {
    if (USER.hosting) {
      // Disconnect socket, let guest know, and refresh page if host
      socket.emit('roomClosed', room.id);
      socket.emit('leaveRoom');
      window.location = location;
    } else {
      // Emit leaving update to the host client first if guest
      socket.emit('guestJoinedOrLeft', room.id, 'GONE');
      socket.emit('leaveRoom');
      window.location = location;
    }
  });

  const lobbyName = room.name;
  const title = document.createElement('h2');
  title.innerText = `You are in lobby: "${lobbyName}" :^)`;

  const hostName = document.createElement('p');
  hostName.classList.add('red');
  hostName.innerText = `Host: ${host.username}`;
  playerList.appendChild(hostName);

  if (guest) {
    const guestName = document.createElement('p');
    guestName.classList.add('blue');
    guestName.innerText = `Guest: ${guest.username}`;
    playerList.appendChild(guestName);
  }

  main.appendChild(title);
  main.appendChild(playerList);
  main.appendChild(start);
  main.appendChild(leave);
}

// Re-render lobby HTML on host side once a guest joins or leaves.
socket.on('renderGuest', (guest) => {
  if (USER.hosting) {
    if (guest == 'GONE') {
      console.log(`They left.`);
      renderLobby(USER.room, USER, null);
    } else {
      console.log(`Guest ${guest.username} joined.`);
      renderLobby(USER.room, USER, guest);
    }
  }
});

// Send guests 'back to the landing page' when the host closes the lobby they were in.
socket.on('BACK_TO_LANDING', () => {
  alert('Sorry, the host closed that lobby :^/');

  clear();

  const title = document.createElement('h2');
  const hostGame = document.createElement('button');
  const joinGame = document.createElement('button');
  const roomList = document.createElement('div');

  title.innerText = 'Welcome to Tron.io';

  hostGame.innerText = 'Host a Lobby';
  hostGame.addEventListener('click', () => hostLobby());

  joinGame.innerText = 'Join a Lobby';
  joinGame.addEventListener('click', () => joinLobby());

  main.appendChild(title);
  main.appendChild(hostGame);
  main.appendChild(joinGame);
  main.appendChild(roomList);

  usernameinput = window.prompt('Username ?');
  if (!usernameinput) usernameinput = 'GUEST';
  USER.username = usernameinput;
});

/* Game */
// Red is always host/source of truth.
let GAME_STATE = {
  red: {
    snake: [{ x: 450, y: 290 }],
    isTurning: false,
    dx: -10,
    dy: 0,
    score: 0,
    name: '',
  },
  blue: {
    snake: [{ x: 460, y: 290 }],
    isTurning: false,
    dx: 10,
    dy: 0,
    score: 0,
    name: '',
  },
};
let gameHasEnded = false;

function initializeGame(
  red_name,
  blue_name,
  red_score = 0,
  blue_score = 0,
  isRestart = false,
) {
  // Setup
  clear();
  if (!isRestart) {
    // Save usernames on first game
    GAME_STATE.red.name = red_name;
    GAME_STATE.blue.name = blue_name;
  } else {
    // Reset to default values on fields other than score and name
    GAME_STATE.red.snake = [{ x: 450, y: 290 }];
    GAME_STATE.red.isTurning = false;
    GAME_STATE.red.dx = -10;
    GAME_STATE.red.dy = 0;
    GAME_STATE.blue.snake = [{ x: 460, y: 290 }];
    GAME_STATE.blue.isTurning = false;
    GAME_STATE.blue.dx = 10;
    GAME_STATE.blue.dy = 0;
  }

  // Create scoreboard elements
  const scoreboard = document.createElement('div');
  scoreboard.setAttribute('id', 'scoreboard');

  const scoreRED = document.createElement('p');
  const scoreBLUE = document.createElement('p');

  scoreRED.innerText = `${red_name}: ${red_score}`;
  scoreRED.classList.add('red');
  scoreBLUE.innerText = `${blue_name}: ${blue_score}`;
  scoreBLUE.classList.add('blue');

  scoreboard.appendChild(scoreRED);
  scoreboard.appendChild(scoreBLUE);

  const arena = document.createElement('CANVAS');
  arena.setAttribute('id', 'arena');
  arena.setAttribute('width', '910');
  arena.setAttribute('height', '500');

  main.appendChild(scoreboard);
  main.appendChild(arena);

  // If user is host, start the game.
  if (USER.hosting) {
    tron();
  }
}

socket.on('GAME_START', (host, guest) => {
  console.log('Game starting.');
  initializeGame(
    host.username,
    guest.username,
    host.score,
    guest.score,
  );
});

socket.on('GAME_RESTART', (gameState) => {
  console.log('New game!');

  // Update score
  GAME_STATE = gameState;
  const { red, blue } = gameState;

  // Begin
  gameHasEnded = false;
  initializeGame(
    red.name,
    blue.name,
    red.score,
    blue.score,
    'restart',
  );
});

socket.on('GAME_END', ({ winner, reason }) => {
  console.log(`
    The game has ended! \n
    Winner: ${winner} \n
    Reason: ${reason}
    `);
  gameHasEnded = true;
  alert(winner == 'tie' ? 'tie game!' : `${winner} wins!`);

  const { red, blue } = GAME_STATE;

  // Update score
  if (winner == 'red') red.score += 1;
  else if (winner == 'blue') blue.score += 1;
  else if (winner == 'tie') {
    red.score += 1;
    blue.score += 1;
  }

  const scoreboard = document.getElementById('scoreboard');
  while (scoreboard.firstChild) {
    scoreboard.firstChild.remove();
  }

  const scoreRED = document.createElement('p');
  const scoreBLUE = document.createElement('p');

  scoreRED.innerText = `${red.name}: ${red.score}`;
  scoreRED.classList.add('red');
  scoreBLUE.innerText = `${blue.name}: ${blue.score}`;
  scoreBLUE.classList.add('blue');

  scoreboard.appendChild(scoreRED);
  scoreboard.appendChild(scoreBLUE);

  // Create restart game button
  const restartButton = document.createElement('button');
  restartButton.innerText = 'New game';
  restartButton.addEventListener('click', () => {
    if (!USER.hosting) {
      alert('Ask the host to restart the game!');
    } else {
      // Emit the updated score
      socket.emit('GAME_RESTART_REQUEST', savedRoomID, GAME_STATE);
    }
  });

  scoreboard.appendChild(restartButton);
});

// Color vars
const colors = {
  red: {
    head: 'rgb(255, 0, 0)',
    body: 'rgb(200, 0, 0)',
    outline: 'rgb(100, 0, 0)',
  },
  blue: {
    head: 'rgb(25, 0, 255)',
    body: 'rgb(20, 0, 200)',
    outline: 'rgb(10, 0, 100)',
  },
};

// Main game function invoked by host client every 125ms.
function tron() {
  if (!gameHasEnded) {
    check_for_win(GAME_STATE); // Emits GAME_END, winner and reason if found.

    setTimeout(function gameLoop() {
      extend(GAME_STATE); // Extend emits GAME_TICKs based on host game state.
      tron(); // Repeat
    }, 125);
  }
}

function check_for_win(gameState) {
  const { red, blue } = gameState;
  let redWins = false;
  let blueWins = false;

  // Look for wall collisions; emit tie or winner, or continue.
  function check_wall_collision(player) {
    const { snake } = player;
    const head = snake[snake.length - 1];
    const hitLeftWall = head.x < 0;
    const hitRightWall = head.x > arena.width - 10;
    const hitTopWall = head.y < 0;
    const hitBottomWall = head.y > arena.height - 10;
    return hitLeftWall || hitRightWall || hitTopWall || hitBottomWall;
  }

  redWins = check_wall_collision(blue);
  blueWins = check_wall_collision(red);
  if (redWins && blueWins) {
    socket.emit('GAME_END_NOTICE', savedRoomID, {
      winner: 'tie',
      reason: 'wall collision',
    });
  } else if (redWins && !blueWins) {
    socket.emit('GAME_END_NOTICE', savedRoomID, {
      winner: 'red',
      reason: 'wall collision',
    });
  } else if (blueWins && !redWins) {
    socket.emit('GAME_END_NOTICE', savedRoomID, {
      winner: 'blue',
      reason: 'wall collision',
    });
  }

  // Check for collisions with self (suicides)
  function check_suicide(player) {
    const { snake } = player;
    const head = snake[snake.length - 1];
    for (let i = 0; i < snake.length - 2; i++) {
      if (snake[i].x == head.x && snake[i].y == head.y) {
        return true;
      }
    }
  }

  redWins = check_suicide(blue);
  blueWins = check_suicide(red);
  if (redWins && blueWins) {
    socket.emit('GAME_END_NOTICE', savedRoomID, {
      winner: 'tie',
      reason: 'suicide',
    });
  } else if (redWins && !blueWins) {
    socket.emit('GAME_END_NOTICE', savedRoomID, {
      winner: 'red',
      reason: 'suicide',
    });
  } else if (blueWins && !redWins) {
    socket.emit('GAME_END_NOTICE', savedRoomID, {
      winner: 'blue',
      reason: 'suicide',
    });
  }

  // Check for head/body collisions; emit tie or a winner, or continue.
  function check_head_body_collisions(red, blue) {
    let red_hit_blue = false;
    let blue_hit_red = false;

    let red_head = red.snake[red.snake.length - 1];
    let blue_head = blue.snake[blue.snake.length - 1];

    // Check if blue's head is colliding with red's body
    for (let i = 0; i < red.snake.length - 2; i++) {
      if (
        red.snake[i].x == blue_head.x &&
        red.snake[i].y == blue_head.y
      ) {
        blue_hit_red = true;
      }
    }
    // Check if red's head is colliding with blue's body
    for (let j = 0; j < blue.snake.length - 2; j++) {
      if (
        blue.snake[j].x == red_head.x &&
        blue.snake[j].y == red_head.y
      ) {
        red_hit_blue = true;
      }
    }
    if (red_hit_blue && blue_hit_red) {
      socket.emit('GAME_END_NOTICE', savedRoomID, {
        winner: 'tie',
        reason: 'player collision',
      });
    } else if (red_hit_blue && !blue_hit_red) {
      socket.emit('GAME_END_NOTICE', savedRoomID, {
        winner: 'blue',
        reason: 'player collision',
      });
    } else if (!red_hit_blue && blue_hit_red) {
      socket.emit('GAME_END_NOTICE', savedRoomID, {
        winner: 'red',
        reason: 'player collision',
      });
    }
  }
  check_head_body_collisions(red, blue);

  // Check for head to head collison; tie if found
  function check_head_to_head_collision() {
    let red_head = red.snake[red.snake.length - 1];
    let blue_head = blue.snake[blue.snake.length - 1];
    if (blue_head.x == red_head.x && blue_head.y == red_head.y) {
      socket.emit('GAME_END_NOTICE', savedRoomID, {
        winner: 'tie',
        reason: 'head to head collision',
      });
    }
  }
  check_head_to_head_collision();
}

// One cycle/tick of the game
function extend(gameState) {
  const { red, blue } = gameState;

  // Create the new heads
  function calculate_position(player) {
    return {
      x: player.snake[player.snake.length - 1].x + player.dx,
      y: player.snake[player.snake.length - 1].y + player.dy,
    };
  }

  // Append new position to bodies
  red.snake.push(calculate_position(red));
  blue.snake.push(calculate_position(blue));

  // Reset isTurning for both
  red.isTurning = false;
  blue.isTurning = false;

  // Emit game update
  socket.emit('GAME_UPDATE', savedRoomID, gameState);
}

// Canvas drawing functions
function draw_board() {
  const arena = document.getElementById('arena');
  const context = arena.getContext('2d');
  // Draw a border around the canvas
  // Background color
  context.fillStyle = 'white';
  // Border color
  context.strokestyle = 'black';
  // Conver canvas with filled rectangle
  context.fillRect(0, 0, arena.width, arena.height);
  // Draw a "border" around the entire canvas
  context.strokeRect(0, 0, arena.width, arena.height);
}

function draw(red, blue) {
  const arena = document.getElementById('arena');
  const context = arena.getContext('2d');

  function draw_cell(color, x, y, is_head) {
    context.fillStyle = is_head
      ? colors[color].head
      : colors[color].body;
    context.strokestyle = colors[color].outline;

    context.fillRect(x, y, 10, 10);
    context.strokeRect(x, y, 10, 10);
  }

  // Draw both players.
  for (let cell of red.snake) {
    let isHead = red.snake.indexOf(cell) == red.snake.length - 1;
    draw_cell('red', cell.x, cell.y, isHead);
  }
  for (let cell of blue.snake) {
    let isHead = blue.snake.indexOf(cell) == blue.snake.length - 1;
    draw_cell('blue', cell.x, cell.y, isHead);
  }
}

socket.on('GAME_TICK', (gameUpdate) => {
  // Update local game state
  GAME_STATE = gameUpdate;
  const { red, blue } = GAME_STATE;

  // Re-render
  draw_board();
  draw(red, blue);
});

// Movement
function handleDirectionChange(event) {
  const room = USER.room;
  if (!room) return;

  const roomId = room.id;
  const keyCode = event.keyCode;
  const controls = {
    37: 'LEFT',
    39: 'RIGHT',
    38: 'UP',
    40: 'DOWN',
  };
  if (!controls[keyCode]) return;

  const direction = controls[keyCode];
  const isRed = USER.hosting;
  const gameState = GAME_STATE;

  socket.emit('directionChange', roomId, isRed, gameState, direction);
}

// Keyboard listener to emit direction change
document.addEventListener('keydown', handleDirectionChange);
